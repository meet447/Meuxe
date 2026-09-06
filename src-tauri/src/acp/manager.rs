use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use agent_client_protocol::schema::v1::{
    CancelNotification, ContentBlock, ContentChunk, InitializeRequest, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionNotification, SessionUpdate, StopReason, ToolCallStatus,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{Agent, Client, ConnectionTo, SessionMessage};
use meuxe_core::config::types::AgentConfig;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::acp::run::{
    companion_home_dir, ensure_companion_home, pick_companion_permission, resolve_acp_agent,
};
use crate::acp::tools::{
    is_terminal_tool_status, permission_description, permission_id_for, permission_kind_snake_case,
    permission_outcome, render_tool_result, tool_call_arguments, tool_call_id_str,
    tool_display_name, tool_update_arguments,
};
use crate::acp::RunAcpChatStreamParams;
use crate::commands::chat::ChatDoneEvent;
use crate::AppState;

pub async fn dispatch_turn(
    state: Arc<AppState>,
    params: RunAcpChatStreamParams,
) -> Result<(), String> {
    let app = params.app.clone();
    let agent_config = params.agent_config.clone();

    let (result_tx, result_rx) = oneshot::channel();
    let mut job = Some(TurnJob { params, result_tx });

    // The connection task can die between turns (agent crash, CLI removed). A
    // closed channel means we must respawn, so allow one retry.
    for attempt in 0..2 {
        let turn_tx = {
            let mut acp = state.acp.lock().unwrap_or_else(|p| p.into_inner());
            acp.ensure_connection(app.clone(), Arc::clone(&state), &agent_config)?;
            acp.turn_tx
                .clone()
                .ok_or_else(|| "ACP connection is not available".to_string())?
        };

        match turn_tx
            .send(job.take().expect("job is present until sent"))
            .await
        {
            Ok(()) => break,
            Err(mpsc::error::SendError(returned)) => {
                invalidate_acp(&state);
                if attempt == 1 {
                    return Err(
                        "The agent connection closed before your message was sent. Try again."
                            .to_string(),
                    );
                }
                job = Some(returned);
            }
        }
    }

    result_rx.await.map_err(|_| {
        "The agent connection ended unexpectedly. Send your message again to restart it."
            .to_string()
    })?
}

pub(crate) struct TurnJob {
    params: RunAcpChatStreamParams,
    result_tx: oneshot::Sender<Result<(), String>>,
}

struct TurnOutcome {
    poison_session: bool,
}

pub struct AcpConnectionManager {
    turn_tx: Option<mpsc::Sender<TurnJob>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    agent_key: Option<String>,
    session_characters: Arc<Mutex<HashSet<String>>>,
    active_request_id: Arc<Mutex<Option<String>>>,
    active_cancel: Arc<Mutex<Option<CancellationToken>>>,
}

impl Default for AcpConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AcpConnectionManager {
    pub fn new() -> Self {
        Self {
            turn_tx: None,
            shutdown_tx: None,
            agent_key: None,
            session_characters: Arc::new(Mutex::new(HashSet::new())),
            active_request_id: Arc::new(Mutex::new(None)),
            active_cancel: Arc::new(Mutex::new(None)),
        }
    }

    /// True only if the live connection matches `agent_config` and already holds a
    /// session for this character, i.e. the agent still has the conversation context.
    pub fn has_live_session(&self, character_id: &str, agent_config: &AgentConfig) -> bool {
        let connection_live = self.turn_tx.as_ref().is_some_and(|tx| !tx.is_closed());
        connection_live
            && self.agent_key.as_deref() == Some(agent_config_key(agent_config).as_str())
            && self
                .session_characters
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .contains(character_id)
    }

    pub fn invalidate(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        // Break out of an in-flight turn so the loop observes the shutdown promptly.
        if let Some(cancel) = self
            .active_cancel
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .as_ref()
        {
            cancel.cancel();
        }
        self.turn_tx = None;
        self.agent_key = None;
        self.session_characters
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
    }

    pub fn ensure_connection(
        &mut self,
        app: AppHandle,
        state: Arc<AppState>,
        agent_config: &AgentConfig,
    ) -> Result<(), String> {
        let agent_key = agent_config_key(agent_config);
        let connection_dead = self.turn_tx.as_ref().is_none_or(|tx| tx.is_closed());
        if connection_dead || self.agent_key.as_deref() != Some(&agent_key) {
            self.start_connection(app, state, agent_config)?;
        }
        Ok(())
    }

    fn start_connection(
        &mut self,
        app: AppHandle,
        state: Arc<AppState>,
        agent_config: &AgentConfig,
    ) -> Result<(), String> {
        self.invalidate();

        let (turn_tx, turn_rx) = mpsc::channel::<TurnJob>(8);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let data_dir = state.data_dir.clone();
        let agent_key = agent_config_key(agent_config);
        let agent_config = agent_config.clone();
        let session_characters = Arc::clone(&self.session_characters);
        let active_request_id = Arc::clone(&self.active_request_id);
        let active_cancel = Arc::clone(&self.active_cancel);

        tokio::spawn(async move {
            if let Err(err) = run_connection_loop(
                app,
                state,
                data_dir,
                agent_config,
                turn_rx,
                shutdown_rx,
                session_characters,
                active_request_id,
                active_cancel,
            )
            .await
            {
                eprintln!("[acp] connection ended: {err}");
            }
        });

        self.turn_tx = Some(turn_tx);
        self.shutdown_tx = Some(shutdown_tx);
        self.agent_key = Some(agent_key);
        Ok(())
    }
}

pub fn agent_config_key(config: &AgentConfig) -> String {
    format!(
        "{}|{}|{}|{}",
        config.preset,
        config.program,
        config.args.join("\x1f"),
        config.auto_approve_tools
    )
}

fn acp_internal_error(message: impl Into<String>) -> agent_client_protocol::Error {
    agent_client_protocol::Error::internal_error().data(message.into())
}

#[allow(clippy::too_many_arguments)]
async fn run_connection_loop(
    app: AppHandle,
    state: Arc<AppState>,
    data_dir: std::path::PathBuf,
    agent_config: AgentConfig,
    mut turn_rx: mpsc::Receiver<TurnJob>,
    mut shutdown_rx: oneshot::Receiver<()>,
    session_characters: Arc<Mutex<HashSet<String>>>,
    active_request_id: Arc<Mutex<Option<String>>>,
    active_cancel: Arc<Mutex<Option<CancellationToken>>>,
) -> Result<(), String> {
    let agent = match resolve_acp_agent(&agent_config, &data_dir).await {
        Ok(agent) => agent,
        Err(err) => {
            // Reply to whatever is already queued so the user sees the real cause.
            turn_rx.close();
            while let Ok(job) = turn_rx.try_recv() {
                let _ = job.result_tx.send(Err(err.clone()));
            }
            return Err(err);
        }
    };
    let companion_home = companion_home_dir(&data_dir);
    let state_perm = Arc::clone(&state);
    let app_perm = app.clone();
    let active_request_id_perm = Arc::clone(&active_request_id);
    let active_cancel_perm = Arc::clone(&active_cancel);
    let auto_approve_tools = agent_config.auto_approve_tools;

    Client
        .builder()
        .name("meuxe")
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _connection| {
                let request_id = active_request_id_perm
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .clone()
                    .unwrap_or_default();
                let cancel = active_cancel_perm
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .clone();

                if auto_approve_tools {
                    let outcome = match pick_companion_permission(&request.options) {
                        Some(id) => RequestPermissionOutcome::Selected(
                            SelectedPermissionOutcome::new(id),
                        ),
                        None => RequestPermissionOutcome::Cancelled,
                    };
                    responder.respond(RequestPermissionResponse::new(outcome))?;
                    return Ok(());
                }

                let tool_call_id = tool_call_id_str(&request.tool_call);
                let permission_id = permission_id_for(&request_id, &tool_call_id);
                let tool_name = tool_display_name(
                    request.tool_call.fields.title.as_deref(),
                    request.tool_call.fields.kind,
                );
                let arguments = tool_update_arguments(&request.tool_call.fields);
                let description = permission_description(&request.tool_call.fields);
                let options = request
                    .options
                    .iter()
                    .map(|opt| {
                        serde_json::json!({
                            "id": opt.option_id.to_string(),
                            "name": opt.name,
                            "kind": permission_kind_snake_case(opt.kind),
                        })
                    })
                    .collect::<Vec<_>>();

                let (tx, rx) = tokio::sync::oneshot::channel();
                {
                    let mut lock = state_perm
                        .chat_permission_responders
                        .lock()
                        .unwrap_or_else(|p| p.into_inner());
                    lock.insert(permission_id.clone(), tx);
                }

                let _ = app_perm.emit(
                    "chat:tool-confirm",
                    serde_json::json!({
                        "request_id": request_id,
                        "tool_call_id": tool_call_id,
                        "permission_id": permission_id,
                        "tool_name": tool_name,
                        "arguments": arguments,
                        "description": description,
                        "options": options,
                    }),
                );

                let outcome = if let Some(cancel) = cancel {
                    tokio::select! {
                        () = cancel.cancelled() => {
                            let mut lock = state_perm
                                .chat_permission_responders
                                .lock()
                                .unwrap_or_else(|p| p.into_inner());
                            lock.remove(&permission_id);
                            RequestPermissionOutcome::Cancelled
                        }
                        result = rx => {
                            let mut lock = state_perm
                                .chat_permission_responders
                                .lock()
                                .unwrap_or_else(|p| p.into_inner());
                            lock.remove(&permission_id);
                            let approved = result.unwrap_or(false);
                            permission_outcome(&request.options, approved)
                        }
                    }
                } else {
                    let mut lock = state_perm
                        .chat_permission_responders
                        .lock()
                        .unwrap_or_else(|p| p.into_inner());
                    lock.remove(&permission_id);
                    RequestPermissionOutcome::Cancelled
                };

                responder.respond(RequestPermissionResponse::new(outcome))?;
                Ok(())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, move |connection: ConnectionTo<Agent>| {
            let companion_home = companion_home.clone();
            let session_characters = Arc::clone(&session_characters);
            let active_request_id = Arc::clone(&active_request_id);
            let active_cancel = Arc::clone(&active_cancel);
            let app = app.clone();
            let state = Arc::clone(&state);

            async move {
                connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;

                let mut sessions = None;

                loop {
                    let job = tokio::select! {
                        _ = &mut shutdown_rx => break,
                        job = turn_rx.recv() => {
                            match job {
                                Some(job) => job,
                                None => break,
                            }
                        }
                    };

                    let character_id = job.params.character_id.clone();
                    let request_id = job.params.request_id.clone();

                    {
                        let mut lock = active_request_id.lock().unwrap_or_else(|p| p.into_inner());
                        *lock = Some(request_id.clone());
                    }
                    {
                        let mut lock = active_cancel.lock().unwrap_or_else(|p| p.into_inner());
                        *lock = Some(job.params.cancel.clone());
                    }

                    ensure_companion_home(&state.data_dir)
                        .map_err(|e| acp_internal_error(e.to_string()))?;
                    crate::acp::run::write_companion_home_context(
                        &companion_home,
                        &job.params.persona_context,
                        &character_id,
                        &job.params.memory_snapshot,
                    )
                    .map_err(|e| acp_internal_error(e.to_string()))?;

                    let needs_new_session = !session_characters
                        .lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .contains(&character_id);

                    if sessions.is_none() {
                        let session = connection
                            .build_session(&companion_home)
                            .block_task()
                            .start_session()
                            .await?;
                        sessions = Some(HashMap::from([(character_id.clone(), session)]));
                        session_characters
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .insert(character_id.clone());
                    } else if needs_new_session {
                        let session = connection
                            .build_session(&companion_home)
                            .block_task()
                            .start_session()
                            .await?;
                        sessions
                            .as_mut()
                            .expect("sessions map must exist")
                            .insert(character_id.clone(), session);
                        session_characters
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .insert(character_id.clone());
                    }

                    let session = sessions
                        .as_mut()
                        .and_then(|map| map.get_mut(&character_id))
                        .expect("session must exist after creation");

                    let turn_result: Result<TurnOutcome, String> = async {
                        let params = &job.params;
                        let app = &params.app;
                        let state = &params.state;
                        let request_id = &params.request_id;
                        let cancel = &params.cancel;
                        let character_id = &params.character_id;
                        let user_message = &params.user_message;
                        let model_id = &params.model_id;
                        let tts_config = &params.tts_config;
                        let user_id = crate::commands::user::derive_user_id(
                            &state.config.load().map_err(|e| e.to_string())?,
                        );

                        let mut accumulated = String::new();
                        let mut tts_buffer = String::new();
                        let mut splitter = meuxe_core::memory::TrailerSplitter::new();
                        let mut sentence_index = 0u32;
                        let mut current_expression =
                            meuxe_core::expressions::canonical_expression(
                                &params.memory_snapshot.bond.bond.mood.name,
                            );
                        let mut cancelled = false;
                        let mut poison_session = false;

                        session
                            .send_prompt(&params.agent_prompt)
                            .map_err(|e| e.to_string())?;

                        loop {
                            if cancel.is_cancelled() {
                                cancelled = true;
                                poison_session = true;
                                let _ = connection.send_notification_to(
                                    Agent,
                                    CancelNotification::new(session.session_id().clone()),
                                );
                                break;
                            }

                            let update = tokio::select! {
                                () = cancel.cancelled() => {
                                    cancelled = true;
                                    poison_session = true;
                                    let _ = connection.send_notification_to(
                                        Agent,
                                        CancelNotification::new(session.session_id().clone()),
                                    );
                                    break;
                                }
                                res = session.read_update() => res.map_err(|e| e.to_string())?,
                            };

                            match update {
                                SessionMessage::SessionMessage(dispatch) => {
                                    MatchDispatch::new(dispatch)
                                        .if_notification(async |notif: SessionNotification| {
                                            match notif.update {
                                                SessionUpdate::AgentMessageChunk(ContentChunk {
                                                    content: ContentBlock::Text(text),
                                                    ..
                                                }) => {
                                                    let chunk = text.text;
                                                    if !chunk.is_empty() {
                                                        let visible = splitter.feed(&chunk);
                                                        if !visible.is_empty() {
                                                            accumulated.push_str(&visible);
                                                            tts_buffer.push_str(&visible);
                                                            crate::commands::chat::drain_buffer_sentences(
                                                                app,
                                                                state,
                                                                model_id,
                                                                &mut current_expression,
                                                                tts_config,
                                                                request_id,
                                                                cancel,
                                                                &mut sentence_index,
                                                                &mut tts_buffer,
                                                                false,
                                                            );
                                                            let _ = app.emit(
                                                                "chat:text-chunk",
                                                                serde_json::json!({
                                                                    "request_id": request_id,
                                                                    "text": visible
                                                                }),
                                                            );
                                                        }
                                                    }
                                                }
                                                SessionUpdate::ToolCall(tool_call) => {
                                                    let tool_name = tool_display_name(
                                                        Some(&tool_call.title),
                                                        Some(tool_call.kind),
                                                    );
                                                    let _ = app.emit(
                                                        "chat:tool-call-start",
                                                        serde_json::json!({
                                                            "request_id": request_id,
                                                            "tool_call_id": tool_call.tool_call_id.to_string(),
                                                            "tool_name": tool_name,
                                                            "arguments": tool_call_arguments(&tool_call),
                                                        }),
                                                    );
                                                }
                                                SessionUpdate::ToolCallUpdate(update) => {
                                                    if let Some(status) = update.fields.status {
                                                        if is_terminal_tool_status(status) {
                                                            let tool_name = tool_display_name(
                                                                update.fields.title.as_deref(),
                                                                update.fields.kind,
                                                            );
                                                            let result = render_tool_result(
                                                                update.fields.content.as_deref(),
                                                                update.fields.raw_output.as_ref(),
                                                            );
                                                            let success =
                                                                status == ToolCallStatus::Completed;
                                                            let _ = app.emit(
                                                                "chat:tool-call-result",
                                                                serde_json::json!({
                                                                    "request_id": request_id,
                                                                    "tool_call_id": update.tool_call_id.to_string(),
                                                                    "tool_name": tool_name,
                                                                    "result": result,
                                                                    "success": success,
                                                                }),
                                                            );
                                                        }
                                                    }
                                                }
                                                _ => {}
                                            }
                                            Ok(())
                                        })
                                        .await
                                        .otherwise_ignore()
                                        .map_err(|e| e.to_string())?;
                                }
                                SessionMessage::StopReason(reason) => {
                                    if reason == StopReason::Cancelled {
                                        cancelled = true;
                                        poison_session = true;
                                    }
                                    break;
                                }
                                _ => {}
                            }
                        }

                        if cancelled || cancel.is_cancelled() {
                            clear_pending_permissions(state);
                            let _ = app.emit(
                                "chat:cancelled",
                                serde_json::json!({ "request_id": request_id }),
                            );
                            Ok(TurnOutcome { poison_session })
                        } else {
                            let (rest, mut trailer) = splitter.finish();
                            if !rest.is_empty() {
                                accumulated.push_str(&rest);
                                tts_buffer.push_str(&rest);
                            }

                            if trailer.is_none() {
                                if let Some((visible, recovered)) =
                                    meuxe_core::memory::recover_turn_notes_from_reply(&accumulated)
                                {
                                    if let Some(pos) = tts_buffer.find(&recovered) {
                                        tts_buffer.truncate(pos);
                                    }
                                    accumulated = visible;
                                    trailer = Some(recovered);
                                }
                            }

                            if !accumulated.trim().is_empty() {
                                crate::commands::chat::drain_buffer_sentences(
                                    app,
                                    state,
                                    model_id,
                                    &mut current_expression,
                                    tts_config,
                                    request_id,
                                    cancel,
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
                                    character_id,
                                    &user_id,
                                    "user",
                                    user_message,
                                    None,
                                )
                                .map_err(|e| e.to_string())?;
                            state
                                .sessions
                                .append_message(
                                    character_id,
                                    &user_id,
                                    "assistant",
                                    &cleaned_response,
                                    None,
                                )
                                .map_err(|e| e.to_string())?;

                            let notes = trailer
                                .as_deref()
                                .and_then(meuxe_core::memory::parse_turn_notes);
                            let state_update = match state.memory.apply_turn(
                                character_id,
                                &user_id,
                                user_message,
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
                                    request_id: request_id.clone(),
                                    state_update,
                                },
                            );

                            Ok(TurnOutcome {
                                poison_session: false,
                            })
                        }
                    }
                    .await;

                    {
                        let mut lock = active_request_id.lock().unwrap_or_else(|p| p.into_inner());
                        *lock = None;
                    }
                    {
                        let mut lock = active_cancel.lock().unwrap_or_else(|p| p.into_inner());
                        *lock = None;
                    }

                    let response = match turn_result {
                        Ok(outcome) => {
                            if outcome.poison_session {
                                if let Some(map) = sessions.as_mut() {
                                    map.remove(&character_id);
                                }
                                session_characters
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .remove(&character_id);
                            }
                            Ok(())
                        }
                        Err(err) => {
                            if let Some(map) = sessions.as_mut() {
                                map.remove(&character_id);
                            }
                            session_characters
                                .lock()
                                .unwrap_or_else(|p| p.into_inner())
                                .remove(&character_id);
                            let _ = app.emit(
                                "chat:error",
                                serde_json::json!({
                                    "request_id": request_id,
                                    "message": err,
                                }),
                            );
                            Ok(())
                        }
                    };

                    let _ = job.result_tx.send(response);
                }

                Ok(())
            }
        })
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn clear_pending_permissions(state: &AppState) {
    let mut lock = state
        .chat_permission_responders
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    lock.clear();
}

pub fn invalidate_acp(state: &AppState) {
    state
        .acp
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .invalidate();
}

pub fn invalidate_acp_if_agent_changed(
    state: &AppState,
    previous: &AgentConfig,
    next: &AgentConfig,
) {
    if agent_config_key(previous) != agent_config_key(next) {
        invalidate_acp(state);
    }
}
