pub mod elevenlabs;
pub mod openai;
pub mod tiktok;

use serde::Serialize;

use crate::config::types::TtsConfig;
use crate::error::MeuxeError;
use crate::Result;

#[derive(Debug, Clone, Serialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
}

/// Generate TTS audio from text using the configured provider (single attempt).
async fn generate_tts_once(text: &str, config: &TtsConfig) -> Result<Vec<u8>> {
    match config.provider.as_str() {
        "tiktok" | "" => tiktok::generate(text, &config.voice).await,
        "elevenlabs" => {
            let api_key = config
                .api_key
                .as_deref()
                .ok_or_else(|| MeuxeError::Tts("ElevenLabs API key required".into()))?;
            elevenlabs::generate(text, &config.voice, api_key).await
        }
        "openai_tts" => {
            let api_key = config
                .api_key
                .as_deref()
                .ok_or_else(|| MeuxeError::Tts("OpenAI API key required".into()))?;
            openai::generate(text, &config.voice, api_key).await
        }
        other => Err(MeuxeError::Tts(format!("Unknown TTS provider: {other}"))),
    }
}

/// Generate TTS audio with retry (up to 2 retries with exponential backoff).
pub async fn generate_tts_auto(text: &str, config: &TtsConfig) -> Result<Vec<u8>> {
    crate::retry::retry_with_backoff(2, 500, crate::retry::is_retryable_tts_error, || {
        generate_tts_once(text, config)
    })
    .await
}

/// List available voices for a given provider.
pub fn list_voices(provider: &str) -> Vec<VoiceInfo> {
    match provider {
        "tiktok" | "" => tiktok::list_voices(),
        "elevenlabs" => elevenlabs::list_voices(),
        "openai_tts" => openai::list_voices(),
        _ => vec![],
    }
}
