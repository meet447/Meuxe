use crate::AppState;
use futures::StreamExt;
use meuxe_core::llm::types::{
    ChatMessage, FunctionCall, LlmStreamConfig, StreamEvent, ToolCallMessage,
};
use meuxe_core::tools::{PermissionLevel, ToolCallRequest};
use regex::Regex;
use std::future::Future;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

const MAX_AGENT_ITERATIONS: usize = 10;
const MAX_TOOL_RESULT_CHARS: usize = 4096;
const TTS_SENTENCE_TIMEOUT: Duration = Duration::from_secs(30);

// ---------------------------------------------------------------------------
// Cached regexes (compiled once)
// ---------------------------------------------------------------------------

fn expression_clean_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(<</?[^>]*>>)|(\[expression:\s*[^\]]+\])|(\[[a-zA-Z0-9_\-]+\])")
            .expect("invalid regex")
    })
}

fn expression_open_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<<([^/>][^>]*)>>").expect("invalid regex"))
}

fn expression_close_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<</[^>]*>>").expect("invalid regex"))
}

fn expression_square_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\[(?:expression:\s*)?([a-zA-Z0-9_\-]+)\]").expect("invalid regex")
    })
}

// ---------------------------------------------------------------------------
// Event payload structs
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
struct TextChunkEvent {
    text: String,
}

#[derive(Clone, serde::Serialize)]
struct SentenceEvent {
    request_id: String,
    index: u32,
    text: String,
    expression: String,
}

#[derive(Clone, serde::Serialize)]
struct AudioEvent {
    request_id: String,
    index: u32,
    data: String, // base64-encoded audio
}

#[derive(Clone, serde::Serialize)]
struct AudioFailedEvent {
    request_id: String,
    index: u32,
    reason: String,
    message: String,
}

#[derive(Clone, serde::Serialize)]
struct ChatDoneEvent {
    request_id: String,
    state_update: serde_json::Value,
}

#[derive(Clone, serde::Serialize)]
struct ChatErrorEvent {
    request_id: String,
    message: String,
}

#[derive(Clone, serde::Serialize)]
struct ToolCallStartEvent {
    request_id: String,
    tool_name: String,
    arguments: serde_json::Value,
}

#[derive(Clone, serde::Serialize)]
struct ToolCallResultEvent {
    request_id: String,
    tool_name: String,
    result: String,
    success: bool,
}

#[derive(Clone, serde::Serialize)]
struct ToolConfirmEvent {
    request_id: String,
    tool_name: String,
    arguments: serde_json::Value,
    description: String,
}

#[derive(Clone, serde::Serialize)]
struct AgentLoopEvent {
    iteration: usize,
    max_iterations: usize,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn derive_user_id(config: &meuxe_core::config::types::AppConfig) -> String {
    if !config.user.id.is_empty() {
        config.user.id.clone()
    } else if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meuxe_core::character::slugify(&config.user.name)
    }
}

/// Strip expression tags (<<tag>>, [expression:tag], or [tag]) from text.
fn clean_text(text: &str) -> String {
    expression_clean_re().replace_all(text, "").to_string()
}

/// Truncate tool result content for conversation context to avoid blowing up token usage.
fn truncate_tool_result(content: &str) -> String {
    if content.len() <= MAX_TOOL_RESULT_CHARS {
        content.to_string()
    } else {
        format!(
            "{}\n\n[Result truncated — showing first {}KB of {}KB]",
            &content[..MAX_TOOL_RESULT_CHARS],
            MAX_TOOL_RESULT_CHARS / 1024,
            content.len() / 1024
        )
    }
}

/// Strip markdown formatting and technical content for natural-sounding TTS.
fn clean_for_tts(text: &str) -> String {
    let mut lines: Vec<String> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();

        // Skip lines that are mostly file paths or URLs
        if looks_like_path_or_url(trimmed) {
            continue;
        }

        // Strip numbered list prefixes with paths (e.g., "1. ~/Library/...")
        if let Some(after_num) = strip_numbered_prefix(trimmed) {
            if looks_like_path_or_url(after_num) {
                continue;
            }
        }

        // Clean markdown from remaining lines
        let cleaned = trimmed
            .replace("**", "")
            .replace("__", "")
            .replace("*", "")
            .replace("##", "")
            .replace("#", "")
            .replace("`", "");

        // Convert "- item" bullet lists to plain text
        let cleaned = if let Some(rest) = cleaned.strip_prefix("- ") {
            rest.to_string()
        } else {
            cleaned
        };

        if !cleaned.trim().is_empty() {
            lines.push(cleaned);
        }
    }

    lines.join(" ")
}

/// Check if a string looks like a file path, URL, or technical reference.
fn looks_like_path_or_url(s: &str) -> bool {
    let trimmed = s.trim();
    trimmed.starts_with("~/")
        || trimmed.starts_with("/")
        || trimmed.starts_with("C:\\")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("file://")
        || trimmed.contains("/com~apple~")
        || (trimmed.contains('/') && trimmed.matches('/').count() >= 3)
}

/// Strip "1. ", "2. " etc. and return the remainder, or None.
fn strip_numbered_prefix(s: &str) -> Option<&str> {
    let s = s.trim();
    let dot_pos = s.find(". ")?;
    if dot_pos > 0 && dot_pos <= 3 && s[..dot_pos].chars().all(|c| c.is_ascii_digit()) {
        Some(s[dot_pos + 2..].trim())
    } else {
        None
    }
}

#[derive(Debug, Clone)]
enum TagAction {
    SetExpression(String),
    ResetExpression,
}

#[derive(Debug, Clone)]
struct TagMatch {
    start: usize,
    end: usize,
    action: TagAction,
}

fn find_next_tag(buffer: &str) -> Option<TagMatch> {
    let open_re = expression_open_re();
    let close_re = expression_close_re();
    let square_re = expression_square_re();
    let mut earliest: Option<TagMatch> = None;

    if let Some(captures) = open_re.captures(buffer) {
        if let (Some(full), Some(name)) = (captures.get(0), captures.get(1)) {
            earliest = Some(TagMatch {
                start: full.start(),
                end: full.end(),
                action: TagAction::SetExpression(name.as_str().trim().to_string()),
            });
        }
    }

    if let Some(full) = close_re.find(buffer) {
        let candidate = TagMatch {
            start: full.start(),
            end: full.end(),
            action: TagAction::ResetExpression,
        };
        if earliest
            .as_ref()
            .map(|existing| candidate.start < existing.start)
            .unwrap_or(true)
        {
            earliest = Some(candidate);
        }
    }

    if let Some(captures) = square_re.captures(buffer) {
        if let (Some(full), Some(name)) = (captures.get(0), captures.get(1)) {
            let candidate = TagMatch {
                start: full.start(),
                end: full.end(),
                action: TagAction::SetExpression(name.as_str().trim().to_string()),
            };
            if earliest
                .as_ref()
                .map(|existing| candidate.start < existing.start)
                .unwrap_or(true)
            {
                earliest = Some(candidate);
            }
        }
    }

    earliest
}

fn find_sentence_boundary(text: &str, allow_end_boundary: bool) -> Option<usize> {
    let mut chars = text.char_indices().peekable();

    while let Some((idx, ch)) = chars.next() {
        if !matches!(ch, '.' | '!' | '?' | '…') {
            continue;
        }

        let mut end = idx + ch.len_utf8();
        while let Some(&(next_idx, next_ch)) = chars.peek() {
            if matches!(
                next_ch,
                '"' | '\'' | ')' | ']' | '}' | '\u{201D}' | '\u{2019}'
            ) {
                end = next_idx + next_ch.len_utf8();
                chars.next();
            } else {
                break;
            }
        }

        match chars.peek() {
            Some((_, next_ch)) if next_ch.is_whitespace() || matches!(next_ch, '<' | '[') => {
                return Some(end);
            }
            None if allow_end_boundary => return Some(end),
            _ => {}
        }
    }

    None
}

#[derive(Debug, PartialEq)]
enum TtsTaskOutcome {
    Audio(Vec<u8>),
    ProviderError(String),
    Timeout,
    Cancelled,
}

async fn await_tts_outcome<F>(
    cancel: CancellationToken,
    timeout: Duration,
    future: F,
) -> TtsTaskOutcome
where
    F: Future<Output = Result<Vec<u8>, String>>,
{
    tokio::select! {
        biased;
        _ = cancel.cancelled() => TtsTaskOutcome::Cancelled,
        result = tokio::time::timeout(timeout, future) => match result {
            Ok(Ok(audio)) => TtsTaskOutcome::Audio(audio),
            Ok(Err(error)) => TtsTaskOutcome::ProviderError(error),
            Err(_) => TtsTaskOutcome::Timeout,
        },
    }
}

fn spawn_tts_for_sentence(
    app: &AppHandle,
    tts_config: &meuxe_core::config::types::TtsConfig,
    request_id: &str,
    cancel: CancellationToken,
    index: u32,
    text: String,
) {
    let tts_cfg = tts_config.clone();
    let app_tts = app.clone();
    let request_id = request_id.to_string();

    tokio::spawn(async move {
        let tts_text = clean_for_tts(&text);
        let outcome = await_tts_outcome(cancel, TTS_SENTENCE_TIMEOUT, async {
            meuxe_core::tts::generate_tts_auto(&tts_text, &tts_cfg)
                .await
                .map_err(|error| error.to_string())
        })
        .await;

        match outcome {
            TtsTaskOutcome::Audio(audio_data) => {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&audio_data);
                let _ = app_tts.emit(
                    "chat:audio",
                    AudioEvent {
                        request_id,
                        index,
                        data: b64,
                    },
                );
            }
            TtsTaskOutcome::ProviderError(message) => {
                eprintln!("TTS error for sentence {index}: {message}");
                let _ = app_tts.emit(
                    "chat:audio-failed",
                    AudioFailedEvent {
                        request_id,
                        index,
                        reason: "provider_error".to_string(),
                        message,
                    },
                );
            }
            TtsTaskOutcome::Timeout => {
                let message = format!(
                    "TTS timed out after {} seconds",
                    TTS_SENTENCE_TIMEOUT.as_secs()
                );
                eprintln!("TTS timeout for sentence {index}");
                let _ = app_tts.emit(
                    "chat:audio-failed",
                    AudioFailedEvent {
                        request_id,
                        index,
                        reason: "timeout".to_string(),
                        message,
                    },
                );
            }
            TtsTaskOutcome::Cancelled => {}
        }
    });
}

fn emit_sentence_chunk(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &str,
    tts_config: &meuxe_core::config::types::TtsConfig,
    request_id: &str,
    cancel: &CancellationToken,
    sentence_index: &mut u32,
    raw_text: &str,
) {
    let clean = clean_text(raw_text).trim().to_string();
    if clean.is_empty() {
        return;
    }

    let resolved = state.expressions.resolve(model_id, current_expression);
    let idx = *sentence_index;

    let _ = app.emit(
        "chat:sentence",
        SentenceEvent {
            request_id: request_id.to_string(),
            index: idx,
            text: clean.clone(),
            expression: resolved,
        },
    );

    spawn_tts_for_sentence(app, tts_config, request_id, cancel.clone(), idx, clean);
    *sentence_index += 1;
}

#[allow(clippy::too_many_arguments)]
fn emit_ready_sentences(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &str,
    tts_config: &meuxe_core::config::types::TtsConfig,
    request_id: &str,
    cancel: &CancellationToken,
    sentence_index: &mut u32,
    text: &str,
    allow_end_boundary: bool,
    force_flush_remainder: bool,
) {
    let mut remaining = text.trim_start().to_string();

    while let Some(boundary) = find_sentence_boundary(&remaining, allow_end_boundary) {
        let sentence = remaining[..boundary].to_string();
        emit_sentence_chunk(
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            request_id,
            cancel,
            sentence_index,
            &sentence,
        );
        remaining = remaining[boundary..].trim_start().to_string();
    }

    if force_flush_remainder {
        emit_sentence_chunk(
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            request_id,
            cancel,
            sentence_index,
            &remaining,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn drain_buffer_sentences(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &str,
    tts_config: &meuxe_core::config::types::TtsConfig,
    request_id: &str,
    cancel: &CancellationToken,
    sentence_index: &mut u32,
    buffer: &mut String,
    allow_end_boundary: bool,
) {
    let mut working = buffer.trim_start().to_string();

    while let Some(boundary) = find_sentence_boundary(&working, allow_end_boundary) {
        let sentence = working[..boundary].to_string();
        emit_sentence_chunk(
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            request_id,
            cancel,
            sentence_index,
            &sentence,
        );
        working = working[boundary..].trim_start().to_string();
    }

    *buffer = working;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    character_id: String,
    message: String,
    request_id: String,
) -> Result<(), String> {
    let state = Arc::clone(&state);
    let app_handle = app.clone();

    // Cancel any previous agent loop
    let cancel_token = CancellationToken::new();
    {
        let mut lock = state.chat_cancel.lock().unwrap();
        if let Some(old_token) = lock.take() {
            old_token.cancel();
        }
        *lock = Some(cancel_token.clone());
    }

    tokio::spawn(async move {
        let error_request_id = request_id.clone();
        if let Err(e) = run_chat_stream(
            app_handle.clone(),
            state,
            character_id,
            message,
            request_id,
            cancel_token,
        )
        .await
        {
            let _ = app_handle.emit(
                "chat:error",
                ChatErrorEvent {
                    request_id: error_request_id,
                    message: e.to_string(),
                },
            );
        }
    });

    Ok(())
}

/// Handle user confirmation/denial for a dangerous tool call.
#[tauri::command]
pub async fn tool_confirm(
    state: State<'_, Arc<AppState>>,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    if let Some((_, sender)) = state.pending_confirmations.remove(&request_id) {
        sender
            .send(approved)
            .map_err(|_| "Confirmation channel closed".to_string())?;
    }
    Ok(())
}

async fn run_chat_stream(
    app: AppHandle,
    state: Arc<AppState>,
    character_id: String,
    message: String,
    request_id: String,
    cancel: CancellationToken,
) -> Result<(), String> {
    // 1. Load config, derive user_id
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = derive_user_id(&config);

    // Load character to get model_id for expression resolution
    let character = state
        .characters
        .load_character(&character_id)
        .map_err(|e| e.to_string())?;
    let model_id = character.live2d_model.clone();

    // 2. Build prompt
    let prompt_result =
        meuxe_core::prompt::build_chat_prompt(meuxe_core::prompt::ChatPromptParams {
            character_loader: &state.characters,
            session_store: &state.sessions,
            memory_store: &state.memories,
            memory_vault: Some(&state.memory_vault),
            _expression_manager: &state.expressions,
            character_id: &character_id,
            user_id: &user_id,
            user_message: &message,
            history_limit: None,
            memory_limit: None,
        })
        .map_err(|e| e.to_string())?;

    // 3. Create LlmStreamConfig
    let llm_config = LlmStreamConfig {
        base_url: config.llm.base_url.clone(),
        api_key: config.llm.api_key.clone().unwrap_or_default(),
        model: config.llm.model.clone(),
        temperature: 0.7,
        max_tokens: 1024,
    };

    // 4. Sync search + Composio runtime state and get tools JSON for the LLM
    state
        .tool_registry
        .update_search_config(config.search.clone());
    let enabled_toolkits = if config.composio.enabled_toolkits.is_empty() {
        meuxe_core::composio_toolkits::default_enabled_toolkits()
    } else {
        config.composio.enabled_toolkits.clone()
    };
    state
        .tool_registry
        .update_composio_state(meuxe_core::composio::ComposioToolState {
            api_key: config.composio.api_key.clone(),
            user_id: user_id.clone(),
            connections: config.composio.connections.clone(),
            enabled_toolkits,
            catalog: std::collections::HashMap::new(),
        });
    if let Err(err) = state.tool_registry.refresh_composio_catalog().await {
        eprintln!("[composio] failed to load tool catalog: {err}");
    }
    let tools_json = state
        .tool_registry
        .openai_tools_json_filtered(&config.disabled_tools);
    println!(
        "[agent] LLM provider: {} | model: {} | tools enabled: {}",
        config.llm.base_url,
        config.llm.model,
        tools_json.len()
    );

    let tts_config = config.tts.clone();

    // 6. Agent loop
    let mut conversation = prompt_result.messages;
    let mut all_text_responses = String::new(); // Accumulate all text across iterations
    let mut all_tool_exchanges: Vec<serde_json::Value> = Vec::new();
    let mut sentence_index: u32 = 0;
    let mut current_expression = "neutral".to_string();

    for iteration in 0..MAX_AGENT_ITERATIONS {
        if cancel.is_cancelled() {
            println!("[agent] cancelled before iteration {iteration}");
            return Ok(());
        }

        let _ = app.emit(
            "chat:agent-loop",
            AgentLoopEvent {
                iteration,
                max_iterations: MAX_AGENT_ITERATIONS,
            },
        );

        // Context management: compress stale tool results + enforce token budget
        // ~6000 tokens budget leaves room for the LLM response (~1024 max_tokens)
        meuxe_core::context::manage_context(&mut conversation, 6000);

        let mut text_content = String::new();
        let mut buffer = String::new();
        let mut tool_calls: Vec<(String, String, String)> = Vec::new();
        let mut finish_reason = "stop".to_string();
        let mut stream_succeeded = false;

        // Retry streaming up to 2 times on transient errors
        for stream_attempt in 0..6u8 {
            if stream_attempt > 0 {
                println!(
                    "[agent] stream retry attempt {}/2 (accumulated {}B text)",
                    stream_attempt,
                    text_content.len()
                );
                let delay = 500 * (1 << (stream_attempt - 1));
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }

            // Build conversation for this attempt — if retrying, add partial assistant text
            let mut attempt_conv = conversation.clone();
            if stream_attempt > 0 && !text_content.is_empty() {
                // Tell the LLM to continue from where it left off
                attempt_conv.push(ChatMessage::text("assistant", &text_content));
                attempt_conv.push(ChatMessage::text(
                    "user",
                    "[continue from where you left off]",
                ));
            }

            let mut stream = state.llm.stream_chat_with_tools(
                attempt_conv,
                &llm_config,
                Some(tools_json.clone()),
            );

            let mut stream_error = false;

            while let Some(event_result) = stream.next().await {
                if cancel.is_cancelled() {
                    println!("[agent] cancelled during streaming");
                    return Ok(());
                }

                let event = match event_result {
                    Ok(e) => e,
                    Err(e) => {
                        let err_str = e.to_string();
                        if meuxe_core::retry::is_retryable_llm_error(&e) && stream_attempt < 5 {
                            eprintln!("[agent] stream error (retryable): {err_str}");
                            stream_error = true;
                            break;
                        }
                        return Err(err_str);
                    }
                };

                match event {
                    StreamEvent::TextDelta(token) => {
                        // Emit raw text chunk to frontend
                        let _ = app.emit(
                            "chat:text-chunk",
                            TextChunkEvent {
                                text: token.clone(),
                            },
                        );

                        text_content.push_str(&token);
                        buffer.push_str(&token);

                        // Process sentences from buffer
                        drain_buffer_sentences(
                            &app,
                            &state,
                            &model_id,
                            &current_expression,
                            &tts_config,
                            &request_id,
                            &cancel,
                            &mut sentence_index,
                            &mut buffer,
                            false,
                        );

                        // Check for expression tags
                        loop {
                            if let Some(tag_match) = find_next_tag(&buffer) {
                                let before_tag = buffer[..tag_match.start].to_string();

                                emit_ready_sentences(
                                    &app,
                                    &state,
                                    &model_id,
                                    &current_expression,
                                    &tts_config,
                                    &request_id,
                                    &cancel,
                                    &mut sentence_index,
                                    &before_tag,
                                    true,
                                    true,
                                );

                                match tag_match.action {
                                    TagAction::SetExpression(tag_content) => {
                                        current_expression = tag_content;
                                    }
                                    TagAction::ResetExpression => {
                                        current_expression = "neutral".to_string();
                                    }
                                }

                                buffer = buffer[tag_match.end..].to_string();
                                continue;
                            }
                            break;
                        }
                    }

                    StreamEvent::ToolCallComplete {
                        id,
                        name,
                        arguments,
                    } => {
                        println!("[agent] tool call received: {name} id={id} args={arguments}");
                        tool_calls.push((id, name, arguments));
                    }

                    StreamEvent::Done {
                        finish_reason: reason,
                    } => {
                        println!(
                            "[agent] stream done — finish_reason={} | tool_calls={} | text_len={}",
                            reason,
                            tool_calls.len(),
                            text_content.len()
                        );
                        finish_reason = reason;
                    }
                }
            } // end while stream events

            if stream_error {
                continue; // retry the stream
            }
            stream_succeeded = true;
            break; // stream completed normally
        } // end stream retry loop

        if !stream_succeeded {
            return Err("Stream failed after all retry attempts".to_string());
        }

        // Flush remaining text buffer
        emit_ready_sentences(
            &app,
            &state,
            &model_id,
            &current_expression,
            &tts_config,
            &request_id,
            &cancel,
            &mut sentence_index,
            &buffer,
            true,
            true,
        );

        all_text_responses.push_str(&text_content);

        // Build assistant message for conversation history
        let assistant_msg = if tool_calls.is_empty() {
            ChatMessage::text("assistant", &text_content)
        } else {
            let tc_messages: Vec<ToolCallMessage> = tool_calls
                .iter()
                .map(|(id, name, args)| ToolCallMessage {
                    id: id.clone(),
                    call_type: "function".to_string(),
                    function: FunctionCall {
                        name: name.clone(),
                        arguments: args.clone(),
                    },
                })
                .collect();

            ChatMessage {
                role: "assistant".to_string(),
                content: if text_content.is_empty() {
                    None
                } else {
                    Some(text_content.clone())
                },
                tool_calls: Some(tc_messages),
                tool_call_id: None,
            }
        };
        conversation.push(assistant_msg);

        // If no tool calls, we're done
        if finish_reason != "tool_calls" || tool_calls.is_empty() {
            println!("[agent] no tool calls, exiting loop after iteration {iteration}");
            break;
        }

        println!(
            "[agent] executing {} tool call(s) in iteration {}",
            tool_calls.len(),
            iteration
        );

        // Separate tool calls into safe (parallel) and dangerous (need confirmation)
        let mut safe_calls: Vec<(String, String, serde_json::Value)> = Vec::new();
        let mut dangerous_calls: Vec<(String, String, serde_json::Value)> = Vec::new();

        for (tc_id, tc_name, tc_args) in &tool_calls {
            let args: serde_json::Value =
                serde_json::from_str(tc_args).unwrap_or(serde_json::Value::Null);
            let permission = state.tool_registry.permission_level(tc_name);
            if permission == Some(PermissionLevel::Dangerous) {
                dangerous_calls.push((tc_id.clone(), tc_name.clone(), args));
            } else {
                safe_calls.push((tc_id.clone(), tc_name.clone(), args));
            }
        }

        // Track tool exchanges for session metadata
        let mut tool_exchanges: Vec<serde_json::Value> = Vec::new();

        // Execute safe tools in parallel
        if !safe_calls.is_empty() {
            // Emit start events for all safe calls
            for (tc_id, tc_name, args) in &safe_calls {
                let _ = app.emit(
                    "chat:tool-call-start",
                    ToolCallStartEvent {
                        request_id: tc_id.clone(),
                        tool_name: tc_name.clone(),
                        arguments: args.clone(),
                    },
                );
            }

            // Execute all safe calls concurrently with timeout + panic safety
            let futures: Vec<_> = safe_calls
                .iter()
                .map(|(tc_id, tc_name, args)| {
                    let request = ToolCallRequest {
                        id: tc_id.clone(),
                        name: tc_name.clone(),
                        arguments: args.clone(),
                    };
                    let registry = &state.tool_registry;
                    let tool_name = tc_name.clone();
                    async move {
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(60),
                            registry.execute(&request),
                        )
                        .await
                        {
                            Ok(result) => result,
                            Err(_) => Err(meuxe_core::MeuxeError::Tool(format!(
                                "{tool_name} timed out after 60s"
                            ))),
                        }
                    }
                })
                .collect();

            let results = futures::future::join_all(futures).await;

            // Process results in order
            for (i, result) in results.into_iter().enumerate() {
                let (tc_id, tc_name, args) = &safe_calls[i];
                let (content, success) = match result {
                    Ok(tool_result) => (tool_result.content, tool_result.success),
                    Err(e) => (format!("Tool error: {e}"), false),
                };

                let _ = app.emit(
                    "chat:tool-call-result",
                    ToolCallResultEvent {
                        request_id: tc_id.clone(),
                        tool_name: tc_name.clone(),
                        result: content.clone(),
                        success,
                    },
                );
                // Truncate for LLM context to avoid blowing up token usage
                conversation.push(ChatMessage::tool_result(
                    tc_id,
                    &truncate_tool_result(&content),
                ));
                tool_exchanges.push(serde_json::json!({
                    "tool": tc_name,
                    "arguments": args,
                    "result": content,
                    "success": success,
                }));
            }
        }

        // Execute dangerous tools sequentially (need user confirmation)
        for (tc_id, tc_name, args) in &dangerous_calls {
            // Emit confirmation request and wait
            let _ = app.emit(
                "chat:tool-confirm",
                ToolConfirmEvent {
                    request_id: tc_id.clone(),
                    tool_name: tc_name.clone(),
                    arguments: args.clone(),
                    description: format!("Allow {tc_name} to execute?"),
                },
            );

            let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
            state.pending_confirmations.insert(tc_id.clone(), tx);

            let approved = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
                .await
                .unwrap_or(Ok(false))
                .unwrap_or(false);

            if !approved {
                conversation.push(ChatMessage::tool_result(tc_id, "User denied this action."));
                let _ = app.emit(
                    "chat:tool-call-result",
                    ToolCallResultEvent {
                        request_id: tc_id.clone(),
                        tool_name: tc_name.clone(),
                        result: "User denied this action.".to_string(),
                        success: false,
                    },
                );
                tool_exchanges.push(serde_json::json!({
                    "tool": tc_name,
                    "arguments": args,
                    "result": "User denied this action.",
                    "success": false,
                }));
                continue;
            }

            let _ = app.emit(
                "chat:tool-call-start",
                ToolCallStartEvent {
                    request_id: tc_id.clone(),
                    tool_name: tc_name.clone(),
                    arguments: args.clone(),
                },
            );

            let tool_request = ToolCallRequest {
                id: tc_id.clone(),
                name: tc_name.clone(),
                arguments: args.clone(),
            };

            let result = tokio::time::timeout(
                std::time::Duration::from_secs(60),
                state.tool_registry.execute(&tool_request),
            )
            .await;
            let (content, success) = match result {
                Ok(Ok(tool_result)) => (tool_result.content, tool_result.success),
                Ok(Err(e)) => (format!("Tool error: {e}"), false),
                Err(_) => (format!("Tool {tc_name} timed out after 60s"), false),
            };

            let _ = app.emit(
                "chat:tool-call-result",
                ToolCallResultEvent {
                    request_id: tc_id.clone(),
                    tool_name: tc_name.clone(),
                    result: content.clone(),
                    success,
                },
            );
            // Truncate for LLM context
            conversation.push(ChatMessage::tool_result(
                tc_id,
                &truncate_tool_result(&content),
            ));
            tool_exchanges.push(serde_json::json!({
                "tool": tc_name,
                "arguments": args,
                "result": content,
                "success": success,
            }));
        }

        // Store tool exchanges for this iteration
        all_tool_exchanges.extend(tool_exchanges);

        // Loop continues — LLM will see tool results
    }

    // 7. Save to session (with tool exchanges as metadata)
    let cleaned_response = clean_text(&all_text_responses);

    state
        .sessions
        .append_message(&character_id, &user_id, "user", &message, None)
        .map_err(|e| e.to_string())?;

    let assistant_metadata = if all_tool_exchanges.is_empty() {
        None
    } else {
        Some(serde_json::json!({ "tool_exchanges": all_tool_exchanges }))
    };

    state
        .sessions
        .append_message(
            &character_id,
            &user_id,
            "assistant",
            &cleaned_response,
            assistant_metadata,
        )
        .map_err(|e| e.to_string())?;

    // 8. Remember exchange (extract memories)
    let vault_ingest = state.memory_vault.ingest_chat_exchange(
        &character_id,
        &user_id,
        &message,
        &cleaned_response,
    );
    if let Err(err) = &vault_ingest {
        eprintln!("[memory-vault] failed to ingest chat exchange: {err}");
    }

    // Keep the legacy JSONL store populated until all old callers are removed.
    let _ = meuxe_core::memory::remember_exchange(
        &state.memories,
        &character_id,
        &user_id,
        &message,
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
            request_id,
            state_update,
        },
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{await_tts_outcome, find_sentence_boundary, TtsTaskOutcome};
    use std::time::Duration;
    use tokio_util::sync::CancellationToken;

    #[test]
    fn finds_sentence_before_next_text() {
        assert_eq!(find_sentence_boundary("Hello there. Next", false), Some(12));
    }

    #[test]
    fn waits_for_more_if_sentence_ends_at_buffer_end() {
        assert_eq!(find_sentence_boundary("Hello there.", false), None);
    }

    #[test]
    fn allows_terminal_boundary_when_flushing() {
        assert_eq!(find_sentence_boundary("Hello there.", true), Some(12));
    }

    #[test]
    fn handles_quote_after_punctuation() {
        assert_eq!(
            find_sentence_boundary("She said hi.\" Next", false),
            Some(13)
        );
    }

    #[tokio::test]
    async fn tts_outcome_reports_success() {
        let outcome = await_tts_outcome(CancellationToken::new(), Duration::from_secs(1), async {
            Ok::<_, String>(vec![1, 2, 3])
        })
        .await;
        assert_eq!(outcome, TtsTaskOutcome::Audio(vec![1, 2, 3]));
    }

    #[tokio::test]
    async fn tts_outcome_reports_provider_error() {
        let outcome = await_tts_outcome(CancellationToken::new(), Duration::from_secs(1), async {
            Err::<Vec<u8>, _>("provider failed".to_string())
        })
        .await;
        assert_eq!(
            outcome,
            TtsTaskOutcome::ProviderError("provider failed".to_string())
        );
    }

    #[tokio::test]
    async fn tts_outcome_reports_timeout() {
        let outcome =
            await_tts_outcome(CancellationToken::new(), Duration::from_millis(1), async {
                tokio::time::sleep(Duration::from_secs(1)).await;
                Ok::<_, String>(Vec::new())
            })
            .await;
        assert_eq!(outcome, TtsTaskOutcome::Timeout);
    }

    #[tokio::test]
    async fn tts_outcome_reports_cancellation() {
        let cancel = CancellationToken::new();
        cancel.cancel();
        let outcome = await_tts_outcome(
            cancel,
            Duration::from_secs(1),
            std::future::pending::<Result<Vec<u8>, String>>(),
        )
        .await;
        assert_eq!(outcome, TtsTaskOutcome::Cancelled);
    }
}

// ---------------------------------------------------------------------------
// History & Clear commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn chat_history(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = derive_user_id(&config);

    let history = state
        .sessions
        .load_history(&character_id, &user_id, Some(50))
        .map_err(|e| e.to_string())?;

    let values: Vec<serde_json::Value> = history
        .into_iter()
        .map(|msg| serde_json::to_value(msg).unwrap_or(serde_json::Value::Null))
        .collect();

    Ok(values)
}

#[tauri::command]
pub fn chat_clear(state: State<Arc<AppState>>, character_id: String) -> Result<(), String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = derive_user_id(&config);

    state
        .sessions
        .clear_history(&character_id, &user_id)
        .map_err(|e| e.to_string())
}
