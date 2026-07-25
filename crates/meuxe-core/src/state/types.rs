use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipState {
    #[serde(default)]
    pub trust: f64,
    #[serde(default)]
    pub affection: f64,
    #[serde(default = "default_mood")]
    pub mood: String,
    #[serde(default = "default_energy")]
    pub energy: f64,
    #[serde(default)]
    pub relationship_summary: String,
    #[serde(default)]
    pub updated_at: String,
}

fn default_mood() -> String {
    "neutral".to_string()
}

fn default_energy() -> f64 {
    0.7
}

impl Default for RelationshipState {
    fn default() -> Self {
        Self {
            trust: 0.0,
            affection: 0.0,
            mood: "neutral".to_string(),
            energy: 0.7,
            relationship_summary: String::new(),
            updated_at: String::new(),
        }
    }
}
