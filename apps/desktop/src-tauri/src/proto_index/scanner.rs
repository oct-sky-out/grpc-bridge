use ignore::WalkBuilder;
use std::path::{Path, PathBuf};

pub fn find_proto_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if !root.exists() { return files; }
    // NOTE: don't restrict walker types; default types exclude custom extensions like .proto
    for result in WalkBuilder::new(root).follow_links(true).build() {
        if let Ok(entry) = result {
            if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                if let Some(ext) = entry.path().extension() {
                    if ext == "proto" { files.push(entry.path().to_path_buf()); }
                }
            }
        }
    }
    files
}
