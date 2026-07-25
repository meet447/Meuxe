use crate::llm::types::ChatMessage;

/// Rough token estimate: ~4 chars per token for English text.
/// This is a fast heuristic — not exact, but good enough for budget management.
fn estimate_tokens(text: &str) -> usize {
    // ~4 chars per token on average for English
    text.len().div_ceil(4)
}

fn message_tokens(msg: &ChatMessage) -> usize {
    let content_tokens = estimate_tokens(msg.content_str());
    // Tool call messages have additional overhead for function name/args
    let tool_tokens = msg
        .tool_calls
        .as_ref()
        .map(|calls| {
            calls
                .iter()
                .map(|tc| {
                    estimate_tokens(&tc.function.name) + estimate_tokens(&tc.function.arguments)
                })
                .sum::<usize>()
        })
        .unwrap_or(0);
    content_tokens + tool_tokens + 4 // 4 tokens overhead per message (role, formatting)
}

/// Compress stale tool result messages.
///
/// Tool results older than `recent_tool_turns` exchanges get replaced with a
/// one-line summary like: "[tool result: read_file returned 4.2KB]"
///
/// This preserves the conversation structure (the LLM still sees that a tool
/// was called and returned something) without wasting tokens on the full output.
pub fn compress_stale_tool_results(messages: &mut [ChatMessage], recent_tool_turns: usize) {
    // Find all tool-result messages (role == "tool") and count from the end
    let tool_indices: Vec<usize> = messages
        .iter()
        .enumerate()
        .filter(|(_, m)| m.role == "tool")
        .map(|(i, _)| i)
        .collect();

    if tool_indices.len() <= recent_tool_turns {
        return; // All tool results are recent
    }

    // Compress all but the last `recent_tool_turns` tool results
    let stale_count = tool_indices.len() - recent_tool_turns;
    for &idx in tool_indices.iter().take(stale_count) {
        let msg = &messages[idx];
        let content_len = msg.content_str().len();
        if content_len > 200 {
            // Find the corresponding tool call to get the tool name
            let tool_name = find_tool_name_for_result(messages, idx);
            let size_label = if content_len > 1024 {
                format!("{:.1}KB", content_len as f64 / 1024.0)
            } else {
                format!("{content_len} chars")
            };
            let summary = format!("[tool result: {tool_name} returned {size_label}]");
            messages[idx] =
                ChatMessage::tool_result(msg.tool_call_id.as_deref().unwrap_or(""), &summary);
        }
    }
}

/// Look backwards from a tool result to find the assistant message with the
/// matching tool_call id, and return the function name.
fn find_tool_name_for_result(messages: &[ChatMessage], tool_result_idx: usize) -> String {
    let target_id = messages[tool_result_idx]
        .tool_call_id
        .as_deref()
        .unwrap_or("");

    if target_id.is_empty() {
        return "unknown".to_string();
    }

    // Search backwards for the assistant message with this tool call
    for msg in messages[..tool_result_idx].iter().rev() {
        if let Some(calls) = &msg.tool_calls {
            for tc in calls {
                if tc.id == target_id {
                    return tc.function.name.clone();
                }
            }
        }
    }

    "unknown".to_string()
}

/// Apply a token budget to the conversation.
///
/// Preserves:
/// - All system messages (always at the front)
/// - The current user message (always the last message)
/// - As many recent messages as fit within the budget
///
/// When over budget, drops the oldest non-system messages first.
/// If still over budget after dropping all droppable messages, keeps what we have
/// (the system prompt alone might exceed the budget for very small models).
pub fn apply_token_budget(messages: &mut Vec<ChatMessage>, max_tokens: usize) {
    let total = messages.iter().map(message_tokens).sum::<usize>();
    if total <= max_tokens {
        return;
    }

    // Separate: system messages (front), droppable middle, last user message
    let system_count = messages.iter().take_while(|m| m.role == "system").count();

    let has_user_at_end = messages.last().map(|m| m.role == "user").unwrap_or(false);

    // Calculate fixed token cost (system + last user message)
    let system_tokens: usize = messages[..system_count].iter().map(message_tokens).sum();

    let last_msg_tokens = if has_user_at_end {
        message_tokens(messages.last().unwrap())
    } else {
        0
    };

    let fixed_tokens = system_tokens + last_msg_tokens;
    if fixed_tokens >= max_tokens {
        // System prompt + user message already exceeds budget — can't trim more
        return;
    }

    let budget_for_history = max_tokens - fixed_tokens;

    // Build history slice (everything between system messages and the last user message)
    let history_end = if has_user_at_end {
        messages.len() - 1
    } else {
        messages.len()
    };
    let history_slice = &messages[system_count..history_end];

    // Take messages from the END (most recent) until we exceed budget
    let mut kept_tokens = 0;
    let mut keep_from = history_slice.len(); // Start from nothing kept

    for (i, msg) in history_slice.iter().enumerate().rev() {
        let msg_tokens = message_tokens(msg);
        if kept_tokens + msg_tokens > budget_for_history {
            break;
        }
        kept_tokens += msg_tokens;
        keep_from = i;
    }

    if keep_from > 0 {
        let dropped = keep_from;
        // Remove the oldest history messages
        messages.drain(system_count..system_count + dropped);

        println!(
            "[context] trimmed {} messages to fit budget ({} → {} est. tokens)",
            dropped,
            total,
            messages.iter().map(message_tokens).sum::<usize>()
        );
    }
}

/// Full context management pass:
/// 1. Compress stale tool results (keep last 2 verbatim)
/// 2. Apply token budget
pub fn manage_context(messages: &mut Vec<ChatMessage>, max_tokens: usize) {
    compress_stale_tool_results(messages, 2);
    apply_token_budget(messages, max_tokens);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        assert_eq!(estimate_tokens("hello"), 2); // 5 chars → ~2 tokens
        assert_eq!(estimate_tokens(""), 0); // (0+3)/4 = 0
    }

    #[test]
    fn test_compress_stale_tool_results() {
        let mut msgs = vec![
            ChatMessage::text("system", "You are helpful."),
            ChatMessage::text("user", "read file A"),
            ChatMessage {
                role: "assistant".to_string(),
                content: None,
                tool_calls: Some(vec![crate::llm::types::ToolCallMessage {
                    id: "call_1".to_string(),
                    call_type: "function".to_string(),
                    function: crate::llm::types::FunctionCall {
                        name: "read_file".to_string(),
                        arguments: r#"{"path":"a.txt"}"#.to_string(),
                    },
                }]),
                tool_call_id: None,
            },
            ChatMessage::tool_result("call_1", &"x".repeat(5000)), // Large stale result
            ChatMessage::text("assistant", "Here is the file content."),
            ChatMessage::text("user", "now read file B"),
            ChatMessage {
                role: "assistant".to_string(),
                content: None,
                tool_calls: Some(vec![crate::llm::types::ToolCallMessage {
                    id: "call_2".to_string(),
                    call_type: "function".to_string(),
                    function: crate::llm::types::FunctionCall {
                        name: "read_file".to_string(),
                        arguments: r#"{"path":"b.txt"}"#.to_string(),
                    },
                }]),
                tool_call_id: None,
            },
            ChatMessage::tool_result("call_2", &"y".repeat(3000)), // Recent result
        ];

        compress_stale_tool_results(&mut msgs, 1);

        // call_1 result (stale) should be compressed
        assert!(msgs[3].content_str().starts_with("[tool result:"));
        assert!(msgs[3].content_str().contains("read_file"));
        // call_2 result (recent) should be preserved
        assert_eq!(msgs[7].content_str().len(), 3000);
    }

    #[test]
    fn test_apply_token_budget() {
        let mut msgs = vec![
            ChatMessage::text("system", "System prompt."),
            ChatMessage::text("user", "msg 1"),
            ChatMessage::text("assistant", "reply 1"),
            ChatMessage::text("user", "msg 2"),
            ChatMessage::text("assistant", "reply 2"),
            ChatMessage::text("user", "msg 3"),
            ChatMessage::text("assistant", "reply 3"),
            ChatMessage::text("user", "current message"),
        ];

        // Very small budget — should keep system + most recent + current user
        apply_token_budget(&mut msgs, 30);

        // System message should always be first
        assert_eq!(msgs[0].role, "system");
        // Last message should always be the current user message
        assert_eq!(msgs.last().unwrap().content_str(), "current message");
        // Should have dropped some middle messages
        assert!(msgs.len() < 8);
    }
}
