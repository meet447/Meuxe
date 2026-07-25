use std::sync::OnceLock;

use reqwest::Client;

use super::VoiceInfo;
use crate::error::MeuxeError;
use crate::Result;

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(Client::new)
}

/// Generate TTS audio using ElevenLabs API.
pub async fn generate(text: &str, voice_id: &str, api_key: &str) -> Result<Vec<u8>> {
    let voice_id = if voice_id.is_empty() {
        "21m00Tcm4TlvDq8ikWAM" // Rachel
    } else {
        voice_id
    };

    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}");

    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.5,
        },
    });

    let resp = client()
        .post(&url)
        .header("xi-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| MeuxeError::Tts(format!("ElevenLabs TTS request failed: {e}")))?;

    let bytes = resp.bytes().await?.to_vec();
    Ok(bytes)
}

pub fn list_voices() -> Vec<VoiceInfo> {
    [
        ("21m00Tcm4TlvDq8ikWAM", "Rachel"),
        ("AZnzlk1XvdvUeBnXmlld", "Domi"),
        ("EXAVITQu4vr4xnSDxMaL", "Bella"),
        ("MF3mGyEYCl7XYWbV9V6O", "Elli"),
        ("TxGEqnHWrfWFTfGW9XjX", "Josh"),
        ("VR6AewLTigWG4xSOukaG", "Arnold"),
        ("pNInz6obpgDQGcFmaJgB", "Adam"),
        ("yoZ06aMxZJJ28mfd3POQ", "Sam"),
    ]
    .into_iter()
    .map(|(id, name)| VoiceInfo {
        id: id.to_string(),
        name: name.to_string(),
    })
    .collect()
}
