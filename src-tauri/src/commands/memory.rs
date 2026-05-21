use crate::AppState;
use chrono::Utc;
use meux_core::composio::{
    client::{connection_status_from_value, extract_proxy_text, tool_payload, value_string},
    extract_github_readme_markdown, gmail_messages_to_markdown, is_composio_connected,
    status_display_label, ComposioClient, GITHUB_README_TOOL, GMAIL_FETCH_TOOL,
};
use meux_core::composio_toolkits::{default_enabled_toolkits, toolkit_display_name};
use meux_core::config::types::ComposioConnectionConfig;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

fn get_user_id(state: &AppState) -> String {
    let config = state.config.load().unwrap_or_default();
    if !config.user.id.is_empty() {
        config.user.id
    } else if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meux_core::character::slugify(&config.user.name)
    }
}

fn composio_api_key(state: &AppState) -> Result<String, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    config
        .composio
        .api_key
        .filter(|key| !key.trim().is_empty() && !key.contains("..."))
        .ok_or_else(|| "Composio API key is not configured".to_string())
}

#[tauri::command]
pub fn memory_get(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let user_id = get_user_id(&state);
    let vault_memories = state
        .memory_vault
        .list_memories(&character_id, &user_id, None, 200)
        .map_err(|e| e.to_string())?;
    if !vault_memories.is_empty() {
        return vault_memories
            .into_iter()
            .map(|m| {
                serde_json::to_value(meux_core::memory_vault::VaultMemoryRecord::from(m))
                    .map_err(|e| e.to_string())
            })
            .collect();
    }

    let memories = state
        .memories
        .list(&character_id, &user_id, None, 50)
        .map_err(|e| e.to_string())?;
    let values: Vec<serde_json::Value> = memories
        .iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();
    Ok(values)
}

#[tauri::command]
pub fn memory_search(
    state: State<Arc<AppState>>,
    character_id: String,
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    let user_id = get_user_id(&state);
    let vault_results = state
        .memory_vault
        .search_memories(&character_id, &user_id, &query, 20)
        .map_err(|e| e.to_string())?;
    if !vault_results.is_empty() {
        return vault_results
            .into_iter()
            .map(|m| {
                serde_json::to_value(meux_core::memory_vault::VaultMemoryRecord::from(m))
                    .map_err(|e| e.to_string())
            })
            .collect();
    }

    let all_memories = state
        .memories
        .list(&character_id, &user_id, None, usize::MAX)
        .map_err(|e| e.to_string())?;
    let relevant = meux_core::memory::retriever::retrieve_relevant(&query, &all_memories, 4);
    let values: Vec<serde_json::Value> = relevant
        .iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();
    Ok(values)
}

#[tauri::command]
pub fn memory_clear(state: State<Arc<AppState>>, character_id: String) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memory_vault
        .clear(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    state
        .memories
        .clear(&character_id, &user_id, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_overview(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let overview = state
        .memory_vault
        .overview(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(overview).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_rebuild_vault(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<String, String> {
    let user_id = get_user_id(&state);
    let path = state
        .memory_vault
        .rebuild_vault(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn memory_run_dream(
    app: AppHandle,
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let _ = app.emit(
        "memory:dream-status",
        serde_json::json!({ "character_id": character_id, "status": "running" }),
    );
    let dream = state
        .memory_vault
        .run_dream(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "memory:dream-status",
        serde_json::json!({ "character_id": character_id, "status": "completed", "dream": dream.clone() }),
    );
    serde_json::to_value(dream).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_dream_status(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let dream = state
        .memory_vault
        .latest_dream(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(dream).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_migrate_legacy(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let legacy = state
        .memories
        .list(&character_id, &user_id, None, usize::MAX)
        .map_err(|e| e.to_string())?;
    state
        .memory_vault
        .migrate_legacy_memories(&character_id, &user_id, &legacy)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_delete(
    state: State<Arc<AppState>>,
    character_id: String,
    memory_id: String,
) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memory_vault
        .delete_memory(&character_id, &user_id, &memory_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_set_pinned(
    state: State<Arc<AppState>>,
    character_id: String,
    memory_id: String,
    pinned: bool,
) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memory_vault
        .set_memory_pinned(&character_id, &user_id, &memory_id, pinned)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_sources(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let sources = state
        .memory_vault
        .list_sources(&character_id, &user_id, 100)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(meux_core::memory_vault::types::MemorySourceRecord::from)
        .collect::<Vec<_>>();
    serde_json::to_value(sources).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_topics(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let topics = state
        .memory_vault
        .topic_summaries(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(topics).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_ingest_note(
    state: State<Arc<AppState>>,
    character_id: String,
    title: String,
    body: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let saved = state
        .memory_vault
        .ingest_manual_note(&character_id, &user_id, &title, &body)
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}

#[tauri::command]
pub fn memory_ingest_transcript(
    state: State<Arc<AppState>>,
    character_id: String,
    title: String,
    transcript: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let saved = state
        .memory_vault
        .ingest_meeting_transcript(&character_id, &user_id, &title, &transcript)
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}

#[tauri::command]
pub fn memory_ingest_file_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<usize>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Text", &["md", "markdown", "txt"])
        .pick_file()
    else {
        return Ok(None);
    };
    let saved = state
        .memory_vault
        .ingest_text_file(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(saved.len()))
}

#[tauri::command]
pub fn memory_ingest_folder_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<usize>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    let saved = state
        .memory_vault
        .ingest_text_folder(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(saved))
}

#[tauri::command]
pub fn memory_export_zip_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<String>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("meux-memory-vault.zip")
        .save_file()
    else {
        return Ok(None);
    };
    let exported = state
        .memory_vault
        .export_zip(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(exported.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn memory_import_zip_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<usize>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Zip", &["zip"])
        .pick_file()
    else {
        return Ok(None);
    };
    let imported = state
        .memory_vault
        .import_zip(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(imported))
}

#[tauri::command]
pub async fn composio_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let mut config = state.config.load().map_err(|e| e.to_string())?;
    let has_key = config
        .composio
        .api_key
        .as_ref()
        .is_some_and(|key| !key.trim().is_empty() && !key.contains("..."));

    if !has_key {
        return Ok(serde_json::json!([]));
    }

    let enabled = if config.composio.enabled_toolkits.is_empty() {
        default_enabled_toolkits()
    } else {
        config.composio.enabled_toolkits.clone()
    };

    let client = ComposioClient::new(config.composio.api_key.clone().unwrap_or_default());
    let mut dirty = false;
    let mut statuses = Vec::new();

    for slug in enabled {
        let mut connection = config
            .composio
            .connections
            .get(&slug)
            .cloned()
            .unwrap_or_default();

        if let Some(account_id) = connection.connected_account_id.clone() {
            match client.connected_account(&account_id).await {
                Ok(value) => {
                    connection.status = connection_status_from_value(&value);
                    connection.last_checked_at = Some(Utc::now().to_rfc3339());
                    dirty = true;
                }
                Err(err) => {
                    connection.status = format!("refresh_failed: {err}");
                    connection.last_checked_at = Some(Utc::now().to_rfc3339());
                    dirty = true;
                }
            }
        }

        let connected = is_composio_connected(&connection.status);
        let status_label = status_display_label(&connection.status, true);
        statuses.push(serde_json::json!({
            "slug": slug,
            "name": toolkit_display_name(&slug),
            "connected": connected,
            "status": status_label,
            "auth_config_id": connection.auth_config_id,
            "connected_account_id": connection.connected_account_id,
            "redirect_url": connection.redirect_url,
            "last_sync_at": connection.last_checked_at,
        }));
        config.composio.connections.insert(slug, connection);
    }

    if dirty {
        let _ = state.config.save(&config);
    }
    serde_json::to_value(statuses).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn composio_save_config(
    state: State<Arc<AppState>>,
    api_key: Option<String>,
    enabled_toolkits: Vec<String>,
) -> Result<(), String> {
    let mut config = state.config.load().map_err(|e| e.to_string())?;
    if let Some(key) = api_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() && !trimmed.contains("...") {
            config.composio.api_key = Some(trimmed.to_string());
        }
    }
    if !enabled_toolkits.is_empty() {
        config.composio.enabled_toolkits = enabled_toolkits;
    }
    state.config.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn composio_authorize_toolkit(
    state: State<'_, Arc<AppState>>,
    toolkit: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let api_key = composio_api_key(&state)?;
    let client = ComposioClient::new(api_key);
    let auth_config_id = client.find_or_create_auth_config(&toolkit).await.map_err(|e| e.to_string())?;
    let (connected_account_id, redirect_url, link_status) = client
        .link_toolkit(&user_id, &auth_config_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut config = state.config.load().map_err(|e| e.to_string())?;
    if !config.composio.enabled_toolkits.contains(&toolkit) {
        config.composio.enabled_toolkits.push(toolkit.clone());
    }
    config.composio.connections.insert(
        toolkit.clone(),
        ComposioConnectionConfig {
            auth_config_id: Some(auth_config_id.clone()),
            connected_account_id: Some(connected_account_id.clone()),
            status: link_status.clone(),
            redirect_url: Some(redirect_url.clone()),
            last_checked_at: Some(Utc::now().to_rfc3339()),
        },
    );
    state.config.save(&config).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "toolkit": toolkit,
        "auth_config_id": auth_config_id,
        "connected_account_id": connected_account_id,
        "redirect_url": redirect_url,
        "status": status_display_label(&link_status, true),
    }))
}

#[tauri::command]
pub async fn composio_refresh_toolkit(
    state: State<'_, Arc<AppState>>,
    toolkit: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let api_key = composio_api_key(&state)?;
    let client = ComposioClient::new(api_key);
    let mut config = state.config.load().map_err(|e| e.to_string())?;
    let mut connection = config
        .composio
        .connections
        .get(&toolkit)
        .cloned()
        .unwrap_or_default();

    if connection.auth_config_id.is_none() {
        connection.auth_config_id = Some(
            client
                .find_or_create_auth_config(&toolkit)
                .await
                .map_err(|e| e.to_string())?,
        );
    }

    if let Some(account_id) = connection.connected_account_id.clone() {
        let value = client
            .connected_account(&account_id)
            .await
            .map_err(|e| e.to_string())?;
        connection.status = connection_status_from_value(&value);
    } else {
        let accounts = client
            .list_connected_accounts(&user_id, connection.auth_config_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;
        if let Some(account) = accounts.first() {
            connection.connected_account_id = value_string(account, &["id", "nanoid"]);
            connection.status = connection_status_from_value(account);
        } else {
            connection.status = "NOT_CONNECTED".to_string();
        }
    }
    connection.last_checked_at = Some(Utc::now().to_rfc3339());
    config
        .composio
        .connections
        .insert(toolkit.clone(), connection.clone());
    state.config.save(&config).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "toolkit": toolkit,
        "auth_config_id": connection.auth_config_id,
        "connected_account_id": connection.connected_account_id,
        "status": status_display_label(&connection.status, true),
        "connected": is_composio_connected(&connection.status),
        "redirect_url": connection.redirect_url,
        "last_checked_at": connection.last_checked_at,
    }))
}

#[tauri::command]
pub async fn composio_sync_github_readme(
    state: State<'_, Arc<AppState>>,
    character_id: String,
    owner: String,
    repo: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let api_key = composio_api_key(&state)?;
    let client = ComposioClient::new(api_key);
    let config = state.config.load().map_err(|e| e.to_string())?;
    let connected_account_id =
        ComposioClient::connected_account_for_toolkit(&config.composio.connections, "github")
            .map_err(|e| e.to_string())?;

    let readme = match client
        .execute_tool(
            GITHUB_README_TOOL,
            &user_id,
            &connected_account_id,
            serde_json::json!({
                "owner": owner,
                "repo": repo,
            }),
        )
        .await
    {
        Ok(tool_response) => extract_github_readme_markdown(&tool_response, None)
            .map_err(|e| e.to_string())?,
        Err(_) => {
            let proxy_response = client
                .proxy_request(
                    &connected_account_id,
                    &format!("/repos/{owner}/{repo}/readme"),
                    "GET",
                    vec![serde_json::json!({
                        "name": "Accept",
                        "in": "header",
                        "value": "application/vnd.github.raw",
                    })],
                )
                .await
                .map_err(|e| e.to_string())?;
            extract_proxy_text(&proxy_response).map_err(|e| e.to_string())?
        }
    };
    let saved = state
        .memory_vault
        .ingest_composio_github_readonly(&character_id, &user_id, &owner, &repo, &readme)
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}

#[tauri::command]
pub async fn composio_sync_gmail(
    state: State<'_, Arc<AppState>>,
    character_id: String,
    max_results: Option<u32>,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let api_key = composio_api_key(&state)?;
    let client = ComposioClient::new(api_key);
    let config = state.config.load().map_err(|e| e.to_string())?;
    let connected_account_id =
        ComposioClient::connected_account_for_toolkit(&config.composio.connections, "gmail")
            .map_err(|e| e.to_string())?;

    let limit = max_results.unwrap_or(20).clamp(1, 50);
    let response = client
        .execute_tool(
            GMAIL_FETCH_TOOL,
            &user_id,
            &connected_account_id,
            serde_json::json!({
                "max_results": limit,
                "verbose": false,
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    let markdown = gmail_messages_to_markdown(tool_payload(&response));
    let saved = state
        .memory_vault
        .ingest_composio_gmail_readonly(
            &character_id,
            &user_id,
            "Recent Gmail inbox",
            &markdown,
            serde_json::json!({
                "tool": GMAIL_FETCH_TOOL,
                "max_results": limit,
            }),
        )
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}
