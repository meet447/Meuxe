mod acp;
mod commands;
mod tray;
mod window;

use meuxe_core::character::CharacterLoader;
use meuxe_core::config::ConfigManager;
use meuxe_core::expressions::ExpressionManager;
use meuxe_core::memory::store::MemoryStore;
use meuxe_core::memory_vault::MemoryVault;
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
    pub memories: MemoryStore,
    pub memory_vault: MemoryVault,
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
fn resolve_asset_path(state: tauri::State<Arc<AppState>>, path: String) -> Result<String, String> {
    let clean = path.trim_start_matches('/');
    let candidates = [
        state.data_dir.join(clean),
        PathBuf::from(clean),
        PathBuf::from("..").join(clean),
    ];

    for full_path in candidates {
        if full_path.exists() && full_path.is_file() {
            return Ok(full_path.to_string_lossy().to_string());
        }
    }

    Err(format!("Asset not found: {clean}"))
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
                memories: MemoryStore::new(data_dir.clone()),
                memory_vault: MemoryVault::new(data_dir.clone()),
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
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::agent_setup::agent_setup_status,
            commands::agent_setup::agent_setup_install,
            commands::memory::memory_get,
            commands::memory::memory_search,
            commands::memory::memory_clear,
            commands::memory::memory_overview,
            commands::memory::memory_rebuild_vault,
            commands::memory::memory_run_dream,
            commands::memory::memory_dream_status,
            commands::memory::memory_migrate_legacy,
            commands::memory::memory_delete,
            commands::memory::memory_set_pinned,
            commands::memory::memory_sources,
            commands::memory::memory_topics,
            commands::memory::memory_ingest_note,
            commands::memory::memory_ingest_transcript,
            commands::memory::memory_ingest_file_dialog,
            commands::memory::memory_ingest_folder_dialog,
            commands::memory::memory_export_zip_dialog,
            commands::memory::memory_import_zip_dialog,
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
