use std::sync::OnceLock;

use base64::Engine;
use reqwest::Client;
use serde_json::Value;

use super::VoiceInfo;
use crate::error::MeuxeError;
use crate::Result;

const ENDPOINTS: &[&str] = &[
    "https://tiktok-tts.weilnet.workers.dev/api/generation",
    "https://tiktoktts.com/api/tiktok-tts",
];

const TEXT_BYTE_LIMIT: usize = 300;

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

// Generate TTS audio and return raw MP3 bytes.
pub async fn generate(text: &str, voice: &str) -> Result<Vec<u8>> {
    if text.is_empty() {
        return Err(MeuxeError::Tts("Empty text".into()));
    }

    let voice = if voice.is_empty() { "jp_001" } else { voice };

    for (endpoint_index, endpoint) in ENDPOINTS.iter().enumerate() {
        match try_generate(text, voice, endpoint, endpoint_index).await {
            Ok(data) => return Ok(data),
            Err(e) => {
                eprintln!("[TTS] Endpoint {endpoint_index} failed: {e}");
                continue;
            }
        }
    }

    Err(MeuxeError::Tts("Meuxe TTS: all endpoints failed".into()))
}

async fn try_generate(
    text: &str,
    voice: &str,
    endpoint: &str,
    endpoint_index: usize,
) -> Result<Vec<u8>> {
    if text.len() < TEXT_BYTE_LIMIT {
        // Single chunk
        let audio_resp = generate_audio(text, voice, endpoint).await?;
        let b64 = extract_base64(&audio_resp, endpoint_index)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .map_err(|e| MeuxeError::Tts(format!("Base64 decode error: {e}")))?;
        Ok(bytes)
    } else {
        // Split into chunks, generate each
        let parts = split_text(text, 299);
        let mut audio_parts: Vec<Option<String>> = vec![None; parts.len()];

        // Generate sequentially (tokio tasks for parallelism)
        let mut handles = Vec::new();
        for (i, part) in parts.iter().enumerate() {
            let part = part.clone();
            let endpoint = endpoint.to_string();
            let voice = voice.to_string();
            let handle = tokio::spawn(async move {
                let audio_resp = generate_audio(&part, &voice, &endpoint).await?;
                let b64 = extract_base64(&audio_resp, endpoint_index)?;
                if b64 == "error" {
                    return Err(MeuxeError::Tts("TTS returned error".into()));
                }
                Ok::<(usize, String), MeuxeError>((i, b64))
            });
            handles.push(handle);
        }

        for handle in handles {
            match handle.await {
                Ok(Ok((idx, b64))) => audio_parts[idx] = Some(b64),
                Ok(Err(e)) => return Err(e),
                Err(e) => return Err(MeuxeError::Tts(format!("TTS task error: {e}"))),
            }
        }

        // All parts must succeed
        if audio_parts.iter().any(|p| p.is_none()) {
            return Err(MeuxeError::Tts("Some TTS chunks failed".into()));
        }

        // Decode each part, concatenate raw bytes
        let mut raw = Vec::new();
        for part in audio_parts.iter().flatten() {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(part)
                .map_err(|e| MeuxeError::Tts(format!("Base64 decode error: {e}")))?;
            raw.extend_from_slice(&bytes);
        }

        Ok(raw)
    }
}

async fn generate_audio(text: &str, voice: &str, endpoint: &str) -> Result<Vec<u8>> {
    eprintln!("[TTS] POST to {endpoint}");
    let resp = client()
        .post(endpoint)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "text": text,
            "voice": voice,
        }))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| MeuxeError::Tts(format!("Meuxe TTS request failed: {e}")))?;

    eprintln!(
        "[TTS] Response status: {}, url: {}",
        resp.status(),
        resp.url()
    );

    // Don't check status code — just read body like the Python version
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| MeuxeError::Tts(format!("Meuxe TTS read error: {e}")))?;

    eprintln!("[TTS] Response body size: {} bytes", bytes.len());

    Ok(bytes.to_vec())
}

fn extract_base64(audio_response: &[u8], endpoint_index: usize) -> Result<String> {
    let body_preview = String::from_utf8_lossy(&audio_response[..audio_response.len().min(200)]);
    eprintln!(
        "[TTS] Endpoint {} response ({} bytes): {}",
        endpoint_index,
        audio_response.len(),
        body_preview
    );

    let data: Value = serde_json::from_slice(audio_response)
        .map_err(|e| MeuxeError::Tts(format!("TTS JSON parse error: {e}")))?;

    if endpoint_index == 0 {
        // First endpoint: { "data": "base64..." }
        data.get("data")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty() && *s != "error")
            .map(|s| s.to_string())
            .ok_or_else(|| MeuxeError::Tts("No audio data in TTS response".into()))
    } else {
        // Second endpoint: { "audio": "data:audio/mpeg;base64,..." } or { "data": "..." }
        let raw = data
            .get("audio")
            .or_else(|| data.get("data"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| MeuxeError::Tts("No audio data in TTS response".into()))?;

        // Strip data URI prefix if present
        if raw.contains(',') {
            Ok(raw.split(',').nth(1).unwrap_or(raw).to_string())
        } else {
            Ok(raw.to_string())
        }
    }
}

pub fn split_text(text: &str, chunk_size: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut result = Vec::new();
    let mut current = String::new();

    for word in words {
        if current.len() + word.len() < chunk_size {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        } else {
            if !current.is_empty() {
                result.push(current.clone());
            }
            current = word.to_string();
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

pub fn list_voices() -> Vec<VoiceInfo> {
    [
        ("en_au_001", "English AU - Female"),
        ("en_au_002", "English AU - Male"),
        ("en_uk_001", "English UK - Male 1"),
        ("en_uk_003", "English UK - Male 2"),
        ("en_us_001", "English US - Female 1"),
        ("en_us_002", "English US - Female 2"),
        ("en_us_006", "English US - Male 1"),
        ("en_us_007", "English US - Male 2"),
        ("en_us_009", "English US - Male 3"),
        ("en_us_010", "English US - Male 4"),
        ("fr_001", "French - Male 1"),
        ("fr_002", "French - Male 2"),
        ("de_001", "German - Female"),
        ("de_002", "German - Male"),
        ("es_002", "Spanish - Male"),
        ("es_mx_002", "Spanish MX - Male"),
        ("br_001", "Portuguese BR - Female 1"),
        ("br_003", "Portuguese BR - Female 2"),
        ("br_004", "Portuguese BR - Female 3"),
        ("br_005", "Portuguese BR - Male"),
        ("id_001", "Indonesian - Female"),
        ("jp_001", "Japanese - Female 1"),
        ("jp_003", "Japanese - Female 2"),
        ("jp_005", "Japanese - Female 3"),
        ("jp_006", "Japanese - Male"),
        ("kr_002", "Korean - Male 1"),
        ("kr_003", "Korean - Female"),
        ("kr_004", "Korean - Male 2"),
        ("en_male_narration", "Narrator"),
        ("en_male_funny", "Wacky"),
        ("en_female_emotional", "Peaceful"),
    ]
    .into_iter()
    .map(|(id, name)| VoiceInfo {
        id: id.to_string(),
        name: name.to_string(),
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_text_short() {
        let chunks = split_text("Hello world", 300);
        assert_eq!(chunks, vec!["Hello world"]);
    }

    #[test]
    fn test_split_text_long() {
        let text = "word ".repeat(100);
        let text = text.trim();
        let chunks = split_text(text, 300);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(chunk.len() <= 300);
        }
    }

    #[test]
    fn test_extract_base64_endpoint_0() {
        let resp = br#"{"data":"dGVzdA=="}"#;
        let result = extract_base64(resp, 0).unwrap();
        assert_eq!(result, "dGVzdA==");
    }

    #[test]
    fn test_extract_base64_endpoint_1_data_uri() {
        let resp = br#"{"audio":"data:audio/mpeg;base64,dGVzdA=="}"#;
        let result = extract_base64(resp, 1).unwrap();
        assert_eq!(result, "dGVzdA==");
    }

    #[test]
    fn test_extract_base64_endpoint_1_raw() {
        let resp = br#"{"data":"dGVzdA=="}"#;
        let result = extract_base64(resp, 1).unwrap();
        assert_eq!(result, "dGVzdA==");
    }
}
