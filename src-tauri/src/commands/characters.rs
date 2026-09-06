use crate::commands::require_id;
use crate::AppState;
use meuxe_core::character::slugify;
use meuxe_core::character::types::{Character, CharacterSummary, ModelInfo};
use meuxe_core::MeuxeError;
use rfd::FileDialog;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn characters_list(state: State<Arc<AppState>>) -> Result<Vec<CharacterSummary>, String> {
    state
        .characters
        .list_characters()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn characters_get(state: State<Arc<AppState>>, id: String) -> Result<Character, String> {
    require_id(&id)?;

    state
        .characters
        .load_character(&id)
        .map_err(|e| e.to_string())
}

pub(crate) fn map_character_create_error(err: MeuxeError) -> String {
    match err {
        MeuxeError::CharacterExists(_) => {
            "A companion with that name already exists. Pick a different name.".into()
        }
        MeuxeError::InvalidId(_) => "That name can't be used. Try letters and numbers.".into(),
        MeuxeError::InvalidConfig(msg) if msg.contains("letters or numbers") => {
            "That name can't be used. Try letters and numbers.".into()
        }
        other => other.to_string(),
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri command mirrors frontend create form fields.
pub fn characters_create(
    state: State<Arc<AppState>>,
    name: String,
    personality: String,
    model_id: String,
    voice: String,
    vibe: String,
    relationship_style: String,
    speech_style: String,
    user_name: String,
    user_about: String,
) -> Result<String, String> {
    require_id(&model_id)?;

    state
        .characters
        .create_character(
            &name,
            &personality,
            &model_id,
            &voice,
            &vibe,
            &relationship_style,
            &speech_style,
            &user_name,
            &user_about,
        )
        .map_err(map_character_create_error)
}

#[tauri::command]
pub fn models_list(state: State<Arc<AppState>>) -> Result<Vec<ModelInfo>, String> {
    meuxe_core::character::list_models(&state.data_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn models_import_live2d_dialog(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<ModelInfo>, String> {
    let data_dir = state.data_dir.clone();

    tokio::task::spawn_blocking(move || {
        let Some(source_dir) = FileDialog::new()
            .set_title("Select Live2D Model Folder")
            .pick_folder()
        else {
            return Ok(None);
        };

        if !contains_live2d_model(&source_dir) {
            return Err("Selected folder does not contain a Live2D .model3.json file.".to_string());
        }

        let models_root = data_dir.join("models").join("live2d");
        fs::create_dir_all(&models_root).map_err(|e| e.to_string())?;

        let base_name = source_dir
            .file_name()
            .and_then(|name| name.to_str())
            .map(slugify)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "live2d_model".to_string());

        let target_dir = unique_dir_path(&models_root, &base_name);
        copy_dir_recursive(&source_dir, &target_dir).map_err(|e| e.to_string())?;

        let imported_id = target_dir
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Failed to determine imported model id.".to_string())?;

        let imported = meuxe_core::character::list_models(&data_dir)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|model| model.id == imported_id)
            .ok_or_else(|| {
                "Imported Live2D model was copied but could not be indexed.".to_string()
            })?;

        Ok(Some(imported))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn models_import_vrm_dialog(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<ModelInfo>, String> {
    let data_dir = state.data_dir.clone();

    tokio::task::spawn_blocking(move || {
        let Some(source_file) = FileDialog::new()
            .set_title("Select VRM Model File")
            .add_filter("VRM Model", &["vrm"])
            .pick_file()
        else {
            return Ok(None);
        };

        let extension = source_file
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        if extension != "vrm" {
            return Err("Selected file is not a .vrm model.".to_string());
        }

        let models_root = data_dir.join("models").join("vrm");
        fs::create_dir_all(&models_root).map_err(|e| e.to_string())?;

        let base_name = source_file
            .file_stem()
            .and_then(|name| name.to_str())
            .map(slugify)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "vrm_model".to_string());

        let target_dir = unique_dir_path(&models_root, &base_name);
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        fs::copy(&source_file, target_dir.join("model.vrm")).map_err(|e| e.to_string())?;

        let imported_id = target_dir
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Failed to determine imported model id.".to_string())?;

        let imported = meuxe_core::character::list_models(&data_dir)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|model| model.id == imported_id)
            .ok_or_else(|| "Imported VRM model was copied but could not be indexed.".to_string())?;

        Ok(Some(imported))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn unique_dir_path(root: &Path, base_name: &str) -> PathBuf {
    let mut candidate = root.join(base_name);
    let mut counter = 2;

    while candidate.exists() {
        candidate = root.join(format!("{base_name}_{counter}"));
        counter += 1;
    }

    candidate
}

fn copy_dir_recursive(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::create_dir_all(target)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&path, &destination)?;
        }
    }

    Ok(())
}

fn contains_live2d_model(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.ends_with(".model3.json"))
                    .unwrap_or(false)
                {
                    return true;
                }
            } else if path.is_dir() && contains_live2d_model(&path) {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::map_character_create_error;
    use meuxe_core::MeuxeError;

    #[test]
    fn map_character_create_error_duplicate_name() {
        let msg = map_character_create_error(MeuxeError::CharacterExists("luna".into()));
        assert_eq!(
            msg,
            "A companion with that name already exists. Pick a different name."
        );
    }

    #[test]
    fn map_character_create_error_invalid_id() {
        let msg = map_character_create_error(MeuxeError::InvalidId("bad id".into()));
        assert_eq!(msg, "That name can't be used. Try letters and numbers.");
    }

    #[test]
    fn map_character_create_error_empty_slug() {
        let msg = map_character_create_error(MeuxeError::InvalidConfig(
            "Character name must contain letters or numbers".into(),
        ));
        assert_eq!(msg, "That name can't be used. Try letters and numbers.");
    }

    #[test]
    fn map_character_create_error_other() {
        let msg = map_character_create_error(MeuxeError::Io(std::io::Error::other("disk")));
        assert!(msg.contains("disk"));
    }
}
