use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub live2d_model: String,
    pub voice: String,
    pub default_emotion: String,
    pub system_prompt: String,
    pub prompt_sections: PromptSections,
    pub source_type: SourceType,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptSections {
    pub soul: String,
    pub style: String,
    pub rules: String,
    pub context: String,
    pub lorebook: String,
    pub examples: String,
    pub legacy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Directory,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSummary {
    pub id: String,
    pub name: String,
    pub live2d_model: String,
    pub voice: String,
    pub default_emotion: String,
    pub source_type: SourceType,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CharacterYaml {
    pub name: Option<String>,
    pub live2d_model: Option<String>,
    #[serde(default, alias = "model")]
    pub vrm_model: Option<String>,
    pub voice: Option<String>,
    pub default_emotion: Option<String>,
}

pub const DEFAULT_EXPRESSIONS: &[&str] = &[
    "neutral",
    "happy",
    "sad",
    "angry",
    "surprised",
    "excited",
    "embarrassed",
    "thinking",
    "blush",
    "smirk",
    "scared",
    "disgusted",
];

pub const VRM_EXPRESSIONS: &[&str] = &["happy", "angry", "sad", "relaxed", "surprised"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub model_type: String,
    pub model_file: String,
    pub path: String,
}
