use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn tts_voices(
    _state: State<Arc<AppState>>,
    provider: String,
) -> Result<Vec<meuxe_core::tts::VoiceInfo>, String> {
    Ok(meuxe_core::tts::list_voices(&provider))
}

#[tauri::command]
pub async fn tts_preview(
    _state: State<'_, Arc<AppState>>,
    provider: String,
    voice: String,
    api_key: Option<String>,
    text: Option<String>,
) -> Result<Vec<u8>, String> {
    let sample_text = text.unwrap_or_else(|| "Hello! This is a voice preview.".to_string());

    let tts_config = meuxe_core::config::types::TtsConfig {
        provider: provider.clone(),
        api_key,
        voice,
    };

    meuxe_core::tts::generate_tts_auto(&sample_text, &tts_config)
        .await
        .map_err(|e| e.to_string())
}
