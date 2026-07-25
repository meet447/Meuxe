pub mod types;

pub use types::*;

use crate::Result;
use std::path::{Path, PathBuf};

fn is_masked_key(key: &str) -> bool {
    key.contains("...")
}

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            config_path: data_dir.join("config.json"),
        }
    }

    /// Replace config with defaults (used for full app reset).
    pub fn reset_to_default(&self) -> Result<()> {
        if self.config_path.exists() {
            std::fs::remove_file(&self.config_path)?;
        }
        self.save_fresh(&AppConfig::default())
    }

    /// Show onboarding again without deleting companions, chat, or API keys.
    pub fn reset_onboarding(&self) -> Result<()> {
        let mut config = self.load()?;
        config.onboarding_complete = false;
        self.save_fresh(&config)
    }

    fn save_fresh(&self, config: &AppConfig) -> Result<()> {
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(config)?;
        std::fs::write(&self.config_path, json)?;
        Ok(())
    }

    pub fn load(&self) -> Result<AppConfig> {
        if !self.config_path.exists() {
            return Ok(AppConfig::default());
        }
        let data = std::fs::read_to_string(&self.config_path)?;
        let config: AppConfig = serde_json::from_str(&data)?;
        Ok(config)
    }

    pub fn save(&self, new_config: &AppConfig) -> Result<()> {
        let existing = self.load().ok();

        let mut merged = new_config.clone();

        if let Some(existing) = existing {
            if merged.user.name.is_empty() {
                merged.user = existing.user;
            } else if merged.user.id.is_empty() {
                merged.user.id = existing.user.id;
            }
            // If incoming LLM api_key is empty, None, or looks masked → preserve existing
            let incoming_llm_key = merged.llm.api_key.clone();
            if incoming_llm_key.is_none()
                || incoming_llm_key
                    .as_ref()
                    .is_some_and(|k| k.is_empty() || is_masked_key(k))
            {
                merged.llm.api_key = existing.llm.api_key;
            }
            // Same for TTS
            let incoming_tts_key = merged.tts.api_key.clone();
            if incoming_tts_key.is_none()
                || incoming_tts_key
                    .as_ref()
                    .is_some_and(|k| k.is_empty() || is_masked_key(k))
            {
                merged.tts.api_key = existing.tts.api_key;
            }
            if merged.llm.base_url.is_empty() {
                merged.llm.base_url = existing.llm.base_url;
                merged.llm.model = existing.llm.model.clone();
            }
            if merged.tts.voice.is_empty() {
                merged.tts.voice = existing.tts.voice.clone();
                merged.tts.provider = existing.tts.provider.clone();
            }

            if merged.llm_providers.is_empty() {
                merged.llm_providers = existing.llm_providers;
            }
            if merged.tts_providers.is_empty() {
                merged.tts_providers = existing.tts_providers;
            }
            if merged.active_character.is_empty() {
                merged.active_character = existing.active_character;
            }
            if !merged.onboarding_complete {
                merged.onboarding_complete = existing.onboarding_complete;
            }
        }

        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&merged)?;
        std::fs::write(&self.config_path, json)?;
        Ok(())
    }

    pub fn mask_config(config: &AppConfig) -> AppConfig {
        let mut masked = config.clone();
        masked.llm.api_key = masked.llm.api_key.map(|k| mask_key(&k));
        masked.tts.api_key = masked.tts.api_key.map(|k| mask_key(&k));
        for provider in masked.llm_providers.values_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        for provider in masked.tts_providers.values_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        masked
    }
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "***".to_string()
    } else {
        format!("{}...{}", &key[..4], &key[key.len() - 4..])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_load_missing_config_returns_default() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());
        let config = mgr.load().unwrap();
        assert_eq!(config.user.name, "");
        assert!(!config.onboarding_complete);
        assert!(config.llm_providers.is_empty());
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());

        let mut config = AppConfig::default();
        config.user.name = "Alice".to_string();
        config.llm.provider = "openai".to_string();
        config.llm.api_key = Some("sk-test-key-12345678".to_string());
        config.onboarding_complete = true;

        mgr.save(&config).unwrap();
        let loaded = mgr.load().unwrap();

        assert_eq!(loaded.user.name, "Alice");
        assert_eq!(loaded.llm.provider, "openai");
        assert_eq!(loaded.llm.api_key, Some("sk-test-key-12345678".to_string()));
        assert!(loaded.onboarding_complete);
    }

    #[test]
    fn test_reset_onboarding_keeps_user_data() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());

        let mut config = AppConfig::default();
        config.user.name = "Bob".to_string();
        config.onboarding_complete = true;
        mgr.save(&config).unwrap();

        mgr.reset_onboarding().unwrap();
        let loaded = mgr.load().unwrap();
        assert!(!loaded.onboarding_complete);
        assert_eq!(loaded.user.name, "Bob");
    }

    #[test]
    fn test_mask_key() {
        assert_eq!(mask_key("sk-abcdef1234567890xyzw"), "sk-a...xyzw");
        assert_eq!(mask_key("short"), "***");
        assert_eq!(mask_key("12345678"), "***");
        assert_eq!(mask_key("123456789"), "1234...6789");
    }

    #[test]
    fn test_mask_config() {
        let mut config = AppConfig::default();
        config.llm.api_key = Some("sk-abcdef1234567890xyzw".to_string());
        config.tts.api_key = Some("short".to_string());
        config.llm_providers.insert(
            "openai".to_string(),
            LlmProviderConfig {
                base_url: "https://api.openai.com/v1".to_string(),
                api_key: Some("sk-provider-key-longvalue".to_string()),
                model: "gpt-4o".to_string(),
            },
        );

        let masked = ConfigManager::mask_config(&config);

        assert_eq!(masked.llm.api_key, Some("sk-a...xyzw".to_string()));
        assert_eq!(masked.tts.api_key, Some("***".to_string()));
        assert_eq!(
            masked.llm_providers["openai"].api_key,
            Some("sk-p...alue".to_string())
        );
    }
}
