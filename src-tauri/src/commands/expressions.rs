use crate::AppState;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn expressions_supported() -> Vec<String> {
    meuxe_core::expressions::GLOBAL_EXPRESSIONS
        .iter()
        .map(|expr| expr.to_string())
        .collect()
}

#[tauri::command]
pub fn expressions_model_list(
    state: State<Arc<AppState>>,
    model_id: String,
) -> Result<Vec<String>, String> {
    meuxe_core::character::get_model_expressions(&state.data_dir, &model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn expressions_get(
    state: State<Arc<AppState>>,
    model_id: String,
) -> Result<HashMap<String, String>, String> {
    Ok(state.expressions.get_mapping(&model_id))
}

#[tauri::command]
pub fn expressions_save(
    state: State<Arc<AppState>>,
    model_id: String,
    mapping: HashMap<String, String>,
) -> Result<(), String> {
    state
        .expressions
        .save_mapping(&model_id, mapping)
        .map_err(|e| e.to_string())
}
