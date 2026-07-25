use crate::AppState;
use meuxe_core::config::resolve_llm_api_key;
use meuxe_core::config::types::AppConfig;
use meuxe_core::llm::types::{ChatMessage, LlmStreamConfig};
use meuxe_core::reset;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn config_get(state: State<Arc<AppState>>) -> Result<AppConfig, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    Ok(meuxe_core::config::ConfigManager::mask_config(&config))
}

#[tauri::command]
pub fn config_save(state: State<Arc<AppState>>, config: AppConfig) -> Result<(), String> {
    state.config.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_reset_all(state: State<Arc<AppState>>) -> Result<(), String> {
    if let Ok(mut lock) = state.chat_cancel.lock() {
        if let Some(token) = lock.take() {
            token.cancel();
        }
    }

    reset::reset_app_data(&state.data_dir).map_err(|e| e.to_string())?;
    state.characters.clear_cache();
    state.config.reset_to_default().map_err(|e| e.to_string())
}

fn provider_fields(provider: &serde_json::Value) -> (String, String, Option<String>) {
    let base_url = provider
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let api_key = provider
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let provider_id = provider
        .get("provider")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    (base_url, api_key, provider_id)
}

#[tauri::command]
pub async fn config_list_llm_models(
    state: State<'_, Arc<AppState>>,
    provider: serde_json::Value,
) -> Result<Vec<String>, String> {
    let (base_url, incoming_key, provider_id) = provider_fields(&provider);
    if base_url.trim().is_empty() {
        return Err("Base URL is required to list models".to_string());
    }

    let app_config = state.config.load().map_err(|e| e.to_string())?;
    let api_key = resolve_llm_api_key(&app_config, provider_id.as_deref(), &incoming_key);

    state
        .llm
        .list_models(&base_url, &api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn config_test_llm(
    state: State<'_, Arc<AppState>>,
    provider: serde_json::Value,
) -> Result<String, String> {
    let (base_url, incoming_key, provider_id) = provider_fields(&provider);
    let model = provider
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o")
        .to_string();

    let app_config = state.config.load().map_err(|e| e.to_string())?;
    let api_key = resolve_llm_api_key(&app_config, provider_id.as_deref(), &incoming_key);

    let config = LlmStreamConfig {
        base_url,
        api_key,
        model,
        temperature: 0.7,
        max_tokens: 50,
    };
    let messages = vec![ChatMessage::text("user", "Say hello in one word.")];
    state
        .llm
        .chat(messages, &config)
        .await
        .map_err(|e| e.to_string())
}
