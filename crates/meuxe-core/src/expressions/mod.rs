use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use crate::Result;

pub const GLOBAL_EXPRESSIONS: &[&str] = &[
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

fn fallback_candidates(name: &str) -> &'static [&'static str] {
    match name {
        "blush" => &["embarrassed", "happy", "neutral"],
        "embarrassed" => &["blush", "happy", "sad", "neutral"],
        "smirk" => &["happy", "neutral"],
        "thinking" => &["neutral", "sad"],
        "excited" => &["happy", "surprised", "neutral"],
        "scared" => &["surprised", "sad", "neutral"],
        "disgusted" => &["angry", "sad", "neutral"],
        _ => &["neutral"],
    }
}

/// Manages expression mappings between global expression names and model-specific names.
pub struct ExpressionManager {
    mappings_dir: PathBuf,
    cache: RwLock<HashMap<String, HashMap<String, String>>>,
}

impl ExpressionManager {
    /// Create a new ExpressionManager rooted at `data_dir`.
    pub fn new(data_dir: &Path) -> Self {
        Self {
            mappings_dir: data_dir.join("models").join("expression_mappings"),
            cache: RwLock::new(HashMap::new()),
        }
    }

    /// Get the expression mapping for a model. Returns cached version if available,
    /// otherwise loads from `{model_id}.json` on disk and caches the result.
    pub fn get_mapping(&self, model_id: &str) -> HashMap<String, String> {
        // Check cache first
        {
            let cache = self.cache.read().unwrap();
            if let Some(mapping) = cache.get(model_id) {
                return mapping.clone();
            }
        }

        // Load from file
        let path = self.mappings_dir.join(format!("{model_id}.json"));
        let mapping = if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|contents| serde_json::from_str(&contents).ok())
                .unwrap_or_default()
        } else {
            HashMap::new()
        };

        // Cache and return
        let mut cache = self.cache.write().unwrap();
        cache.insert(model_id.to_string(), mapping.clone());
        mapping
    }

    /// Save an expression mapping for a model. Creates the mappings directory if needed,
    /// writes pretty JSON, and updates the cache.
    pub fn save_mapping(&self, model_id: &str, mapping: HashMap<String, String>) -> Result<()> {
        std::fs::create_dir_all(&self.mappings_dir)?;

        let path = self.mappings_dir.join(format!("{model_id}.json"));
        let json = serde_json::to_string_pretty(&mapping)?;
        std::fs::write(&path, json)?;

        let mut cache = self.cache.write().unwrap();
        cache.insert(model_id.to_string(), mapping);

        Ok(())
    }

    /// Resolve a global expression name to a model-specific name.
    /// Returns the mapped name if one exists, otherwise returns the global name as fallback.
    pub fn resolve(&self, model_id: &str, global_name: &str) -> String {
        let mapping = self.get_mapping(model_id);
        let normalized = global_name.trim().to_lowercase();

        if let Some(mapped) = mapping.get(&normalized).filter(|value| !value.is_empty()) {
            return mapped.clone();
        }

        for candidate in fallback_candidates(&normalized) {
            if let Some(mapped) = mapping.get(*candidate).filter(|value| !value.is_empty()) {
                return mapped.clone();
            }
        }

        mapping
            .get("neutral")
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or(normalized)
    }

    /// Validate an expression name against a list of available expressions.
    /// Performs case-insensitive matching. Returns the matching available name if found.
    pub fn validate_expression(name: &str, available: &[String]) -> Option<String> {
        let lower = name.to_lowercase();
        available
            .iter()
            .find(|a| a.to_lowercase() == lower)
            .cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_empty_mapping() {
        let tmp = TempDir::new().unwrap();
        let mgr = ExpressionManager::new(tmp.path());

        // With no mapping saved, resolve should return the global name as-is.
        assert_eq!(mgr.resolve("some_model", "happy"), "happy");
        assert_eq!(mgr.resolve("some_model", "neutral"), "neutral");
    }

    #[test]
    fn test_save_and_resolve() {
        let tmp = TempDir::new().unwrap();
        let mgr = ExpressionManager::new(tmp.path());

        let mut mapping = HashMap::new();
        mapping.insert("happy".to_string(), "joy".to_string());
        mapping.insert("sad".to_string(), "sorrow".to_string());

        mgr.save_mapping("model_a", mapping).unwrap();

        // Mapped expressions resolve to the model-specific name.
        assert_eq!(mgr.resolve("model_a", "happy"), "joy");
        assert_eq!(mgr.resolve("model_a", "sad"), "sorrow");

        // Unmapped expressions fall back to the global name.
        assert_eq!(mgr.resolve("model_a", "angry"), "angry");
    }

    #[test]
    fn test_validate_expression() {
        let available = vec!["Happy".to_string(), "Sad".to_string(), "Angry".to_string()];

        // Case-insensitive match works.
        assert_eq!(
            ExpressionManager::validate_expression("happy", &available),
            Some("Happy".to_string())
        );
        assert_eq!(
            ExpressionManager::validate_expression("SAD", &available),
            Some("Sad".to_string())
        );

        // Unknown expression returns None.
        assert_eq!(
            ExpressionManager::validate_expression("confused", &available),
            None
        );
    }

    #[test]
    fn test_resolve_uses_fallback_mapping() {
        let tmp = TempDir::new().unwrap();
        let mgr = ExpressionManager::new(tmp.path());

        let mut mapping = HashMap::new();
        mapping.insert("embarrassed".to_string(), "shy_pose".to_string());
        mapping.insert("neutral".to_string(), "idle_pose".to_string());

        mgr.save_mapping("model_a", mapping).unwrap();

        assert_eq!(mgr.resolve("model_a", "blush"), "shy_pose");
        assert_eq!(mgr.resolve("model_a", "unknown_expression"), "idle_pose");
    }
}
