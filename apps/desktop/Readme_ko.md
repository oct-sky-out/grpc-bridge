
# 2. Desktop Backend - Rust/Tauri (`apps/desktop/src-tauri/`)

## 기술 스택
- **Rust** - 시스템 프로그래밍
- **Tauri 2.0** - 데스크톱 프레임워크
- **Tokio** - 비동기 런타임
- **grpcurl** - gRPC 호출 실행 (외부 바이너리)

## 의존성 (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2.0.0", features = ["tray-icon"] }
tokio = { version = "1.38", features = ["rt-multi-thread", "process", "macros", "time", "io-util"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
ignore = "0.4"
notify = "6"
# ... (더 많은 의존성)
```

## 소스 구조
```
apps/desktop/src-tauri/src/
├── main.rs                    # 앱 진입점, Tauri 명령어 핸들러
└── proto_index/
    ├── mod.rs
    ├── scanner.rs             # .proto 파일 검색
    └── parser.rs              # Proto 파일 파싱
```

## 주요 데이터 구조
```rust
struct AppState {
    roots: HashMap<String, ProtoRoot>,                // Proto 루트 디렉토리
    services_by_root: HashMap<String, Vec<ParsedService>>,  // 파싱된 서비스
    files_by_root: HashMap<String, Vec<String>>,      // Proto 파일 목록
    active_req: bool,                                  // 요청 중복 방지
}

struct ProtoRoot {
    id: String,
    path: String,
    last_scan: Option<u64>,
}
```

## Tauri Commands (main.rs:250-258)
프론트엔드에서 `invoke()` 함수로 호출:

| Command | 설명 | 파일:라인 |
|---------|------|-----------|
| `register_proto_root(path)` | Proto 루트 디렉토리 등록 | main.rs:24 |
| `list_proto_roots()` | 등록된 루트 목록 조회 | main.rs:32 |
| `scan_proto_root(root_id)` | Proto 파일 스캔 및 파싱 | main.rs:38 |
| `list_services(root_id?)` | 서비스 목록 조회 | main.rs:95 |
| `get_method_skeleton(service, method)` | 메서드 스켈레톤 생성 | main.rs:118 |
| `run_grpc_call(params)` | gRPC 호출 실행 | main.rs:148 |
| `remove_proto_root(root_id)` | Proto 루트 제거 | main.rs:237 |
| `list_proto_files(root_id)` | Proto 파일 목록 | main.rs:84 |

## 이벤트 시스템 (Tauri Events)
프론트엔드에서 `listen()` 함수로 구독:

| Event | 발생 시점 | 페이로드 |
|-------|-----------|----------|
| `proto://index_start` | 인덱싱 시작 | `{rootId}` |
| `proto://index_done` | 인덱싱 완료 | `{rootId, summary, services, files}` |
| `grpc://response` | gRPC 성공 응답 | `{raw, parsed, took_ms}` |
| `grpc://error` | gRPC 에러 | `{error, exit_code, took_ms, kind}` |

## gRPC 호출 플로우 (main.rs:148-234)
1. `run_grpc_call()` 명령어 호출
2. 타겟 주소 sanitize (http://, 공백 제거 등)
3. `grpcurl` 외부 프로세스 실행
4. 출력을 파싱하여 이벤트 발생
5. 성공/실패에 따라 `grpc://response` 또는 `grpc://error` 이벤트 emit
