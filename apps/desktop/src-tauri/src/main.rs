#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Arc, Mutex}, path::PathBuf};
use tauri::Emitter;
use uuid::Uuid;
use tracing::{info, error};
mod proto_index;
use proto_index::{scanner::find_proto_files, parser::parse_file, ParsedService};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProtoRoot { id: String, path: String, last_scan: Option<u64> }

#[derive(Default, Clone)]
struct AppState {
    roots: Arc<Mutex<HashMap<String, ProtoRoot>>>,
    services_by_root: Arc<Mutex<HashMap<String, Vec<ParsedService>>>>,
    files_by_root: Arc<Mutex<HashMap<String, Vec<String>>>>,
    active_req: Arc<Mutex<bool>>, // single unary guard
}

#[tauri::command(rename_all = "snake_case")]
async fn register_proto_root(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let root = ProtoRoot { id: id.clone(), path: path.clone(), last_scan: None };
    state.roots.lock().unwrap().insert(id.clone(), root);
    Ok(id)
}

#[tauri::command(rename_all = "snake_case")]
async fn list_proto_roots(state: tauri::State<'_, AppState>) -> Result<Vec<ProtoRoot>, String> {
    let roots = state.roots.lock().unwrap();
    Ok(roots.values().cloned().collect())
}

#[tauri::command(rename_all = "snake_case")]
async fn scan_proto_root(app: tauri::AppHandle, state: tauri::State<'_, AppState>, root_id: String) -> Result<(), String> {
    app.emit("proto://index_start", serde_json::json!({"rootId": root_id}))
        .map_err(|e| e.to_string())?;
    let root_path = {
        let roots = state.roots.lock().unwrap();
        roots.get(&root_id).map(|r| r.path.clone()).ok_or_else(|| "root_not_found".to_string())?
    };
    let files_abs = find_proto_files(PathBuf::from(&root_path).as_path());
    info!(?root_path, count = files_abs.len(), "scan proto root found files");
    // convert to relative (fallback to absolute if strip fails)
    let files: Vec<String> = files_abs.iter().map(|p| {
        p.strip_prefix(&root_path).map(|rp| rp.to_string_lossy().to_string()).unwrap_or_else(|_| p.to_string_lossy().to_string())
    }).collect();
    let mut services: Vec<ParsedService> = Vec::new();
    for (i, f_rel) in files.iter().enumerate() {
        // need absolute path for parsing
        let abs = files_abs.get(i).unwrap();
    services.extend(parse_file(abs));
    info!(file=?abs, "parsed proto file");
        // adjust service.file to relative for UI consistency
        for s in services.iter_mut().rev().take(10) { // small backward window; cheap heuristic
            if s.file == abs.to_string_lossy() { s.file = f_rel.clone(); }
        }
    }
    {
        let mut map = state.services_by_root.lock().unwrap();
        map.insert(root_id.clone(), services.clone());
    }
    {
        let mut fmap = state.files_by_root.lock().unwrap();
        fmap.insert(root_id.clone(), files.clone());
    }
    let summary = serde_json::json!({
        "files": files.len(),
        "services": services.len()
    });
    app.emit("proto://index_done", serde_json::json!({
        "rootId": root_id,
        "summary": summary,
        "services": services,
        "files": files
    })).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn list_proto_files(state: tauri::State<'_, AppState>, root_id: String) -> Result<Vec<String>, String> {
    let map = state.files_by_root.lock().unwrap();
    Ok(map.get(&root_id).cloned().unwrap_or_default())
}

#[derive(Debug, Serialize, Deserialize)]
struct ServiceMeta { fq_service: String, file: String, methods: Vec<MethodMeta> }
#[derive(Debug, Serialize, Deserialize)]
struct MethodMeta { name: String, input_type: String, output_type: String, streaming: bool }

#[tauri::command(rename_all = "snake_case")]
async fn list_services(state: tauri::State<'_, AppState>, root_id: Option<String>) -> Result<Vec<ServiceMeta>, String> {
    let map = state.services_by_root.lock().unwrap();
    let roots_snapshot = state.roots.lock().unwrap();
    let mut out = Vec::new();
    let iter: Box<dyn Iterator<Item=(String, Vec<ParsedService>)>> = if let Some(rid) = root_id.clone() {
        if let Some(list) = map.get(&rid) { Box::new(std::iter::once((rid, list.clone()))) } else { Box::new(std::iter::empty()) }
    } else {
        Box::new(map.iter().map(|(k,v)| (k.clone(), v.clone())))
    };
    for (rid, services) in iter {
        if roots_snapshot.get(&rid).is_none() { continue; }
        for ps in services {
            out.push(ServiceMeta {
                fq_service: ps.fq_service.clone(),
                file: ps.file.clone(),
                methods: ps.methods.iter().map(|m| MethodMeta { name: m.name.clone(), input_type: m.input_type.clone(), output_type: m.output_type.clone(), streaming: m.streaming }).collect()
            });
        }
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
async fn get_method_skeleton(state: tauri::State<'_, AppState>, fq_service: String, method: String) -> Result<String, String> {
    // Find method input type from cached services
    let map = state.services_by_root.lock().unwrap();
    for (_rid, services) in map.iter() {
        if let Some(svc) = services.iter().find(|s| s.fq_service == fq_service) {
            if let Some(m) = svc.methods.iter().find(|m| m.name == method) {
                let mut skel = serde_json::json!({
                    "//": format!("Skeleton for {} (streaming:{}). Add real fields.", m.input_type, m.streaming)
                });
                // Provide an empty object for root suggestion
                if let serde_json::Value::Object(obj) = &mut skel { obj.insert("body".into(), serde_json::json!({})); }
                return Ok(serde_json::to_string_pretty(&skel).unwrap());
            }
        }
    }
    Err("method_not_found".into())
}

#[derive(Debug, Deserialize)]
struct RunParams {
    target: String,
    service: String,
    method: String,
    payload: String,
    proto_files: Vec<String>,
    #[serde(alias = "rootId")] root_id: Option<String>,
    headers: Option<Vec<String>>, // "Key: Value"
}

#[tauri::command(rename_all = "snake_case")]
async fn run_grpc_call(app: tauri::AppHandle, state: tauri::State<'_, AppState>, params: RunParams) -> Result<(), String> {
    // Acquire and set busy flag
    let active_arc = {
        let mut busy = state.active_req.lock().unwrap();
        if *busy { return Err("request_already_running".into()); }
        *busy = true;
        state.active_req.clone()
    };
    let started = std::time::Instant::now();
    // Sanitize target: remove surrounding whitespace, optional scheme, stray leading slashes
    let mut target = params.target.trim().to_string();
    if target.starts_with("http://") { target = target["http://".len()..].to_string(); }
    if target.starts_with("https://") { target = target["https://".len()..].to_string(); }
    // Remove any leading spaces again (in case after scheme removal) and single leading slash
    target = target.trim().trim_start_matches('/').to_string();
    // Remove trailing slash (but keep :port if present)
    if target.ends_with('/') { target.pop(); }
    // If accidental internal spaces exist, fail early with clearer message
    if target.contains(' ') { return Err("invalid_target_whitespace".into()); }
    let service = params.service.clone();
    let method = params.method.clone();
    let payload = params.payload.clone();
    let headers = params.headers.clone().unwrap_or_default();
    let proto_files = params.proto_files.clone();
    let root_dir = if let Some(rid) = params.root_id.clone() {
        let roots = state.roots.lock().unwrap();
        roots.get(&rid).map(|r| r.path.clone())
    } else { None };

    tokio::spawn(async move {
    let mut cmd = Command::new("grpcurl");
    // Log sanitized target
    info!(target = %target, "sanitized target for grpcurl");
        if let Some(rp) = &root_dir { cmd.arg("-import-path").arg(rp); }
        for f in &proto_files { cmd.arg("-proto").arg(f); }
        for h in headers { cmd.arg("-H").arg(h); }
        // 빈 payload인 경우 빈 JSON 객체 사용
        let effective_payload = if payload.trim().is_empty() { "{}" } else { &payload };
        cmd.arg("-d").arg(effective_payload);
    cmd.arg(&target);
        cmd.arg(format!("{}.{}", service, method));
        info!(?cmd, "spawning grpcurl");
        let emit_result = async {
            match cmd.output().await {
                Ok(out) => {
                    if out.status.success() {
                        let text = String::from_utf8_lossy(&out.stdout).to_string();
                        let took = started.elapsed().as_millis();
                        let json_attempt: Result<serde_json::Value, _> = serde_json::from_str(&text);
                        let payload = serde_json::json!({
                            "raw": text,
                            "parsed": json_attempt.ok(),
                            "took_ms": took
                        });
                        if let Err(e) = app.emit("grpc://response", payload) { error!(?e, "emit response failed"); }
                    } else {
                        let stderr_txt = String::from_utf8_lossy(&out.stderr).to_string();
                        let took = started.elapsed().as_millis();
                        let lowered = stderr_txt.to_lowercase();
                        let kind = if lowered.contains("unknown service") { "unknown_service" }
                            else if lowered.contains("unknown method") { "unknown_method" }
                            else if lowered.contains("failed to dial") { "dial_failure" }
                            else if lowered.contains("deadline exceeded") || lowered.contains("context deadline exceeded") { "timeout" }
                            else if lowered.contains("permission denied") { "permission_denied" }
                            else if lowered.contains("unauthenticated") { "unauthenticated" }
                            else if lowered.contains("unavailable") { "unavailable" }
                            else { "error" };
                        let errp = serde_json::json!({
                            "error": stderr_txt,
                            "exit_code": out.status.code(),
                            "took_ms": took,
                            "kind": kind
                        });
                        let _ = app.emit("grpc://error", errp);
                    }
                }
                Err(e) => {
                    let _ = app.emit("grpc://error", serde_json::json!({"error": e.to_string()}));
                }
            }
        };
        emit_result.await;
        // release busy flag
        if let Ok(mut busy) = active_arc.lock() { *busy = false; }
    });
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn remove_proto_root(state: tauri::State<'_, AppState>, root_id: String) -> Result<(), String> {
    // Remove from all related data structures
    state.roots.lock().unwrap().remove(&root_id);
    state.services_by_root.lock().unwrap().remove(&root_id);
    state.files_by_root.lock().unwrap().remove(&root_id);
    info!(root_id = %root_id, "removed proto root and associated data");
    Ok(())
}

fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();
    tauri::Builder::default()
        .manage(AppState { roots: Default::default(), services_by_root: Default::default(), files_by_root: Default::default(), active_req: Default::default() })
        .invoke_handler(tauri::generate_handler![
            register_proto_root,
            list_proto_roots,
            scan_proto_root,
            list_services,
            get_method_skeleton,
            run_grpc_call,
            remove_proto_root,
            list_proto_files
        ])
    .run(tauri::generate_context!())
        .expect("error running tauri application");
}
