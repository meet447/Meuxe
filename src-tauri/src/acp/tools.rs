use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionKind, RequestPermissionOutcome, SelectedPermissionOutcome,
    ToolCall, ToolCallContent, ToolCallStatus, ToolCallUpdate, ToolCallUpdateFields, ToolKind,
};
use serde_json::Value;

const TOOL_RESULT_MAX_BYTES: usize = 4096;

pub fn permission_kind_snake_case(kind: PermissionOptionKind) -> &'static str {
    match kind {
        PermissionOptionKind::AllowOnce => "allow_once",
        PermissionOptionKind::AllowAlways => "allow_always",
        PermissionOptionKind::RejectOnce => "reject_once",
        PermissionOptionKind::RejectAlways => "reject_always",
        _ => "other",
    }
}

pub fn tool_display_name(title: Option<&str>, kind: Option<ToolKind>) -> String {
    if let Some(title) = title.filter(|t| !t.trim().is_empty()) {
        return title.trim().to_string();
    }
    if let Some(kind) = kind {
        return tool_kind_label(kind);
    }
    "tool".to_string()
}

fn tool_kind_label(kind: ToolKind) -> String {
    match kind {
        ToolKind::Read => "read",
        ToolKind::Edit => "edit",
        ToolKind::Delete => "delete",
        ToolKind::Move => "move",
        ToolKind::Search => "search",
        ToolKind::Execute => "execute",
        ToolKind::Think => "think",
        ToolKind::Fetch => "fetch",
        ToolKind::SwitchMode => "switch_mode",
        ToolKind::Other => "other",
        _ => "other",
    }
    .to_string()
}

pub fn tool_arguments_json(raw_input: Option<&Value>) -> Value {
    raw_input
        .cloned()
        .unwrap_or(Value::Object(Default::default()))
}

pub fn tool_call_arguments(tool_call: &ToolCall) -> Value {
    tool_arguments_json(tool_call.raw_input.as_ref())
}

pub fn tool_update_arguments(fields: &ToolCallUpdateFields) -> Value {
    tool_arguments_json(fields.raw_input.as_ref())
}

pub fn render_tool_result(
    content: Option<&[ToolCallContent]>,
    raw_output: Option<&Value>,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    if let Some(items) = content {
        for item in items {
            if let ToolCallContent::Content(block) = item {
                if let agent_client_protocol::schema::v1::ContentBlock::Text(text) = &block.content
                {
                    let trimmed = text.text.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_string());
                    }
                }
            }
        }
    }

    if parts.is_empty() {
        if let Some(output) = raw_output {
            parts.push(match output {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            });
        }
    }

    let joined = if parts.is_empty() {
        String::new()
    } else {
        parts.join("\n")
    };

    truncate_utf8(&joined, TOOL_RESULT_MAX_BYTES)
}

fn truncate_utf8(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

pub fn is_terminal_tool_status(status: ToolCallStatus) -> bool {
    matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed)
}

pub fn permission_outcome(
    options: &[PermissionOption],
    approved: bool,
) -> RequestPermissionOutcome {
    if approved {
        if let Some(option) = options
            .iter()
            .find(|opt| opt.kind == PermissionOptionKind::AllowOnce)
        {
            return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                option.option_id.clone(),
            ));
        }
        if let Some(option) = options
            .iter()
            .find(|opt| opt.kind == PermissionOptionKind::AllowAlways)
        {
            return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                option.option_id.clone(),
            ));
        }
        if let Some(option) = options.first() {
            return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                option.option_id.clone(),
            ));
        }
        return RequestPermissionOutcome::Cancelled;
    }

    if let Some(option) = options
        .iter()
        .find(|opt| opt.kind == PermissionOptionKind::RejectOnce)
    {
        return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
            option.option_id.clone(),
        ));
    }
    if let Some(option) = options
        .iter()
        .find(|opt| opt.kind == PermissionOptionKind::RejectAlways)
    {
        return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
            option.option_id.clone(),
        ));
    }

    RequestPermissionOutcome::Cancelled
}

pub fn permission_description(fields: &ToolCallUpdateFields) -> String {
    fields
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "The agent wants to run a tool.".to_string())
}

pub fn permission_id_for(request_id: &str, tool_call_id: &str) -> String {
    format!("{request_id}:{tool_call_id}")
}

pub fn tool_call_id_str(update: &ToolCallUpdate) -> String {
    update.tool_call_id.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::PermissionOptionId;

    #[test]
    fn permission_outcome_prefers_allow_once() {
        let options = vec![
            PermissionOption::new(
                PermissionOptionId::from("allow-always"),
                "Always",
                PermissionOptionKind::AllowAlways,
            ),
            PermissionOption::new(
                PermissionOptionId::from("allow-once"),
                "Once",
                PermissionOptionKind::AllowOnce,
            ),
        ];
        let outcome = permission_outcome(&options, true);
        assert!(matches!(
            outcome,
            RequestPermissionOutcome::Selected(selected)
            if selected.option_id.to_string() == "allow-once"
        ));
    }

    #[test]
    fn truncates_tool_result_at_char_boundary() {
        let text = "é".repeat(3000);
        let truncated = truncate_utf8(&text, 4096);
        assert!(truncated.len() <= 4096);
        assert!(truncated.is_char_boundary(truncated.len()));
    }
}
