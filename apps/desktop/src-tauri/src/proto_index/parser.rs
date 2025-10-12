use regex::Regex;
use std::fs;
use std::path::Path;
use super::{ParsedService, ParsedMethod};

lazy_static::lazy_static! {
    static ref RE_PACKAGE: Regex = Regex::new(r"(?m)^\s*package\s+([A-Za-z0-9_.]+)\s*;").unwrap();
}

fn is_ident_char(c: char) -> bool { c.is_alphanumeric() || c == '_' || c == '.' }

fn parse_services(content: &str) -> Vec<(String, String)> {
    // Returns Vec<(service_name, body_str)>
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(pos) = content[i..].find("service ") {
        let start = i + pos; // position of 's'
        // ensure word boundary (start of file or non-ident before)
        if start > 0 { if let Some(prev) = content[..start].chars().last() { if prev.is_alphanumeric() { i = start + 7; continue; } } }
        let after = start + "service".len();
        let mut j = after;
        // skip whitespace
        while j < content.len() && content[j..].chars().next().unwrap().is_whitespace() { j += content[j..].chars().next().unwrap().len_utf8(); }
        // read service name
        let mut name_end = j;
        for ch in content[j..].chars() {
            if is_ident_char(ch) { name_end += ch.len_utf8(); } else { break; }
        }
        if name_end == j { i = after; continue; }
        let service_name = &content[j..name_end];
        // skip whitespace to first '{'
        let mut k = name_end;
        while k < content.len() && content[k..].chars().next().unwrap().is_whitespace() { k += content[k..].chars().next().unwrap().len_utf8(); }
        if k >= content.len() || content[k..].chars().next().unwrap() != '{' { i = name_end; continue; }
        k += 1; // move past '{'
        // brace balance
        let mut depth = 1;
        let body_start = k;
        while k < content.len() && depth > 0 {
            let ch = content[k..].chars().next().unwrap();
            if ch == '{' { depth += 1; }
            else if ch == '}' { depth -= 1; }
            k += ch.len_utf8();
        }
        if depth != 0 { break; } // unbalanced, stop
        let body_end = k - 1; // position of matching '}'
        let body = &content[body_start..body_end];
        out.push((service_name.to_string(), body.to_string()));
        i = k; // continue scanning after closing brace
    }
    out
}

fn parse_methods(body: &str) -> Vec<ParsedMethod> {
    let mut methods = Vec::new();
    let mut i = 0;
    while let Some(pos) = body[i..].find("rpc ") {
        let start = i + pos; // at 'r'
        let mut cursor = start + 3; // after 'rpc'
        // require space or tab next
        if cursor >= body.len() { break; }
        // skip whitespace
        while cursor < body.len() && body[cursor..].chars().next().unwrap().is_whitespace() { cursor += body[cursor..].chars().next().unwrap().len_utf8(); }
        // parse name
        let name_start = cursor;
        while cursor < body.len() { let ch = body[cursor..].chars().next().unwrap(); if is_ident_char(ch) { cursor += ch.len_utf8(); } else { break; } }
        if cursor == name_start { i = start + 4; continue; }
        let name = &body[name_start..cursor];
        // skip whitespace
        while cursor < body.len() && body[cursor..].chars().next().unwrap().is_whitespace() { cursor += body[cursor..].chars().next().unwrap().len_utf8(); }
        if cursor >= body.len() || body[cursor..].chars().next().unwrap() != '(' { i = cursor; continue; }
        cursor += 1; // past '('
        // input type (optional 'stream ')
        let mut in_stream = false;
        // consume possible 'stream'
        if body[cursor..].starts_with("stream ") { in_stream = true; cursor += "stream ".len(); }
        let in_type_start = cursor;
        while cursor < body.len() { let ch = body[cursor..].chars().next().unwrap(); if is_ident_char(ch) { cursor += ch.len_utf8(); } else { break; } }
        let input_type = body[in_type_start..cursor].trim();
        // skip to ')'
        while cursor < body.len() { let ch = body[cursor..].chars().next().unwrap(); cursor += ch.len_utf8(); if ch == ')' { break; } }
        // skip whitespace
        while cursor < body.len() && body[cursor..].chars().next().unwrap().is_whitespace() { cursor += body[cursor..].chars().next().unwrap().len_utf8(); }
        if !body[cursor..].starts_with("returns") { i = cursor; continue; }
        cursor += "returns".len();
        while cursor < body.len() && body[cursor..].chars().next().unwrap().is_whitespace() { cursor += body[cursor..].chars().next().unwrap().len_utf8(); }
        if cursor >= body.len() || body[cursor..].chars().next().unwrap() != '(' { i = cursor; continue; }
        cursor += 1; // past '('
        let mut out_stream = false;
        if body[cursor..].starts_with("stream ") { out_stream = true; cursor += "stream ".len(); }
        let out_type_start = cursor;
        while cursor < body.len() { let ch = body[cursor..].chars().next().unwrap(); if is_ident_char(ch) { cursor += ch.len_utf8(); } else { break; } }
        let output_type = body[out_type_start..cursor].trim();
        while cursor < body.len() { let ch = body[cursor..].chars().next().unwrap(); cursor += ch.len_utf8(); if ch == ')' { break; } }
        // after output ')' optional whitespace, then either ';' or '{' block
        while cursor < body.len() && body[cursor..].chars().next().unwrap().is_whitespace() { cursor += body[cursor..].chars().next().unwrap().len_utf8(); }
        if cursor < body.len() && body[cursor..].chars().next().unwrap() == '{' {
            // skip block
            let mut depth = 0;
            while cursor < body.len() {
                let ch = body[cursor..].chars().next().unwrap();
                cursor += ch.len_utf8();
                if ch == '{' { depth += 1; }
                else if ch == '}' { depth -= 1; if depth == 0 { break; } }
            }
        } else {
            // consume until ';'
            while cursor < body.len() { let ch = body[cursor..].chars().next().unwrap(); cursor += ch.len_utf8(); if ch == ';' { break; } if ch == '{' { break; } }
        }
        methods.push(ParsedMethod { name: name.to_string(), input_type: input_type.to_string(), output_type: output_type.to_string(), streaming: in_stream || out_stream });
        i = cursor;
    }
    methods
}

pub fn parse_file(path: &Path) -> Vec<ParsedService> {
    let content = match fs::read_to_string(path) { Ok(c) => c, Err(_) => return vec![] };
    let package = RE_PACKAGE.captures(&content).and_then(|c| c.get(1)).map(|m| m.as_str().to_string()).unwrap_or_default();
    let mut services = Vec::new();
    for (service_name, body) in parse_services(&content) {
        let methods = parse_methods(&body);
        let fq = if package.is_empty() { service_name.clone() } else { format!("{}.{}", package, service_name) };
        services.push(ParsedService { fq_service: fq, file: path.to_string_lossy().to_string(), methods });
    }
    services
}
