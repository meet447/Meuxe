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
pub(crate) fn drain_buffer_sentences(
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

    let mut persona_context = prompt_result.system_prompt.clone();
    if !prompt_result.relationship_prompt.is_empty() {
        persona_context.push_str("\n\n");
        persona_context.push_str(&prompt_result.relationship_prompt);
    }
    if !prompt_result.memory_prompt.is_empty() {
        persona_context.push_str("\n\n");
        persona_context.push_str(&prompt_result.memory_prompt);
    }

    crate::acp::run_acp_chat_stream(
        app,
        state,
        character_id,
        message,
        request_id,
        cancel,
        persona_context,
        model_id,
        config.tts.clone(),
        config.agent.clone(),
    )
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
