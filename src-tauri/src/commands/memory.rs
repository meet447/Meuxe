use crate::commands::require_id;
use crate::commands::user::derive_user_id;
use crate::AppState;
use meuxe_core::memory::{Fact, MemorySnapshot};
use std::sync::Arc;
use tauri::State;

fn get_user_id(state: &AppState) -> Result<String, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    Ok(derive_user_id(&config))
}

#[tauri::command]
pub fn memory_snapshot(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<MemorySnapshot, String> {
    require_id(&character_id)?;

    let user_id = get_user_id(&state)?;
    state
        .memory
        .snapshot(&character_id, &user_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_add_fact(
    state: State<Arc<AppState>>,
    character_id: String,
    text: String,
) -> Result<Fact, String> {
    require_id(&character_id)?;

    let user_id = get_user_id(&state)?;
    state
        .memory
        .add_fact(&character_id, &user_id, &text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_update_fact(
    state: State<Arc<AppState>>,
    character_id: String,
    fact_id: String,
    text: String,
) -> Result<Fact, String> {
    require_id(&character_id)?;
    require_id(&fact_id)?;

    let user_id = get_user_id(&state)?;
    state
        .memory
        .update_fact(&character_id, &user_id, &fact_id, &text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_forget_fact(
    state: State<Arc<AppState>>,
    character_id: String,
    fact_id: String,
) -> Result<(), String> {
    require_id(&character_id)?;
    require_id(&fact_id)?;

    let user_id = get_user_id(&state)?;
    state
        .memory
        .forget_fact(&character_id, &user_id, &fact_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_forget_moment(
    state: State<Arc<AppState>>,
    character_id: String,
    moment_id: String,
) -> Result<(), String> {
    require_id(&character_id)?;
    require_id(&moment_id)?;

    let user_id = get_user_id(&state)?;
    state
        .memory
        .forget_moment(&character_id, &user_id, &moment_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_reset(state: State<Arc<AppState>>, character_id: String) -> Result<(), String> {
    require_id(&character_id)?;

    let user_id = get_user_id(&state)?;
    state
        .memory
        .reset(&character_id, &user_id)
        .map_err(|e| e.to_string())
}
