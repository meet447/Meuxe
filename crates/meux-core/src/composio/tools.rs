use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use serde_json::{json, Value};

use crate::config::types::ComposioConnectionConfig;
use crate::error::{MeuxError, Result};
use crate::tools::{PermissionLevel, Tool, ToolDefinition, ToolResult};

use super::client::{
    extract_github_readme_markdown, gmail_messages_to_markdown, is_composio_connected,
    ComposioClient, GITHUB_README_TOOL, GMAIL_FETCH_TOOL,
};

#[derive(Clone, Default)]
pub struct ComposioToolState {
    pub api_key: Option<String>,
    pub user_id: String,
    pub connections: HashMap<String, ComposioConnectionConfig>,
}

pub type ComposioToolStateHandle = Arc<RwLock<ComposioToolState>>;

impl ComposioToolState {
    pub fn toolkit_connected(&self, toolkit: &str) -> bool {
        self.connections
            .get(toolkit)
            .map(|connection| is_composio_connected(&connection.status))
            .unwrap_or(false)
    }

    pub fn client(&self) -> Result<ComposioClient> {
        let api_key = self
            .api_key
            .as_ref()
            .filter(|key| !key.trim().is_empty())
            .ok_or_else(|| {
                MeuxError::Tool(
                    "Composio API key is not configured. Add it in Settings → Integrations."
                        .to_string(),
                )
            })?;
        Ok(ComposioClient::new(api_key.clone()))
    }
}

pub struct ComposioGmailFetchTool {
    state: ComposioToolStateHandle,
}

impl ComposioGmailFetchTool {
    pub fn new(state: ComposioToolStateHandle) -> Self {
        Self { state }
    }
}

#[async_trait]
impl Tool for ComposioGmailFetchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "composio_gmail_fetch_emails".to_string(),
            description: "Fetch recent Gmail inbox messages through the user's connected Composio Gmail account. Use when the user asks to check mail, read emails, or summarize their inbox.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of recent messages to fetch (default 10, max 25)"
                    }
                }
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: Value) -> Result<ToolResult> {
        let state = self
            .state
            .read()
            .map_err(|e| MeuxError::Tool(e.to_string()))?
            .clone();
        if !state.toolkit_connected("gmail") {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                success: false,
                content: "Gmail is not connected. Connect Gmail in Settings → Integrations first."
                    .to_string(),
            });
        }

        let client = state.client()?;
        let connected_account_id =
            ComposioClient::connected_account_for_toolkit(&state.connections, "gmail")?;
        let max_results = arguments
            .get("max_results")
            .and_then(Value::as_u64)
            .unwrap_or(10)
            .clamp(1, 25) as u32;

        let response = client
            .execute_tool(
                GMAIL_FETCH_TOOL,
                &state.user_id,
                &connected_account_id,
                json!({
                    "max_results": max_results,
                    "include_payload": true,
                    "verbose": true,
                }),
            )
            .await?;

        let markdown = gmail_messages_to_markdown(super::client::tool_payload(&response));
        Ok(ToolResult {
            tool_call_id: String::new(),
            success: true,
            content: markdown,
        })
    }
}

pub struct ComposioGithubReadmeTool {
    state: ComposioToolStateHandle,
}

impl ComposioGithubReadmeTool {
    pub fn new(state: ComposioToolStateHandle) -> Self {
        Self { state }
    }
}

#[async_trait]
impl Tool for ComposioGithubReadmeTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "composio_github_get_readme".to_string(),
            description: "Fetch a GitHub repository README through the user's connected Composio GitHub account.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "owner": { "type": "string", "description": "Repository owner or org" },
                    "repo": { "type": "string", "description": "Repository name" }
                },
                "required": ["owner", "repo"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: Value) -> Result<ToolResult> {
        let state = self
            .state
            .read()
            .map_err(|e| MeuxError::Tool(e.to_string()))?
            .clone();
        if !state.toolkit_connected("github") {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                success: false,
                content:
                    "GitHub is not connected. Connect GitHub in Settings → Integrations first."
                        .to_string(),
            });
        }

        let owner = arguments
            .get("owner")
            .and_then(Value::as_str)
            .ok_or_else(|| MeuxError::Tool("owner is required".to_string()))?;
        let repo = arguments
            .get("repo")
            .and_then(Value::as_str)
            .ok_or_else(|| MeuxError::Tool("repo is required".to_string()))?;

        let client = state.client()?;
        let connected_account_id =
            ComposioClient::connected_account_for_toolkit(&state.connections, "github")?;

        let tool_response = client
            .execute_tool(
                GITHUB_README_TOOL,
                &state.user_id,
                &connected_account_id,
                json!({ "owner": owner, "repo": repo }),
            )
            .await?;

        let proxy_response = client
            .proxy_request(
                &connected_account_id,
                &format!("/repos/{owner}/{repo}/readme"),
                "GET",
                vec![],
            )
            .await
            .ok();

        let readme =
            extract_github_readme_markdown(&tool_response, proxy_response.as_ref())?;
        Ok(ToolResult {
            tool_call_id: String::new(),
            success: true,
            content: readme,
        })
    }
}

pub fn composio_tool_available(name: &str, state: &ComposioToolState) -> bool {
    if state.api_key.as_ref().is_none_or(|key| key.trim().is_empty()) {
        return false;
    }
    match name {
        "composio_gmail_fetch_emails" => state.toolkit_connected("gmail"),
        "composio_github_get_readme" => state.toolkit_connected("github"),
        _ => false,
    }
}
