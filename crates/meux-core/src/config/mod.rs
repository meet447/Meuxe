pub mod types;

pub use types::*;

use crate::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn is_masked_key(key: &str) -> bool {
    key.contains("...")
}

// --- Provider Presets ---

#[derive(Debug, Clone, Copy)]
pub struct LlmPreset {
    pub base_url: &'static str,
    pub needs_key: bool,
    pub default_model: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct TtsPreset {
    pub name: &'static str,
    pub needs_key: bool,
}

// Keep in sync with src/lib/llmPresets.ts
pub const LLM_PRESETS: &[(&str, LlmPreset)] = &[
    (
        "openai",
        LlmPreset {
            base_url: "https://api.openai.com/v1",
            needs_key: true,
            default_model: "gpt-4o",
        },
    ),
    (
        "groq",
        LlmPreset {
            base_url: "https://api.groq.com/openai/v1",
            needs_key: true,
            default_model: "llama-3.3-70b-versatile",
        },
    ),
    (
        "openrouter",
        LlmPreset {
            base_url: "https://openrouter.ai/api/v1",
            needs_key: true,
            default_model: "openai/gpt-4o",
        },
    ),
    (
        "together",
        LlmPreset {
            base_url: "https://api.together.ai/v1",
            needs_key: true,
            default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        },
    ),
    (
        "fireworks",
        LlmPreset {
            base_url: "https://api.fireworks.ai/inference/v1",
            needs_key: true,
            default_model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
        },
    ),
    (
        "baseten",
        LlmPreset {
            base_url: "https://inference.baseten.co/v1",
            needs_key: true,
            default_model: "deepseek-ai/DeepSeek-V3",
        },
    ),
    (
        "mistral",
        LlmPreset {
            base_url: "https://api.mistral.ai/v1",
            needs_key: true,
            default_model: "mistral-small-latest",
        },
    ),
    (
        "deepseek",
        LlmPreset {
            base_url: "https://api.deepseek.com/v1",
            needs_key: true,
            default_model: "deepseek-chat",
        },
    ),
    (
        "xai",
        LlmPreset {
            base_url: "https://api.x.ai/v1",
            needs_key: true,
            default_model: "grok-3-mini",
        },
    ),
    (
        "cerebras",
        LlmPreset {
            base_url: "https://api.cerebras.ai/v1",
            needs_key: true,
            default_model: "llama3.1-8b",
        },
    ),
    (
        "deepinfra",
        LlmPreset {
            base_url: "https://api.deepinfra.com/v1/openai",
            needs_key: true,
            default_model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        },
    ),
    (
        "perplexity",
        LlmPreset {
            base_url: "https://api.perplexity.ai",
            needs_key: true,
            default_model: "sonar",
        },
    ),
    (
        "hyperbolic",
        LlmPreset {
            base_url: "https://api.hyperbolic.xyz/v1",
            needs_key: true,
            default_model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        },
    ),
    (
        "novita",
        LlmPreset {
            base_url: "https://api.novita.ai/openai",
            needs_key: true,
            default_model: "meta/llama-3.1-70b-instruct",
        },
    ),
    (
        "siliconflow",
        LlmPreset {
            base_url: "https://api.siliconflow.com/v1",
            needs_key: true,
            default_model: "deepseek-ai/DeepSeek-V3",
        },
    ),
    (
        "nectara",
        LlmPreset {
            base_url: "https://api-nectara.chipling.xyz/v1",
            needs_key: true,
            default_model: "auto",
        },
    ),
    (
        "ollama",
        LlmPreset {
            base_url: "http://localhost:11434/v1",
            needs_key: false,
            default_model: "llama3.2",
        },
    ),
    (
        "lmstudio",
        LlmPreset {
            base_url: "http://localhost:1234/v1",
            needs_key: false,
            default_model: "local-model",
        },
    ),
    (
        "custom",
        LlmPreset {
            base_url: "",
            needs_key: true,
            default_model: "",
        },
    ),
];

pub const TTS_PRESETS: &[(&str, TtsPreset)] = &[
    (
        "tiktok",
        TtsPreset {
            name: "TikTok TTS",
            needs_key: false,
        },
    ),
    (
        "elevenlabs",
        TtsPreset {
            name: "ElevenLabs",
            needs_key: true,
        },
    ),
    (
        "openai_tts",
        TtsPreset {
            name: "OpenAI TTS",
            needs_key: true,
        },
    ),
];

// --- ConfigManager ---

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            config_path: data_dir.join("config.json"),
        }
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
            // Preserve search API keys if incoming is empty/masked
            let incoming_serp_key = merged.search.serp_api_key.clone();
            if incoming_serp_key.is_none()
                || incoming_serp_key
                    .as_ref()
                    .is_some_and(|k| k.is_empty() || is_masked_key(k))
            {
                merged.search.serp_api_key = existing.search.serp_api_key;
            }
            let incoming_exa_key = merged.search.exa_api_key.clone();
            if incoming_exa_key.is_none()
                || incoming_exa_key
                    .as_ref()
                    .is_some_and(|k| k.is_empty() || is_masked_key(k))
            {
                merged.search.exa_api_key = existing.search.exa_api_key;
            }
            if merged.search.provider.is_empty() {
                merged.search.provider = existing.search.provider;
            }
            let incoming_composio_key = merged.composio.api_key.clone();
            if incoming_composio_key.is_none()
                || incoming_composio_key
                    .as_ref()
                    .is_some_and(|k| k.is_empty() || is_masked_key(k))
            {
                merged.composio.api_key = existing.composio.api_key;
            }
            if merged.composio.enabled_toolkits.is_empty() {
                merged.composio.enabled_toolkits = existing.composio.enabled_toolkits;
            }
            if merged.composio.connections.is_empty() {
                merged.composio.connections = existing.composio.connections;
            }

            if merged.llm_providers.is_empty() {
                merged.llm_providers = existing.llm_providers;
            }
            if merged.tts_providers.is_empty() {
                merged.tts_providers = existing.tts_providers;
            }
            // Preserve disabled_tools if not explicitly set in the incoming config
            // (the frontend sends disabled_tools only from the tools settings page)
            if merged.disabled_tools.is_empty() && !existing.disabled_tools.is_empty() {
                merged.disabled_tools = existing.disabled_tools;
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
        masked.search.serp_api_key = masked.search.serp_api_key.map(|k| mask_key(&k));
        masked.search.exa_api_key = masked.search.exa_api_key.map(|k| mask_key(&k));
        masked.composio.api_key = masked.composio.api_key.map(|k| mask_key(&k));
        for provider in masked.llm_providers.values_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        for provider in masked.tts_providers.values_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        masked
    }

    pub fn get_configured_providers(
        config: &AppConfig,
    ) -> HashMap<String, HashMap<String, serde_json::Value>> {
        let mut result: HashMap<String, HashMap<String, serde_json::Value>> = HashMap::new();

        // LLM providers
        let mut llm_status: HashMap<String, serde_json::Value> = HashMap::new();
        for (name, preset) in LLM_PRESETS {
            let configured = if let Some(provider_cfg) = config.llm_providers.get(*name) {
                if preset.needs_key {
                    provider_cfg.api_key.as_ref().is_some_and(|k| !k.is_empty())
                } else {
                    true
                }
            } else {
                false
            };
            llm_status.insert(name.to_string(), serde_json::Value::Bool(configured));
        }
        result.insert("llm".to_string(), llm_status);

        // TTS providers
        let mut tts_status: HashMap<String, serde_json::Value> = HashMap::new();
        for (name, preset) in TTS_PRESETS {
            let configured = if let Some(provider_cfg) = config.tts_providers.get(*name) {
                if preset.needs_key {
                    provider_cfg.api_key.as_ref().is_some_and(|k| !k.is_empty())
                } else {
                    true
                }
            } else {
                !preset.needs_key
            };
            tts_status.insert(name.to_string(), serde_json::Value::Bool(configured));
        }
        result.insert("tts".to_string(), tts_status);

        result
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
