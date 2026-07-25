use crate::AppState;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use meuxe_core::config::types::AppConfig;
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::State;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

#[derive(Clone)]
struct TranscriptionBackend {
    label: String,
    provider: String,
    base_url: String,
    api_key: String,
}

fn transcription_model_candidates(provider: &str, base_url: &str) -> Vec<&'static str> {
    let provider = provider.to_lowercase();
    let base_url = base_url.to_lowercase();

    if provider.contains("groq") || base_url.contains("groq.com") {
        vec![
            "whisper-large-v3-turbo",
            "whisper-large-v3",
            "distil-whisper-large-v3-en",
        ]
    } else {
        vec!["gpt-4o-mini-transcribe", "whisper-1"]
    }
}

fn audio_extension(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/mp4" | "audio/x-m4a" => "m4a",
        "audio/mpeg" => "mp3",
        "audio/ogg" | "audio/webm;codecs=opus" | "audio/webm" => "webm",
        "audio/wav" => "wav",
        _ => "webm",
    }
}

fn push_backend(
    backends: &mut Vec<TranscriptionBackend>,
    seen: &mut HashSet<String>,
    label: String,
    provider: String,
    base_url: String,
    api_key: String,
) {
    let trimmed_base_url = base_url.trim().trim_end_matches('/').to_string();
    if trimmed_base_url.is_empty() {
        return;
    }

    let fingerprint = format!("{provider}|{trimmed_base_url}|{}", api_key.is_empty());
    if !seen.insert(fingerprint) {
        return;
    }

    backends.push(TranscriptionBackend {
        label,
        provider,
        base_url: trimmed_base_url,
        api_key,
    });
}

fn transcription_backends(config: &AppConfig) -> Vec<TranscriptionBackend> {
    let mut backends = Vec::new();
    let mut seen = HashSet::new();

    push_backend(
        &mut backends,
        &mut seen,
        format!("active provider ({})", config.llm.provider),
        config.llm.provider.clone(),
        config.llm.base_url.clone(),
        config.llm.api_key.clone().unwrap_or_default(),
    );

    for provider_name in ["openai", "groq"] {
        if let Some(provider) = config.llm_providers.get(provider_name) {
            push_backend(
                &mut backends,
                &mut seen,
                format!("configured {provider_name} provider"),
                provider_name.to_string(),
                provider.base_url.clone(),
                provider.api_key.clone().unwrap_or_default(),
            );
        }
    }

    backends
}

fn whisper_transcribe_inner(ctx: &WhisperContext, pcm_samples: &[f32]) -> Result<String, String> {
    let mut state = ctx
        .create_state()
        .map_err(|e| format!("whisper state: {e}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(num_cpus());
    params.set_language(Some("en"));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_single_segment(true);

    state
        .full(params, pcm_samples)
        .map_err(|e| format!("whisper full: {e}"))?;

    let num_segments = state
        .full_n_segments()
        .map_err(|e| format!("whisper segments: {e}"))?;

    let mut text = String::new();
    for i in 0..num_segments {
        if let Ok(segment) = state.full_get_segment_text(i) {
            text.push_str(&segment);
        }
    }

    Ok(text.trim().to_string())
}

fn num_cpus() -> i32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4)
}

/// Transcribe using local whisper.cpp (tiny model) — no internet needed.
/// Accepts base64-encoded f32 PCM audio at 16kHz mono.
#[tauri::command]
pub async fn voice_transcribe_local(
    state: State<'_, Arc<AppState>>,
    pcm_base64: String,
) -> Result<String, String> {
    let pcm_bytes = STANDARD
        .decode(pcm_base64.trim())
        .map_err(|e| format!("Invalid PCM payload: {e}"))?;

    if pcm_bytes.len() % 4 != 0 {
        return Err("PCM data length must be a multiple of 4 bytes (f32)".into());
    }

    let pcm_samples: Vec<f32> = pcm_bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    if pcm_samples.is_empty() {
        return Err("Empty PCM audio data".into());
    }

    // Clone the context out of state so we can move it into spawn_blocking
    let ctx = state.whisper_ctx.clone().ok_or_else(|| {
        "Whisper model not loaded. Place ggml-tiny.bin in models/whisper/".to_string()
    })?;

    let text = tokio::task::spawn_blocking(move || whisper_transcribe_inner(&ctx, &pcm_samples))
        .await
        .map_err(|e| format!("whisper task: {e}"))??;

    if text.is_empty() {
        return Err("No speech detected".into());
    }

    Ok(text)
}

/// Transcribe using remote API (OpenAI/Groq Whisper).
/// Accepts base64-encoded audio blob + mime type.
#[tauri::command]
pub async fn voice_transcribe(
    state: State<'_, Arc<AppState>>,
    audio_base64: String,
    mime_type: String,
) -> Result<String, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;

    let backends = transcription_backends(&config);
    if backends.is_empty() {
        return Err("Configure an LLM provider before using voice input.".to_string());
    }

    let audio_bytes_vec = STANDARD
        .decode(audio_base64.trim())
        .map_err(|e| format!("Invalid audio payload: {e}"))?;
    let audio_bytes = bytes::Bytes::from(audio_bytes_vec);

    let extension = audio_extension(&mime_type);
    let file_name = format!("voice-input.{extension}");
    let client = Client::new();
    let mut last_error = String::new();

    for backend in backends {
        let endpoint = format!("{}/audio/transcriptions", backend.base_url);
        let models = transcription_model_candidates(&backend.provider, &backend.base_url);

        for model in models {
            let part = Part::stream(reqwest::Body::from(audio_bytes.clone()))
                .file_name(file_name.clone())
                .mime_str(&mime_type)
                .map_err(|e| e.to_string())?;
            let form = Form::new()
                .part("file", part)
                .text("model", model.to_string());

            let mut request = client.post(&endpoint).multipart(form);
            if !backend.api_key.is_empty() {
                request = request.bearer_auth(&backend.api_key);
            }

            let response = match request.send().await {
                Ok(response) => response,
                Err(err) => {
                    last_error = format!("{} request failed: {err}", backend.label);
                    continue;
                }
            };

            let status = response.status();
            let body = response.text().await.unwrap_or_default();

            if status.is_success() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                    if let Some(text) = json.get("text").and_then(|value| value.as_str()) {
                        return Ok(text.trim().to_string());
                    }
                }

                let text = body.trim().trim_matches('"').to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }

            last_error = format!("{} returned HTTP {status}: {body}", backend.label);
        }
    }

    Err(if last_error.is_empty() {
        "Voice transcription failed. Configure OpenAI or Groq for voice input.".to_string()
    } else {
        format!("Voice transcription failed: {last_error}")
    })
}
