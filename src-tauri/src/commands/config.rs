use crate::acp::{invalidate_acp, invalidate_acp_if_agent_changed};
use crate::commands::require_id;
use crate::AppState;
use meuxe_core::config::types::AppConfig;
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
    let previous = state.config.load().map_err(|e| e.to_string())?;
    invalidate_acp_if_agent_changed(&state, &previous.agent, &config.agent);
    state.config.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_set_active_character(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<(), String> {
    require_id(&character_id)?;

    state
        .config
        .set_active_character(&character_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_reset_all(state: State<Arc<AppState>>) -> Result<(), String> {
    {
        let mut lock = state.chat_cancel.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(token) = lock.take() {
            token.cancel();
        }
    }

    reset::reset_app_data(&state.data_dir).map_err(|e| e.to_string())?;
    state.characters.clear_cache();
    state.config.reset_to_default().map_err(|e| e.to_string())?;
    invalidate_acp(&state);
    Ok(())
}

#[tauri::command]
pub fn config_reset_onboarding(state: State<Arc<AppState>>) -> Result<(), String> {
    state.config.reset_onboarding().map_err(|e| e.to_string())
}
