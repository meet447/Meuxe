use crate::commands::user::derive_user_id;
use crate::AppState;
use regex::Regex;
use std::future::Future;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

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

fn expression_peel_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^(?:\[expression:\s*([^\]]+)\]|<<([^>]+)>>|\[([a-zA-Z0-9_\-]+)\])\s*")
            .expect("invalid regex")
    })
}

fn global_expression_names() -> &'static [String] {
    static NAMES: OnceLock<Vec<String>> = OnceLock::new();
    NAMES.get_or_init(|| {
        meuxe_core::expressions::GLOBAL_EXPRESSIONS
            .iter()
            .map(|s| s.to_string())
            .collect()
    })
}

/// If `text` starts with an expression tag, update `current` and return the remainder.
pub(crate) fn peel_expression_prefix(text: &str, current: &mut String) -> String {
    let trimmed = text.trim_start();
    let caps = expression_peel_re().captures(trimmed);
    if let Some(caps) = caps {
        let name = caps
            .get(1)
            .or_else(|| caps.get(2))
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().trim())
            .unwrap_or("");
        if !name.is_empty() {
            let available = global_expression_names();
            if let Some(valid) =
                meuxe_core::expressions::ExpressionManager::validate_expression(name, available)
            {
                *current = valid;
            }
        }
        return trimmed[caps.get(0).unwrap().end()..].to_string();
    }
    trimmed.to_string()
}

/// Build the full text prompt sent to the ACP agent (persona + optional history + user turn).
pub(crate) fn build_acp_agent_prompt(
    persona_context: &str,
    messages: &[meuxe_core::llm::types::ChatMessage],
    user_message: &str,
    include_history: bool,
) -> String {
    let mut parts = vec![
        "## Meuxe companion (required)".to_string(),
        "You are the user's companion in the Meuxe desktop app — not OpenCode, not a generic coding CLI, and not a nameless assistant."
            .to_string(),
        "When asked who you are, answer as the companion described in the persona below. Stay in character for every reply."
            .to_string(),
        "Use expression tags as specified in the persona (for avatar reactions and voice timing)."
            .to_string(),
        String::new(),
        persona_context.trim().to_string(),
    ];

    if include_history {
        let mut history_lines: Vec<String> = Vec::new();
        for msg in messages {
            if msg.role == "system" || msg.role == "tool" {
                continue;
            }
            let content = msg.content_str().trim();
            if content.is_empty() {
                continue;
            }
            if msg.role == "user" && content == user_message.trim() {
                continue;
            }
            let label = if msg.role == "user" {
                "User"
            } else {
                "Companion"
            };
            history_lines.push(format!("{label}: {content}"));
        }

        if !history_lines.is_empty() {
            parts.push(String::new());
            parts.push("## Recent conversation".to_string());
            parts.extend(history_lines);
        }
    }

    parts.push(String::new());
    parts.push("## Current user message".to_string());
    parts.push(user_message.trim().to_string());

    parts.push(String::new());
    parts.push("## How to reply".to_string());
    parts.push(
        "Stay in character. Use tools when they need help with their computer; do not wander the machine unless they asked. Never mention OpenCode, this workspace, or that you are an agent."
            .to_string(),
    );
    parts.push("Start every spoken sentence with `[expression:NAME]`.".to_string());
    parts.push("End with a `<<<meuxe ... >>>` block (`{}` if nothing changed).".to_string());

    parts.join("\n")
}

// ---------------------------------------------------------------------------
// Event payload structs
// ---------------------------------------------------------------------------

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
pub(crate) struct ChatDoneEvent {
    pub(crate) request_id: String,
    pub(crate) state_update: serde_json::Value,
}

#[derive(Clone, serde::Serialize)]
struct ChatErrorEvent {
    request_id: String,
    message: String,
}

/// Strip expression tags (<<tag>>, [expression:tag], or [tag]) from text.
pub(crate) fn clean_text_for_memory(text: &str) -> String {
    clean_text(text)
}

fn clean_text(text: &str) -> String {
    expression_clean_re().replace_all(text, "").to_string()
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

fn find_sentence_boundary(text: &str, allow_end_boundary: bool) -> Option<usize> {
    let mut chars = text.char_indices().peekable();

    while let Some((idx, ch)) = chars.next() {
        if !matches!(ch, '.' | '!' | '?' | '…') {
            continue;
        }

        // Don't split "Dr. Chen", "e.g. this", or "U.S. today".
        if ch == '.' && looks_like_abbreviation(text, idx) {
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

fn looks_like_abbreviation(text: &str, dot_idx: usize) -> bool {
    let before = &text[..dot_idx];
    let word = before
        .rsplit(|c: char| !c.is_ascii_alphabetic())
        .next()
        .unwrap_or("");
    if word.is_empty() {
        return false;
    }
    if word.len() == 1 {
        return true;
    }
    matches!(
        word.to_ascii_lowercase().as_str(),
        "dr" | "mr"
            | "mrs"
            | "ms"
            | "prof"
            | "sr"
            | "jr"
            | "st"
            | "vs"
            | "etc"
            | "inc"
            | "ltd"
            | "ave"
    )
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

struct EmitSentenceChunkParams<'a> {
    app: &'a AppHandle,
    state: &'a Arc<AppState>,
    model_id: &'a str,
    current_expression: &'a mut String,
    tts_config: &'a meuxe_core::config::types::TtsConfig,
    request_id: &'a str,
    cancel: &'a CancellationToken,
    sentence_index: &'a mut u32,
    raw_text: &'a str,
}

fn emit_sentence_chunk(params: EmitSentenceChunkParams<'_>) {
    let without_tag = peel_expression_prefix(params.raw_text, params.current_expression);
    let clean = clean_text(&without_tag).trim().to_string();
    if clean.is_empty() {
        return;
    }

    let resolved = params
        .state
        .expressions
        .resolve(params.model_id, params.current_expression);
    let idx = *params.sentence_index;

    let _ = params.app.emit(
        "chat:sentence",
        SentenceEvent {
            request_id: params.request_id.to_string(),
            index: idx,
            text: clean.clone(),
            expression: resolved,
        },
    );

    spawn_tts_for_sentence(
        params.app,
        params.tts_config,
        params.request_id,
        params.cancel.clone(),
        idx,
        clean,
    );
    *params.sentence_index += 1;
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn drain_buffer_sentences(
    app: &AppHandle,
    state: &Arc<AppState>,
    model_id: &str,
    current_expression: &mut String,
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
        emit_sentence_chunk(EmitSentenceChunkParams {
            app,
            state,
            model_id,
            current_expression,
            tts_config,
            request_id,
            cancel,
            sentence_index,
            raw_text: &sentence,
        });
        working = working[boundary..].trim_start().to_string();
    }

    *buffer = working;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

fn lock_chat_cancel(
    mutex: &std::sync::Mutex<Option<tokio_util::sync::CancellationToken>>,
) -> std::sync::MutexGuard<'_, Option<tokio_util::sync::CancellationToken>> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[tauri::command]
pub fn chat_tool_confirm(
    state: State<Arc<AppState>>,
    permission_id: String,
    approved: bool,
) -> Result<(), String> {
    let mut lock = state
        .chat_permission_responders
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    if let Some(sender) = lock.remove(&permission_id) {
        let _ = sender.send(approved);
    }
    Ok(())
}

#[tauri::command]
pub fn chat_cancel(state: State<Arc<AppState>>) -> Result<(), String> {
    let mut lock = lock_chat_cancel(&state.chat_cancel);
    if let Some(token) = lock.take() {
        token.cancel();
    }
    Ok(())
}

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
        let mut lock = lock_chat_cancel(&state.chat_cancel);
        if let Some(old_token) = lock.take() {
            old_token.cancel();
        }
        *lock = Some(cancel_token.clone());
    }

    tokio::spawn(async move {
        let error_request_id = request_id.clone();
        let result = run_chat_stream(
            app_handle.clone(),
            state.clone(),
            character_id,
            message,
            request_id,
            cancel_token,
        )
        .await;

        {
            let mut lock = lock_chat_cancel(&state.chat_cancel);
            *lock = None;
        }

        if let Err(e) = result {
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
    let character = state
        .characters
        .load_character(&character_id)
        .map_err(|e| e.to_string())?;
    let model_id = character.live2d_model.clone();

    let user_name = if config.user.name.is_empty() {
        "the user"
    } else {
        config.user.name.as_str()
    };

    // 2. Build prompt
    let prompt_result =
        meuxe_core::prompt::build_chat_prompt(meuxe_core::prompt::ChatPromptParams {
            character_loader: &state.characters,
            session_store: &state.sessions,
            memory: &state.memory,
            _expression_manager: &state.expressions,
            character_id: &character_id,
            user_id: &user_id,
            user_name,
            user_message: &message,
            history_limit: None,
        })
        .map_err(|e| e.to_string())?;

    let mut persona_context = prompt_result.system_prompt.clone();
    if !prompt_result.memory_context.is_empty() {
        persona_context.push_str("\n\n");
        persona_context.push_str(&prompt_result.memory_context);
    }
    persona_context.push_str("\n\n## Memory notes (required)\n");
    persona_context.push_str(meuxe_core::memory::TURN_NOTES_INSTRUCTIONS);

    let include_history = {
        let acp = state.acp.lock().unwrap_or_else(|p| p.into_inner());
        !acp.has_live_session(&character_id, &config.agent)
    };

    let acp_prompt = build_acp_agent_prompt(
        &persona_context,
        &prompt_result.messages,
        &message,
        include_history,
    );

    crate::acp::run_acp_chat_stream(crate::acp::RunAcpChatStreamParams {
        app,
        state,
        character_id,
        user_message: message,
        agent_prompt: acp_prompt,
        request_id,
        cancel,
        persona_context,
        memory_snapshot: prompt_result.snapshot,
        model_id,
        tts_config: config.tts.clone(),
        agent_config: config.agent.clone(),
    })
    .await
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
    fn does_not_split_on_titles_or_initials() {
        assert_eq!(
            find_sentence_boundary("I talked to Dr. Chen yesterday. Next", false),
            Some(31)
        );
        assert_eq!(
            find_sentence_boundary("See Mr. Smith about it. Done", false),
            Some(23)
        );
        assert_eq!(
            find_sentence_boundary("We moved to the U.S. last year. Next", false),
            Some(31)
        );
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

    #[test]
    fn peel_expression_updates_current_and_strips_tag() {
        use super::peel_expression_prefix;
        let mut current = "neutral".to_string();
        let rest = peel_expression_prefix("[expression:happy] Hello there.", &mut current);
        assert_eq!(current, "happy");
        assert_eq!(rest, "Hello there.");
    }

    #[test]
    fn peel_expression_maps_companion_moods_to_global_faces() {
        use super::peel_expression_prefix;
        let mut current = "neutral".to_string();
        let rest = peel_expression_prefix("[expression:hurt] That stung.", &mut current);
        assert_eq!(current, "sad");
        assert_eq!(rest, "That stung.");

        let rest = peel_expression_prefix("[expression:worried] Are you okay?", &mut current);
        assert_eq!(current, "thinking");
        assert_eq!(rest, "Are you okay?");
    }

    #[test]
    fn streamed_reply_hides_trailer_and_keeps_titles_together() {
        use meuxe_core::memory::{parse_turn_notes, TrailerSplitter};

        let chunks = [
            "[expression:sad] I talked to Dr. Chen yesterday. ",
            "[expression:thinking] Are you actually going to tell me",
            " how it went?\n```json\n<<<meu",
            "xe\n{\"remember\":[\"They saw Dr. Chen\"],\"mood\":\"hurt\"}\n>>>\n",
        ];
        let mut splitter = TrailerSplitter::new();
        let mut visible = String::new();
        for chunk in chunks {
            visible.push_str(&splitter.feed(chunk));
        }
        let (rest, trailer) = splitter.finish();
        visible.push_str(&rest);

        assert!(!visible.contains("<<<meuxe"));
        assert!(!visible.contains("remember"));
        assert!(visible.contains("Dr. Chen"));
        assert_eq!(
            find_sentence_boundary(&visible, false).map(|i| &visible[..i]),
            Some("[expression:sad] I talked to Dr. Chen yesterday.")
        );
        let notes = parse_turn_notes(&trailer.unwrap()).unwrap();
        assert_eq!(notes.remember, vec!["They saw Dr. Chen"]);
        assert_eq!(notes.mood.unwrap().name, "hurt");
    }

    #[test]
    fn build_acp_agent_prompt_includes_persona_and_user_message() {
        use super::build_acp_agent_prompt;
        let messages = vec![
            meuxe_core::llm::types::ChatMessage::text("system", "ignored"),
            meuxe_core::llm::types::ChatMessage::text("user", "Hi"),
            meuxe_core::llm::types::ChatMessage::text("assistant", "Hey!"),
            meuxe_core::llm::types::ChatMessage::text("user", "Who are you?"),
        ];
        let prompt = build_acp_agent_prompt("You are Luna.", &messages, "Who are you?", true);
        assert!(prompt.contains("You are Luna."));
        assert!(prompt.contains("User: Hi"));
        assert!(prompt.contains("Companion: Hey!"));
        assert!(prompt.contains("Who are you?"));
        assert!(prompt.contains("not OpenCode"));
        assert!(prompt.contains("## How to reply"));
        assert!(prompt.contains("Use tools when they need help"));
        assert!(prompt.contains("Stay in character"));
        assert!(prompt.contains("[expression:NAME]"));
        assert!(prompt.contains("<<<meuxe"));
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
