use std::sync::OnceLock;

use reqwest::Client;

use super::VoiceInfo;
use crate::error::MeuxeError;
use crate::Result;

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(Client::new)
}

/// Generate TTS audio using OpenAI API.
pub async fn generate(text: &str, voice: &str, api_key: &str) -> Result<Vec<u8>> {
    let voice = if voice.is_empty() { "alloy" } else { voice };

    let body = serde_json::json!({
        "model": "tts-1",
        "input": text,
        "voice": voice,
    });

    let resp = client()
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| MeuxeError::Tts(format!("OpenAI TTS request failed: {e}")))?;

    let bytes = resp.bytes().await?.to_vec();
    Ok(bytes)
}

pub fn list_voices() -> Vec<VoiceInfo> {
    [
        ("alloy", "Alloy"),
        ("echo", "Echo"),
        ("fable", "Fable"),
        ("onyx", "Onyx"),
        ("nova", "Nova"),
        ("shimmer", "Shimmer"),
    ]
    .into_iter()
    .map(|(id, name)| VoiceInfo {
        id: id.to_string(),
        name: name.to_string(),
    })
    .collect()
}
