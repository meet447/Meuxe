pub mod types;

pub use types::RelationshipState;

use crate::Result;
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};

const POSITIVE_TOKENS: &[&str] = &[
    "thanks", "thank", "love", "great", "awesome", "helpful", "sweet", "nice",
];
const NEGATIVE_TOKENS: &[&str] = &[
    "hate",
    "annoying",
    "bad",
    "upset",
    "angry",
    "frustrated",
    "sad",
];
const ATTACHMENT_TOKENS: &[&str] = &["remember", "miss", "stay", "together", "companion", "care"];

pub struct StateStore {
    data_dir: PathBuf,
}

impl StateStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.join("data"),
        }
    }

    fn state_path(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir
            .join("users")
            .join(user_id)
            .join("memories")
            .join(character_id)
            .join("state.json")
    }

    pub fn load(&self, character_id: &str, user_id: &str) -> Result<RelationshipState> {
        let path = self.state_path(character_id, user_id);
        if path.exists() {
            let content = fs::read_to_string(&path)?;
            let state: RelationshipState = serde_json::from_str(&content)?;
            Ok(state)
        } else {
            Ok(RelationshipState::default())
        }
    }

    pub fn save(
        &self,
        character_id: &str,
        user_id: &str,
        state: &mut RelationshipState,
    ) -> Result<()> {
        state.trust = state.trust.clamp(0.0, 1.0);
        state.affection = state.affection.clamp(0.0, 1.0);
        state.energy = state.energy.clamp(0.0, 1.0);
        state.updated_at = chrono::Utc::now().to_rfc3339();

        let path = self.state_path(character_id, user_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(state)?;
        fs::write(&path, json)?;
        Ok(())
    }

    pub fn update_from_exchange(
        &self,
        character_id: &str,
        user_id: &str,
        user_message: &str,
        assistant_message: &str,
    ) -> Result<RelationshipState> {
        let mut state = self.load(character_id, user_id)?;

        let re = Regex::new(r"[a-zA-Z0-9']+").expect("invalid regex");

        let user_tokens: Vec<String> = re
            .find_iter(user_message)
            .map(|m| m.as_str().to_lowercase())
            .collect();

        let assistant_tokens: Vec<String> = re
            .find_iter(assistant_message)
            .map(|m| m.as_str().to_lowercase())
            .collect();

        let has_positive = user_tokens
            .iter()
            .any(|t| POSITIVE_TOKENS.contains(&t.as_str()));
        let has_negative = user_tokens
            .iter()
            .any(|t| NEGATIVE_TOKENS.contains(&t.as_str()));
        let has_attachment = user_tokens
            .iter()
            .any(|t| ATTACHMENT_TOKENS.contains(&t.as_str()));

        if has_positive {
            state.trust += 0.04;
            state.affection += 0.05;
            state.mood = "warm".to_string();
        }

        if has_negative {
            state.trust -= 0.01;
            state.energy = f64::max(0.35, state.energy - 0.03);
            state.mood = "concerned".to_string();
        }

        if has_attachment {
            state.affection += 0.03;
            state.trust += 0.02;
        }

        let assistant_has_proud_or_glad =
            assistant_tokens.iter().any(|t| t == "proud" || t == "glad");
        if assistant_has_proud_or_glad {
            state.affection += 0.01;
        }

        // Update relationship summary
        state.relationship_summary = if state.trust >= 0.7 && state.affection >= 0.7 {
            "close, trusting, emotionally open".to_string()
        } else if state.trust >= 0.4 || state.affection >= 0.4 {
            "growing warmer and more familiar".to_string()
        } else {
            "still early and getting to know each other".to_string()
        };

        self.save(character_id, user_id, &mut state)?;
        Ok(state)
    }

    pub fn reset(&self, character_id: &str, user_id: &str) -> Result<RelationshipState> {
        let mut state = RelationshipState::default();
        self.save(character_id, user_id, &mut state)?;
        Ok(state)
    }
}

pub fn format_state_prompt(state: &RelationshipState) -> String {
    format!(
        "Current relational state:\n\
         - Mood: {}\n\
         - Trust: {:.2}\n\
         - Affection: {:.2}\n\
         - Energy: {:.2}\n\
         - Relationship: {}\n\n\
         Let this influence tone naturally — don't mention these values explicitly.",
        state.mood, state.trust, state.affection, state.energy, state.relationship_summary
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_default_state() {
        let state = RelationshipState::default();
        assert_eq!(state.trust, 0.0);
        assert_eq!(state.affection, 0.0);
        assert_eq!(state.mood, "neutral");
        assert_eq!(state.energy, 0.7);
        assert!(state.relationship_summary.is_empty());
        assert!(state.updated_at.is_empty());
    }

    #[test]
    fn test_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let mut state = RelationshipState {
            trust: 0.5,
            affection: 0.6,
            mood: "warm".to_string(),
            energy: 0.8,
            relationship_summary: "growing".to_string(),
            updated_at: String::new(),
        };
        store.save("char1", "user1", &mut state).unwrap();

        let loaded = store.load("char1", "user1").unwrap();
        assert_eq!(loaded.trust, 0.5);
        assert_eq!(loaded.affection, 0.6);
        assert_eq!(loaded.mood, "warm");
        assert_eq!(loaded.energy, 0.8);
        assert!(!loaded.updated_at.is_empty());
    }

    #[test]
    fn test_update_positive_exchange() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());

        let state = store
            .update_from_exchange("char1", "user1", "thanks, you're awesome!", "I'm glad!")
            .unwrap();

        assert!(state.trust > 0.0);
        assert!(state.affection > 0.0);
        assert_eq!(state.mood, "warm");
        // Assistant said "glad" so affection gets extra 0.01
        // positive: trust += 0.04, affection += 0.05, plus glad: affection += 0.01
        assert!((state.trust - 0.04).abs() < 1e-9);
        assert!((state.affection - 0.06).abs() < 1e-9);
    }

    #[test]
    fn test_update_negative_exchange() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());

        // First set some initial state
        let mut initial = RelationshipState {
            trust: 0.5,
            affection: 0.5,
            energy: 0.7,
            ..Default::default()
        };
        store.save("char1", "user1", &mut initial).unwrap();

        let state = store
            .update_from_exchange(
                "char1",
                "user1",
                "I'm frustrated and upset",
                "I understand.",
            )
            .unwrap();

        assert!(state.trust < 0.5);
        assert!(state.energy < 0.7);
        assert_eq!(state.mood, "concerned");
    }

    #[test]
    fn test_clamp_values() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let mut state = RelationshipState {
            trust: 1.5,
            affection: -0.3,
            energy: 2.0,
            ..Default::default()
        };
        store.save("char1", "user1", &mut state).unwrap();

        assert_eq!(state.trust, 1.0);
        assert_eq!(state.affection, 0.0);
        assert_eq!(state.energy, 1.0);
    }

    #[test]
    fn test_format_state_prompt() {
        let state = RelationshipState {
            trust: 0.75,
            affection: 0.80,
            mood: "warm".to_string(),
            energy: 0.65,
            relationship_summary: "close, trusting, emotionally open".to_string(),
            updated_at: String::new(),
        };
        let prompt = format_state_prompt(&state);
        assert!(prompt.contains("Mood: warm"));
        assert!(prompt.contains("Trust: 0.75"));
        assert!(prompt.contains("Affection: 0.80"));
        assert!(prompt.contains("Energy: 0.65"));
        assert!(prompt.contains("close, trusting, emotionally open"));
        assert!(prompt.contains("Let this influence tone naturally"));
    }
}
