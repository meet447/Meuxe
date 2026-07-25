use std::path::Path;
use std::sync::Arc;

use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo, SessionMessage};

use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::schema::v1::{
    ContentBlock, ContentChunk, InitializeRequest, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionNotification, SessionUpdate, StopReason,
};
use meuxe_core::config::types::AgentConfig;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::AppState;
use crate::commands::chat::ChatDoneEvent;

pub fn companion_home_dir(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("companion-home")
}

pub fn ensure_companion_home(data_dir: &Path) -> std::io::Result<()> {
    let root = companion_home_dir(data_dir);
    for sub in ["persona", "memory", "relationship", "journal", "workspace"] {
        std::fs::create_dir_all(root.join(sub))?;
    }
    Ok(())
}

fn write_companion_home_context(companion_home: &Path, persona_context: &str) -> std::io::Result<()> {
    let agents_md = format!(
        "# Meuxe companion session\n\n\
You are the user's AI companion in **Meuxe** — not OpenCode, not Codex, and not a generic coding assistant.\n\
When asked who you are, answer as the companion in the persona below.\n\
Follow all expression-tag rules in the persona for avatar reactions.\n\n\
{persona}\n",
        persona = persona_context.trim()
    );
    std::fs::write(companion_home.join("AGENTS.md"), agents_md)?;
    std::fs::write(companion_home.join("persona").join("context.md"), persona_context)?;
    Ok(())
}

pub fn resolve_acp_agent(config: &AgentConfig, data_dir: &Path) -> Result<AcpAgent, String> {
    match config.preset.as_str() {
        "opencode" => {
            if let Some(managed) = crate::commands::agent_setup::resolve_managed_bin(data_dir, "opencode") {
                let path = managed.to_string_lossy().into_owned();
                AcpAgent::from_args([path, "acp".to_string()]).map_err(|e| e.to_string())
            } else {
                AcpAgent::from_args(["opencode", "acp"]).map_err(|e| e.to_string())
            }
        }
        "claude" => {
            if let Some(managed) =
                crate::commands::agent_setup::resolve_managed_bin(data_dir, "claude-agent-acp")
            {
                let path = managed.to_string_lossy().into_owned();
                AcpAgent::from_args([path]).map_err(|e| e.to_string())
            } else {
                Ok(AcpAgent::claude_agent())
            }
        }
        "codex" => {
            if let Some(managed) = crate::commands::agent_setup::resolve_managed_bin(data_dir, "codex-acp") {
                let path = managed.to_string_lossy().into_owned();
                AcpAgent::from_args([path]).map_err(|e| e.to_string())
            } else {
                Ok(AcpAgent::codex())
            }
        }
        "custom" => {
            if config.program.is_empty() {
                return Err("Custom ACP agent requires a command in Settings.".into());
            }
            let mut parts = vec![config.program.clone()];
            parts.extend(config.args.clone());
            AcpAgent::from_args(parts).map_err(|e| e.to_string())
        }
        other => Err(format!("Unknown ACP preset: {other}")),
    }
}

pub async fn run_acp_chat_stream(
    app: AppHandle,
    state: Arc<AppState>,
    character_id: String,
    user_message: String,
    agent_prompt: String,
    request_id: String,
    cancel: CancellationToken,
    persona_context: String,
    model_id: String,
    tts_config: meuxe_core::config::types::TtsConfig,
    agent_config: AgentConfig,
) -> Result<(), String> {
    let companion_home = companion_home_dir(&state.data_dir);
    ensure_companion_home(&state.data_dir).map_err(|e| e.to_string())?;
    write_companion_home_context(&companion_home, &persona_context).map_err(|e| e.to_string())?;

    let agent = resolve_acp_agent(&agent_config, &state.data_dir)?;
    let user_id = derive_user_id_from_state(&state)?;

    let app_emit = app.clone();
    let request_id_emit = request_id.clone();
    let cancel_read = cancel.clone();
    let state_for_session = state.clone();
    let character_id_session = character_id.clone();
    let user_message_session = user_message.clone();
    let request_id_session = request_id.clone();
    let model_id_session = model_id.clone();
    let tts_config_session = tts_config.clone();
    let agent_prompt_send = agent_prompt.clone();

    Client
        .builder()
        .name("meuxe")
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _connection| {
                let option_id = request.options.first().map(|opt| opt.option_id.clone());
                if let Some(id) = option_id {
                    responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(id)),
                    ))?;
                } else {
                    responder.respond(RequestPermissionResponse::new(
                        RequestPermissionOutcome::Cancelled,
                    ))?;
                }
                Ok(())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, move |connection: ConnectionTo<Agent>| {
            let app = app_emit.clone();
            let request_id = request_id_emit.clone();
            let cancel = cancel_read.clone();
            let state = state_for_session.clone();
            let model_id = model_id_session.clone();
            let tts_config = tts_config_session.clone();
            let character_id = character_id_session.clone();
            let user_message = user_message_session.clone();
            let request_id_done = request_id_session.clone();
            let user_id = user_id.clone();
            let companion_home = companion_home.clone();
            let agent_prompt_send = agent_prompt_send.clone();

            async move {
                connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;

                connection
                    .build_session(&companion_home)
                    .block_task()
                    .run_until(async move |mut session| {
                        let mut accumulated = String::new();
                        let mut tts_buffer = String::new();
                        let mut sentence_index = 0u32;
                        let mut current_expression = "neutral".to_string();

                        session.send_prompt(&agent_prompt_send)?;

                        loop {
                            if cancel.is_cancelled() {
                                break;
                            }

                            let update = tokio::select! {
                                () = cancel.cancelled() => break,
                                res = session.read_update() => res?,
                            };

                            match update {
                                SessionMessage::SessionMessage(dispatch) => {
                                    MatchDispatch::new(dispatch)
                                        .if_notification(async |notif: SessionNotification| {
                                            if let SessionUpdate::AgentMessageChunk(
                                                ContentChunk {
                                                    content: ContentBlock::Text(text),
                                                    ..
                                                },
                                            ) = notif.update
                                            {
                                                let chunk = text.text;
                                                if !chunk.is_empty() {
                                                    accumulated.push_str(&chunk);
                                                    tts_buffer.push_str(&chunk);
                                                    crate::commands::chat::drain_buffer_sentences(
                                                        &app,
                                                        &state,
                                                        &model_id,
                                                        &mut current_expression,
                                                        &tts_config,
                                                        &request_id,
                                                        &cancel,
                                                        &mut sentence_index,
                                                        &mut tts_buffer,
                                                        false,
                                                    );
                                                    let _ = app.emit(
                                                        "chat:text-chunk",
                                                        serde_json::json!({ "text": chunk }),
                                                    );
                                                }
                                            }
                                            Ok(())
                                        })
                                        .await
                                        .otherwise_ignore()?;
                                }
                                SessionMessage::StopReason(reason) => {
                                    if reason == StopReason::Cancelled {
                                        return Ok(());
                                    }
                                    break;
                                }
                                _ => {}
                            }
                        }

                        if !accumulated.trim().is_empty() {
                            crate::commands::chat::drain_buffer_sentences(
                                &app,
                                &state,
                                &model_id,
                                &mut current_expression,
                                &tts_config,
                                &request_id,
                                &cancel,
                                &mut sentence_index,
                                &mut tts_buffer,
                                true,
                            );
                        }

                        let cleaned_response =
                            crate::commands::chat::clean_text_for_memory(&accumulated);

                        state
                            .sessions
                            .append_message(
                                &character_id,
                                &user_id,
                                "user",
                                &user_message,
                                None,
                            )
                            .map_err(|e| {
                                agent_client_protocol::Error::internal_error().data(e.to_string())
                            })?;
                        state
                            .sessions
                            .append_message(
                                &character_id,
                                &user_id,
                                "assistant",
                                &cleaned_response,
                                None,
                            )
                            .map_err(|e| {
                                agent_client_protocol::Error::internal_error().data(e.to_string())
                            })?;

                        if let Err(err) = state.memory_vault.ingest_chat_exchange(
                            &character_id,
                            &user_id,
                            &user_message,
                            &cleaned_response,
                        ) {
                            eprintln!("[memory-vault] failed to ingest chat exchange: {err}");
                        }

                        let _ = meuxe_core::memory::remember_exchange(
                            &state.memories,
                            &character_id,
                            &user_id,
                            &user_message,
                            &cleaned_response,
                        );

                        let state_update = state
                            .memory_vault
                            .overview(&character_id, &user_id)
                            .map(serde_json::to_value)
                            .ok()
                            .and_then(Result::ok)
                            .unwrap_or(serde_json::Value::Null);

                        let _ = app.emit(
                            "chat:done",
                            ChatDoneEvent {
                                request_id: request_id_done,
                                state_update,
                            },
                        );

                        Ok(())
                    })
                    .await?;

                Ok(())
            }
        })
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn derive_user_id_from_state(state: &AppState) -> Result<String, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    if !config.user.id.trim().is_empty() {
        return Ok(config.user.id.trim().to_string());
    }
    if !config.user.name.trim().is_empty() {
        return Ok(meuxe_core::character::slugify(&config.user.name));
    }
    Ok("default-user".to_string())
}
