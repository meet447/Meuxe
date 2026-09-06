mod acp;
mod commands;
mod tray;
mod window;

use meuxe_core::character::CharacterLoader;
use meuxe_core::config::ConfigManager;
use meuxe_core::expressions::ExpressionManager;
use meuxe_core::memory::CompanionMemory;
use meuxe_core::session::SessionStore;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;
use whisper_rs::{WhisperContext, WhisperContextParameters};

pub struct AppState {
    pub data_dir: PathBuf,
    pub config: ConfigManager,
    pub characters: CharacterLoader,
    pub sessions: SessionStore,
    pub memory: CompanionMemory,
    pub expressions: ExpressionManager,
    pub whisper_ctx: Option<Arc<WhisperContext>>,
    pub chat_cancel: std::sync::Mutex<Option<tokio_util::sync::CancellationToken>>,
}

// Broadcast an event to ALL windows (used by global shortcuts)
#[tauri::command]
fn broadcast_event(app: tauri::AppHandle, event: String) -> Result<(), String> {
    use tauri::Emitter;
    app.emit(&event, ()).map_err(|e| e.to_string())
}

// Command to get the app data directory path
#[tauri::command]
fn get_data_dir(state: tauri::State<Arc<AppState>>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

// Command to resolve a relative asset path to a convertFileSrc-compatible URL
#[tauri::command]
fn resolve_asset_path(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    path: String,
) -> Result<String, String> {
    let clean = path.trim_start_matches('/');
    if clean.is_empty() {
        return Err("Asset path is empty".into());
    }
    if Path::new(clean).is_absolute() {
        return Err(format!("Absolute asset paths are not allowed: {clean}"));
    }
    if Path::new(clean)
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return Err(format!("Asset path must not contain '..': {clean}"));
    }

    let mut roots: Vec<PathBuf> = vec![state.data_dir.clone()];
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir);
    }

    for root in &roots {
        if let Some(resolved) = resolve_under_root(root, clean) {
            return Ok(resolved.to_string_lossy().to_string());
        }
    }

    if cfg!(debug_assertions) {
        let dev_candidates = [PathBuf::from(clean), PathBuf::from("..").join(clean)];
        for candidate in dev_candidates {
            if candidate.is_file() {
                let resolved = candidate.canonicalize().unwrap_or(candidate);
                return Ok(resolved.to_string_lossy().to_string());
            }
        }
    }

    Err(format!("Asset not found: {clean}"))
}

fn resolve_under_root(root: &Path, relative: &str) -> Option<PathBuf> {
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return None;
    }
    if rel
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return None;
    }

    let candidate = root.join(rel);
    if !candidate.is_file() {
        return None;
    }

    let canonical_root = root.canonicalize().ok()?;
    let canonical_file = candidate.canonicalize().ok()?;
    if canonical_file.starts_with(&canonical_root) {
        Some(canonical_file)
    } else {
        None
    }
}

fn load_whisper_model(data_dir: &Path) -> Option<Arc<WhisperContext>> {
    // Search for model in multiple locations
    let candidates = [
        data_dir.join("models/whisper/ggml-tiny.bin"),
        PathBuf::from("models/whisper/ggml-tiny.bin"),
        PathBuf::from("../models/whisper/ggml-tiny.bin"),
    ];

    for path in &candidates {
        if path.exists() {
            let path_str = path.to_string_lossy().to_string();
            match WhisperContext::new_with_params(&path_str, WhisperContextParameters::default()) {
                Ok(ctx) => {
                    println!("Whisper model loaded from: {path_str}");
                    return Some(Arc::new(ctx));
                }
                Err(e) => {
                    eprintln!("Failed to load whisper model from {path_str}: {e}");
                }
            }
        }
    }

    eprintln!("Whisper model not found. Local transcription disabled.");
    None
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
            if let Err(err) = acp::ensure_companion_home(&data_dir) {
                eprintln!("[acp] failed to create companion-home: {err}");
            }

            let whisper_ctx = load_whisper_model(&data_dir);

            let state = AppState {
                data_dir: data_dir.clone(),
                config: ConfigManager::new(&data_dir),
                characters: CharacterLoader::new(&data_dir),
                sessions: SessionStore::new(&data_dir),
                memory: CompanionMemory::new(&data_dir),
                expressions: ExpressionManager::new(&data_dir),
                whisper_ctx,
                chat_cancel: std::sync::Mutex::new(None),
            };

            app.manage(Arc::new(state));

            // Setup system tray
            tray::setup_tray(app.handle()).expect("Failed to setup tray");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_save,
            commands::config::config_reset_all,
            commands::config::config_reset_onboarding,
            commands::characters::characters_list,
            commands::characters::characters_get,
            commands::characters::characters_create,
            commands::characters::models_list,
            commands::characters::models_import_live2d_dialog,
            commands::characters::models_import_vrm_dialog,
            commands::chat::chat_send,
            commands::chat::chat_cancel,
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::agent_setup::agent_setup_status,
            commands::agent_setup::agent_setup_install,
            commands::memory::memory_snapshot,
            commands::memory::memory_add_fact,
            commands::memory::memory_update_fact,
            commands::memory::memory_forget_fact,
            commands::memory::memory_forget_moment,
            commands::memory::memory_reset,
            commands::expressions::expressions_supported,
            commands::expressions::expressions_model_list,
            commands::expressions::expressions_get,
            commands::expressions::expressions_save,
            commands::tts::tts_voices,
            commands::tts::tts_preview,
            commands::voice::voice_transcribe,
            commands::voice::voice_transcribe_local,
            window::window_toggle_mini,
            window::window_expand,
            get_data_dir,
            broadcast_event,
            resolve_asset_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
