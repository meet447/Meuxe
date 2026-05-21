use std::collections::HashMap;

use serde_json::{json, Value};

use crate::error::{MeuxError, Result};
use crate::tools::{PermissionLevel, ToolDefinition, ToolResult};

use super::client::{
    gmail_message_to_markdown, gmail_messages_to_markdown, gmail_threads_to_markdown,
    tool_payload, value_string, ComposioClient,
};
use super::tools::ComposioToolState;

/// Max Composio tools exposed to the LLM per connected toolkit.
const MAX_TOOLS_PER_TOOLKIT: usize = 50;
/// Max Composio tools total across all toolkits in one chat request.
const MAX_TOTAL_COMPOSIO_TOOLS: usize = 100;

#[derive(Debug, Clone)]
pub struct ComposioCatalogEntry {
    pub llm_name: String,
    pub composio_slug: String,
    pub toolkit: String,
    pub description: String,
    pub parameters: Value,
    pub permission_level: PermissionLevel,
}

impl ComposioCatalogEntry {
    pub fn to_definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.llm_name.clone(),
            description: self.description.clone(),
            parameters: self.parameters.clone(),
            permission_level: self.permission_level.clone(),
        }
    }

    pub fn to_openai_json(&self) -> Value {
        json!({
            "type": "function",
            "function": {
                "name": self.llm_name,
                "description": self.description,
                "parameters": self.parameters,
            }
        })
    }
}

pub fn llm_name_from_slug(slug: &str) -> String {
    format!("composio_{}", slug.to_lowercase())
}

pub fn permission_for_slug(slug: &str) -> PermissionLevel {
    let upper = slug.to_uppercase();
    const DANGEROUS: &[&str] = &[
        "SEND",
        "DELETE",
        "REMOVE",
        "BATCH_DELETE",
        "TRASH",
        "FORWARD",
        "REPLY",
        "POST_MESSAGE",
        "RUN_COMMAND",
        "EXECUTE",
        "PERMANENTLY",
    ];
    const CAUTIOUS: &[&str] = &[
        "CREATE",
        "ADD_",
        "UPDATE",
        "PATCH",
        "MODIFY",
        "WRITE",
        "SAVE",
        "UPLOAD",
        "INSERT",
    ];
    if DANGEROUS.iter().any(|needle| upper.contains(needle)) {
        PermissionLevel::Dangerous
    } else if CAUTIOUS.iter().any(|needle| upper.contains(needle)) {
        PermissionLevel::Cautious
    } else {
        PermissionLevel::Safe
    }
}

fn toolkit_slug_from_item(item: &Value) -> Option<String> {
    item.get("toolkit")
        .and_then(|tk| value_string(tk, &["slug"]))
        .or_else(|| value_string(item, &["toolkit_slug", "toolkitSlug"]))
}

fn is_deprecated(item: &Value) -> bool {
    item.get("is_deprecated")
        .or_else(|| item.get("isDeprecated"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn normalize_parameters(raw: &Value) -> Value {
    if let Some(params) = raw.get("input_parameters") {
        if params.is_object() && !params.as_object().map(|o| o.is_empty()).unwrap_or(true) {
            return params.clone();
        }
    }
    if raw.is_object() && raw.get("type").is_some() {
        return raw.clone();
    }
    if raw.is_object() && !raw.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return json!({
            "type": "object",
            "properties": raw,
        });
    }
    json!({
        "type": "object",
        "properties": {}
    })
}

fn parse_tool_item(item: &Value, toolkit: &str) -> Option<ComposioCatalogEntry> {
    if is_deprecated(item) {
        return None;
    }
    let composio_slug = value_string(item, &["slug", "name"])?;
    if composio_slug.trim().is_empty() {
        return None;
    }
    let item_toolkit = toolkit_slug_from_item(item).unwrap_or_else(|| toolkit.to_string());
    let description = value_string(item, &["description"])
        .filter(|d| !d.trim().is_empty())
        .unwrap_or_else(|| composio_slug.clone());
    let parameters = normalize_parameters(item);
    let permission_level = permission_for_slug(&composio_slug);
    let llm_name = llm_name_from_slug(&composio_slug);
    Some(ComposioCatalogEntry {
        llm_name,
        composio_slug,
        toolkit: item_toolkit,
        description,
        parameters,
        permission_level,
    })
}

pub async fn build_catalog(state: &ComposioToolState) -> Result<HashMap<String, ComposioCatalogEntry>> {
    let api_key = state.api_key.as_ref().filter(|k| !k.trim().is_empty()).ok_or_else(|| {
        MeuxError::Tool("Composio API key is not configured.".to_string())
    })?;
    let client = ComposioClient::new(api_key.clone());

    let mut catalog = HashMap::new();
    let mut total = 0usize;

    for toolkit in &state.enabled_toolkits {
        if total >= MAX_TOTAL_COMPOSIO_TOOLS {
            break;
        }
        if !state.toolkit_connected(toolkit) {
            continue;
        }

        let tools = client
            .list_tools_for_toolkit(toolkit, MAX_TOOLS_PER_TOOLKIT)
            .await?;
        let mut per_toolkit = 0usize;
        for item in tools {
            if total >= MAX_TOTAL_COMPOSIO_TOOLS || per_toolkit >= MAX_TOOLS_PER_TOOLKIT {
                break;
            }
            let Some(entry) = parse_tool_item(&item, toolkit) else {
                continue;
            };
            if !state.toolkit_connected(&entry.toolkit) {
                continue;
            }
            catalog.insert(entry.llm_name.clone(), entry);
            per_toolkit += 1;
            total += 1;
        }
    }

    Ok(catalog)
}

pub async fn execute_catalog_entry(
    state: &ComposioToolState,
    entry: &ComposioCatalogEntry,
    arguments: Value,
) -> Result<ToolResult> {
    if !state.toolkit_connected(&entry.toolkit) {
        return Ok(ToolResult {
            tool_call_id: String::new(),
            success: false,
            content: format!(
                "{} is not connected. Connect it in Settings → Integrations first.",
                entry.toolkit
            ),
        });
    }

    let client = state.client()?;
    let connected_account_id =
        ComposioClient::connected_account_for_toolkit(&state.connections, &entry.toolkit)?;

    let response = client
        .execute_tool(
            &entry.composio_slug,
            &state.user_id,
            &connected_account_id,
            arguments,
        )
        .await?;

    let content = format_composio_result(&entry.composio_slug, tool_payload(&response));
    Ok(ToolResult {
        tool_call_id: String::new(),
        success: true,
        content,
    })
}

pub fn format_composio_result(slug: &str, data: &Value) -> String {
    let upper = slug.to_uppercase();
    if upper.contains("THREAD") && upper.starts_with("GMAIL_") {
        return gmail_threads_to_markdown(data);
    }
    if upper.contains("FETCH_MESSAGE") || upper == "GMAIL_GET_MESSAGE" {
        return gmail_message_to_markdown(data);
    }
    if upper.starts_with("GMAIL_")
        && (upper.contains("FETCH") || upper.contains("EMAIL") || upper.contains("SEARCH"))
    {
        return gmail_messages_to_markdown(data);
    }
    generic_json_markdown(data)
}

fn generic_json_markdown(data: &Value) -> String {
    serde_json::to_string_pretty(data).unwrap_or_else(|_| data.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_name_is_stable() {
        assert_eq!(
            llm_name_from_slug("GMAIL_FETCH_EMAILS"),
            "composio_gmail_fetch_emails"
        );
    }

    #[test]
    fn fetch_is_safe_send_is_dangerous() {
        assert_eq!(
            permission_for_slug("GMAIL_FETCH_EMAILS"),
            PermissionLevel::Safe
        );
        assert_eq!(
            permission_for_slug("GMAIL_SEND_EMAIL"),
            PermissionLevel::Dangerous
        );
    }
}
