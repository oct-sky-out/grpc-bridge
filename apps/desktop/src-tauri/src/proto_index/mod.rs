pub mod scanner;
pub mod parser;

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedService {
    pub fq_service: String,
    pub file: String,
    pub methods: Vec<ParsedMethod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMethod {
    pub name: String,
    pub input_type: String,
    pub output_type: String,
    pub streaming: bool,
}
