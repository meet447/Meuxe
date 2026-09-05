use std::path::Path;
use std::sync::Arc;

use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo, SessionMessage};

use agent_client_protocol::schema::v1::{
    ContentBlock, ContentChunk, InitializeRequest, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionNotification, SessionUpdate, StopReason,
};
use agent_client_protocol::schema::ProtocolVersion;
use meuxe_core::config::types::AgentConfig;
use meuxe_core::memory::MemorySnapshot;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::commands::chat::ChatDoneEvent;
use crate::AppState;

pub struct RunAcpChatStreamParams {
    pub app: AppHandle,
    pub state: Arc<AppState>,
    pub character_id: String,
    pub user_message: String,
    pub agent_prompt: String,
    pub request_id: String,
    pub cancel: CancellationToken,
    pub persona_context: String,
    pub memory_snapshot: MemorySnapshot,
    pub model_id: String,
    pub tts_config: meuxe_core::config::types::TtsConfig,
    pub agent_config: AgentConfig,
}

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

fn write_companion_home_context(
    companion_home: &Path,
    persona_context: &str,
    character_id: &str,
    snapshot: &MemorySnapshot,
) -> std::io::Result<()> {
    let agents_md = format!(
        "# Meuxe companion session\n\n\
You are the user's AI companion in **Meuxe** — not OpenCode, not Codex, and not a generic coding assistant.\n\
When asked who you are, answer as the companion in the persona below.\n\
Follow all expression-tag rules in the persona for avatar reactions.\n\n\
{persona}\n",
        persona = persona_context.trim()
    );
    std::fs::write(companion_home.join("AGENTS.md"), agents_md)?;
    std::fs::write(
        companion_home.join("persona").join("context.md"),
        persona_context,
    )?;
    std::fs::write(
        companion_home
            .join("relationship")
            .join(format!("{character_id}.md")),
        render_relationship_brief(character_id, snapshot),
    )?;
    std::fs::write(
        companion_home.join("memory").join("brief.md"),
        render_memory_brief(snapshot),
    )?;
    Ok(())
}

pub fn render_relationship_brief(character_id: &str, snapshot: &MemorySnapshot) -> String {
    let bond = &snapshot.bond.bond;
    let closeness_pct = (bond.closeness * 100.0).round() as u32;
    let mood = &bond.mood;

    let mut out = format!(
        "---\ncharacter: {character_id}\nupdated_at: {}\n---\n\n",
        bond.updated_at.to_rfc3339()
    );
    out.push_str(&format!("**Stage:** {}\n", snapshot.bond.stage));
    out.push_str(&format!("**Closeness:** {closeness_pct}%\n\n"));

    out.push_str("**Mood:**\n");
    out.push_str(&format!(
        "- Name: {}\n- Intensity: {:.2}\n",
        mood.name, mood.intensity
    ));
    if let Some(cause) = &mood.cause {
        out.push_str(&format!("- Cause: {cause}\n"));
    }
    if let Some(wants) = &mood.wants {
        out.push_str(&format!("- What would help: {wants}\n"));
    }
    out.push('\n');

    if !bond.threads.is_empty() {
        out.push_str("**Open threads:**\n");
        for thread in &bond.threads {
            out.push_str(&format!("- {}\n", thread.text));
        }
        out.push('\n');
    }

    if let Some(last) = bond.last_talked_at {
        out.push_str(&format!("**Last talked:** {}\n", last.to_rfc3339()));
    } else {
        out.push_str("**Last talked:** never\n");
    }

    out
}

pub fn render_memory_brief(snapshot: &MemorySnapshot) -> String {
    let mut out = String::from("# What you know about the user\n\n");
    if snapshot.facts.is_empty() {
        out.push_str("No facts yet.\n");
    } else {
        for fact in &snapshot.facts {
            out.push_str(&format!("- {}\n", fact.text));
        }
    }

    out.push_str("\n# Recent moments\n\n");
    if snapshot.moments.is_empty() {
        out.push_str("No moments yet.\n");
    } else {
        let count = snapshot.moments.len().min(10);
        for moment in snapshot.moments.iter().take(count) {
            out.push_str(&format!(
                "- {}: {}\n",
                moment.at.to_rfc3339(),
                moment.summary
            ));
        }
    }

    out
}

pub async fn resolve_acp_agent(config: &AgentConfig, data_dir: &Path) -> Result<AcpAgent, String> {
    match config.preset.as_str() {
        "opencode" => {
            let args = crate::commands::agent_setup::resolve_opencode_argv(data_dir).await;
            AcpAgent::from_args(args).map_err(|e| e.to_string())
        }
        "claude" => {
            if let Some(args) = crate::commands::agent_setup::resolve_claude_argv(data_dir).await {
                AcpAgent::from_args(args).map_err(|e| e.to_string())
            } else {
                Ok(AcpAgent::claude_agent())
            }
        }
        "codex" => {
            if let Some(args) = crate::commands::agent_setup::resolve_codex_argv(data_dir).await {
                AcpAgent::from_args(args).map_err(|e| e.to_string())
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

pub async fn run_acp_chat_stream(params: RunAcpChatStreamParams) -> Result<(), String> {
    let app = params.app;
    let state = params.state;
    let character_id = params.character_id;
    let user_message = params.user_message;
    let agent_prompt = params.agent_prompt;
    let request_id = params.request_id;
    let cancel = params.cancel;
    let persona_context = params.persona_context;
    let memory_snapshot = params.memory_snapshot;
    let model_id = params.model_id;
    let tts_config = params.tts_config;
    let agent_config = params.agent_config;

    let companion_home = companion_home_dir(&state.data_dir);
    ensure_companion_home(&state.data_dir).map_err(|e| e.to_string())?;
    write_companion_home_context(
        &companion_home,
        &persona_context,
        &character_id,
        &memory_snapshot,
    )
    .map_err(|e| e.to_string())?;

    if agent_config.preset != "custom" {
        crate::commands::agent_setup::ensure_agent_installed_globally(
            &state.data_dir,
            &agent_config.preset,
        )
        .await
        .map_err(|e| format!("Could not set up agent CLI: {e}"))?;
    }

    let agent = resolve_acp_agent(&agent_config, &state.data_dir).await?;
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
                        let mut splitter = meuxe_core::memory::TrailerSplitter::new();
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
                                                    let visible = splitter.feed(&chunk);
                                                    if !visible.is_empty() {
                                                        accumulated.push_str(&visible);
                                                        tts_buffer.push_str(&visible);
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
                                                            serde_json::json!({ "text": visible }),
                                                        );
                                                    }
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

                        let (rest, trailer) = splitter.finish();
                        if !rest.is_empty() {
                            accumulated.push_str(&rest);
                            tts_buffer.push_str(&rest);
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
                            .append_message(&character_id, &user_id, "user", &user_message, None)
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

                        let notes = trailer
                            .as_deref()
                            .and_then(meuxe_core::memory::parse_turn_notes);
                        let state_update = match state.memory.apply_turn(
                            &character_id,
                            &user_id,
                            &user_message,
                            notes,
                        ) {
                            Ok(snapshot) => serde_json::to_value(&snapshot).unwrap_or_default(),
                            Err(err) => {
                                eprintln!("[memory] failed to apply turn: {err}");
                                serde_json::Value::Null
                            }
                        };

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

#[cfg(test)]
mod tests {
    use super::{render_memory_brief, render_relationship_brief};
    use chrono::Utc;
    use meuxe_core::memory::{
        Bond, BondView, Fact, FactKind, FactSource, MemorySnapshot, Moment, Mood, Thread,
    };

    fn sample_snapshot() -> MemorySnapshot {
        let now = Utc::now();
        MemorySnapshot {
            bond: BondView {
                bond: Bond {
                    closeness: 0.42,
                    mood: Mood {
                        name: "worried".to_string(),
                        intensity: 0.4,
                        cause: Some("they sounded down".to_string()),
                        wants: Some("to hear how tomorrow goes".to_string()),
                        since: now,
                    },
                    threads: vec![Thread {
                        id: "t1".to_string(),
                        text: "Ask about the interview".to_string(),
                        opened_at: now,
                    }],
                    last_talked_at: Some(now),
                    turns: 12,
                    updated_at: now,
                },
                stage: "friends",
                seconds_since_last_talk: Some(3600),
            },
            facts: vec![Fact {
                id: "f1".to_string(),
                text: "Their dog is named Rex".to_string(),
                kind: FactKind::People,
                created_at: now,
                confirmed_at: now,
                mentions: 1,
                source: FactSource::Agent,
            }],
            moments: vec![Moment {
                id: "m1".to_string(),
                at: now,
                summary: "They talked about a tough interview".to_string(),
                feeling: Some("worried".to_string()),
                weight: 0.8,
            }],
            memory_dir: "/tmp/companions/rika".to_string(),
        }
    }

    #[test]
    fn relationship_brief_includes_stage_closeness_and_threads() {
        let snapshot = sample_snapshot();
        let md = render_relationship_brief("rika", &snapshot);
        assert!(md.contains("character: rika"));
        assert!(md.contains("**Stage:** friends"));
        assert!(md.contains("**Closeness:** 42%"));
        assert!(md.contains("Name: worried"));
        assert!(md.contains("- Ask about the interview"));
        assert!(md.contains("**Last talked:**"));
    }

    #[test]
    fn memory_brief_lists_facts_and_recent_moments() {
        let snapshot = sample_snapshot();
        let md = render_memory_brief(&snapshot);
        assert!(md.contains("# What you know about the user"));
        assert!(md.contains("- Their dog is named Rex"));
        assert!(md.contains("# Recent moments"));
        assert!(md.contains("They talked about a tough interview"));
    }
}
