use thiserror::Error;

#[derive(Error, Debug)]
pub enum MeuxeError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Character not found: {0}")]
    CharacterNotFound(String),
    #[error("Invalid config: {0}")]
    InvalidConfig(String),
    #[error("LLM error: {0}")]
    Llm(String),
    #[error("TTS error: {0}")]
    Tts(String),
    #[error("Memory error: {0}")]
    Memory(String),
    #[error("Tool error: {0}")]
    Tool(String),
}

pub type Result<T> = std::result::Result<T, MeuxeError>;

impl serde::Serialize for MeuxeError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
