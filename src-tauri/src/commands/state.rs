use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn state_get(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let config = state.config.load().unwrap_or_default();
    let user_id = if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meuxe_core::character::slugify(&config.user.name)
    };
    let rel_state = state
        .states
        .load(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&rel_state).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn state_reset(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meuxe_core::character::slugify(&config.user.name)
    };
    let rel_state = state.states.reset(&character_id, &user_id).map_err(|e| e.to_string())?;
    serde_json::to_value(&rel_state).map_err(|e| e.to_string())
}
