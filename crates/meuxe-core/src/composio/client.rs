use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use serde_json::Value;

use crate::config::types::ComposioConnectionConfig;
use crate::error::{MeuxeError, Result};

pub const COMPOSIO_BASE_URL: &str = "https://backend.composio.dev";
pub const GITHUB_README_TOOL: &str = "GITHUB_GET_A_REPOSITORY_README";
pub const GMAIL_FETCH_TOOL: &str = "GMAIL_FETCH_EMAILS";

pub struct ComposioClient {
    http: Client,
    #[allow(dead_code)]
    api_key: String,
}

impl ComposioClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        let api_key = api_key.into();
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            "x-api-key",
            reqwest::header::HeaderValue::from_str(&api_key)
                .unwrap_or_else(|_| reqwest::header::HeaderValue::from_static("")),
        );
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        );
        let http = Client::builder()
            .default_headers(headers)
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { http, api_key }
    }

    pub async fn request_json(&self, request: reqwest::RequestBuilder) -> Result<Value> {
        let response = request.send().await.map_err(MeuxeError::Http)?;
        let status = response.status();
        let text = response.text().await.map_err(MeuxeError::Http)?;
        if !status.is_success() {
            return Err(MeuxeError::Llm(format!(
                "Composio request failed ({status}): {text}"
            )));
        }
        serde_json::from_str(&text)
            .map_err(|e| MeuxeError::Llm(format!("Invalid Composio response: {e}")))
    }

    pub async fn find_or_create_auth_config(&self, toolkit: &str) -> Result<String> {
        let list_url = format!("{COMPOSIO_BASE_URL}/api/v3/auth_configs");
        let listed = self
            .request_json(
                self.http
                    .get(&list_url)
                    .query(&[("toolkit_slug", toolkit), ("limit", "20")]),
            )
            .await?;
        if let Some(id) = items(&listed)
            .iter()
            .find_map(|item| value_string(item, &["id", "nanoid"]))
        {
            return Ok(id);
        }

        let created = self
            .request_json(self.http.post(&list_url).json(&serde_json::json!({
                "toolkit": { "slug": toolkit },
                "auth_config": {
                    "type": "use_composio_managed_auth",
                    "name": format!("Meuxe {toolkit} Auth")
                }
            })))
            .await?;
        value_string(&created, &["id", "nanoid"])
            .or_else(|| {
                created
                    .get("auth_config")
                    .and_then(|v| value_string(v, &["id", "nanoid"]))
            })
            .ok_or_else(|| MeuxeError::Llm("Composio did not return an auth config id".to_string()))
    }

    pub async fn connected_account(&self, connected_account_id: &str) -> Result<Value> {
        self.request_json(self.http.get(format!(
            "{COMPOSIO_BASE_URL}/api/v3/connected_accounts/{connected_account_id}"
        )))
        .await
    }

    pub async fn list_connected_accounts(
        &self,
        user_id: &str,
        auth_config_id: Option<&str>,
    ) -> Result<Vec<Value>> {
        let mut query: Vec<(&str, &str)> = vec![("user_ids", user_id), ("limit", "100")];
        if let Some(auth_config_id) = auth_config_id {
            query.push(("auth_config_ids", auth_config_id));
        }
        let value = self
            .request_json(
                self.http
                    .get(format!("{COMPOSIO_BASE_URL}/api/v3/connected_accounts"))
                    .query(&query),
            )
            .await?;
        Ok(items(&value))
    }

    pub async fn link_toolkit(
        &self,
        user_id: &str,
        auth_config_id: &str,
    ) -> Result<(String, String, String)> {
        let response = self
            .request_json(
                self.http
                    .post(format!(
                        "{COMPOSIO_BASE_URL}/api/v3/connected_accounts/link"
                    ))
                    .json(&serde_json::json!({
                        "auth_config_id": auth_config_id,
                        "user_id": user_id,
                    })),
            )
            .await?;
        let connected_account_id = value_string(&response, &["connected_account_id", "id"])
            .ok_or_else(|| {
                MeuxeError::Llm("Composio did not return a connected account id".to_string())
            })?;
        let redirect_url = value_string(&response, &["redirect_url", "redirectUrl"])
            .ok_or_else(|| MeuxeError::Llm("Composio did not return a redirect URL".to_string()))?;
        let status =
            value_string(&response, &["status"]).unwrap_or_else(|| "initiated".to_string());
        Ok((connected_account_id, redirect_url, status))
    }

    pub async fn list_tools_for_toolkit(
        &self,
        toolkit_slug: &str,
        limit: usize,
    ) -> Result<Vec<Value>> {
        let capped = limit.clamp(1, 100);
        let response = self
            .request_json(
                self.http
                    .get(format!("{COMPOSIO_BASE_URL}/api/v3/tools"))
                    .query(&[
                        ("toolkit_slug", toolkit_slug),
                        ("limit", &capped.to_string()),
                        ("include_deprecated", "false"),
                    ]),
            )
            .await?;
        Ok(items(&response))
    }

    pub async fn execute_tool(
        &self,
        tool_slug: &str,
        user_id: &str,
        connected_account_id: &str,
        arguments: Value,
    ) -> Result<Value> {
        let response = self
            .request_json(
                self.http
                    .post(format!(
                        "{COMPOSIO_BASE_URL}/api/v3.1/tools/execute/{tool_slug}"
                    ))
                    .json(&serde_json::json!({
                        "user_id": user_id,
                        "connected_account_id": connected_account_id,
                        "arguments": arguments,
                    })),
            )
            .await?;
        if let Some(error) = tool_error(&response) {
            return Err(MeuxeError::Llm(format!(
                "Composio tool {tool_slug} failed: {error}"
            )));
        }
        Ok(response)
    }

    pub async fn proxy_request(
        &self,
        connected_account_id: &str,
        endpoint: &str,
        method: &str,
        parameters: Vec<Value>,
    ) -> Result<Value> {
        let response = self
            .request_json(
                self.http
                    .post(format!("{COMPOSIO_BASE_URL}/api/v3.1/tools/execute/proxy"))
                    .json(&serde_json::json!({
                        "connected_account_id": connected_account_id,
                        "endpoint": endpoint,
                        "method": method,
                        "parameters": parameters,
                    })),
            )
            .await?;
        if let Some(error) = tool_error(&response) {
            return Err(MeuxeError::Llm(format!(
                "Composio proxy request failed: {error}"
            )));
        }
        Ok(response)
    }

    pub fn connected_account_for_toolkit(
        connections: &HashMap<String, ComposioConnectionConfig>,
        toolkit: &str,
    ) -> Result<String> {
        connections
            .get(toolkit)
            .and_then(|connection| connection.connected_account_id.clone())
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| {
                MeuxeError::Tool(format!(
                    "{toolkit} is not connected. Connect it in Settings → Integrations first."
                ))
            })
    }
}

pub fn items(value: &Value) -> Vec<Value> {
    value
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| value.get("data").and_then(Value::as_array).cloned())
        .unwrap_or_default()
}

pub fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

pub fn connection_status_from_value(value: &Value) -> String {
    value_string(value, &["status"])
        .or_else(|| {
            value
                .get("connection")
                .and_then(|c| value_string(c, &["status"]))
        })
        .unwrap_or_else(|| "unknown".to_string())
}

pub fn is_composio_connected(status: &str) -> bool {
    matches!(
        status.trim().to_uppercase().as_str(),
        "ACTIVE" | "CONNECTED" | "ENABLED"
    )
}

pub fn status_display_label(status: &str, has_api_key: bool) -> String {
    if !has_api_key {
        return "Save API key first".to_string();
    }
    let upper = status.trim().to_uppercase();
    match upper.as_str() {
        "ACTIVE" | "CONNECTED" | "ENABLED" => "Connected".to_string(),
        "INITIATED" | "INITIALIZING" | "PENDING" => "Complete OAuth in browser".to_string(),
        "INACTIVE" | "DISABLED" => "Disconnected".to_string(),
        "NOT_CONNECTED" | "" => "Not connected".to_string(),
        _ if upper.starts_with("REFRESH_FAILED") => status.to_string(),
        _ => status.to_string(),
    }
}

fn tool_succeeded(value: &Value) -> bool {
    value
        .get("successful")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn tool_error(value: &Value) -> Option<String> {
    if tool_succeeded(value) {
        return None;
    }
    value
        .get("error")
        .and_then(|err| err.as_str().map(str::to_string))
        .or_else(|| {
            value
                .get("error")
                .and_then(|err| err.get("message"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

pub fn tool_payload(value: &Value) -> &Value {
    value.get("data").unwrap_or(value)
}

pub fn extract_proxy_text(value: &Value) -> Result<String> {
    let payload = tool_payload(value);
    if let Some(text) = payload.as_str() {
        return Ok(text.to_string());
    }
    if let Some(text) = payload.get("body").and_then(Value::as_str) {
        return Ok(text.to_string());
    }
    if let Some(text) = payload
        .get("response")
        .and_then(|response| response.as_str())
    {
        return Ok(text.to_string());
    }
    if let Some(content) = payload.get("content").and_then(Value::as_str) {
        if payload
            .get("encoding")
            .and_then(Value::as_str)
            .is_some_and(|encoding| encoding.eq_ignore_ascii_case("base64"))
        {
            let decoded = BASE64.decode(content).map_err(|e| {
                MeuxeError::Tool(format!("Failed to decode base64 proxy content: {e}"))
            })?;
            return String::from_utf8(decoded)
                .map_err(|e| MeuxeError::Tool(format!("Proxy content was not valid UTF-8: {e}")));
        }
        return Ok(content.to_string());
    }
    Err(MeuxeError::Tool(
        "Composio proxy response did not include readable text".to_string(),
    ))
}

pub fn extract_github_readme_markdown(
    tool_response: &Value,
    proxy_response: Option<&Value>,
) -> Result<String> {
    let payload = tool_payload(tool_response);
    if let Some(text) = payload.as_str() {
        return Ok(text.to_string());
    }
    for key in ["content", "readme", "markdown", "text", "body"] {
        if let Some(text) = payload.get(key).and_then(Value::as_str) {
            return Ok(text.to_string());
        }
    }
    if let Some(proxy_response) = proxy_response {
        if let Ok(text) = extract_proxy_text(proxy_response) {
            if !text.trim().is_empty() {
                return Ok(text);
            }
        }
    }
    Err(MeuxeError::Tool(
        "Composio GitHub README response did not include markdown content".to_string(),
    ))
}

pub fn gmail_messages_to_markdown(data: &Value) -> String {
    let messages = data
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| {
            data.get("data")
                .and_then(|inner| inner.get("messages"))
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default();

    if messages.is_empty() {
        return "No recent Gmail messages were returned.".to_string();
    }

    let mut lines = vec!["# Recent Gmail messages".to_string(), String::new()];
    for (index, message) in messages.iter().take(25).enumerate() {
        let subject = message
            .get("subject")
            .or_else(|| {
                message
                    .get("payload")
                    .and_then(|payload| payload.get("subject"))
            })
            .and_then(Value::as_str)
            .unwrap_or("(no subject)");
        let sender = message
            .get("sender")
            .or_else(|| message.get("from"))
            .or_else(|| {
                message
                    .get("payload")
                    .and_then(|payload| payload.get("from"))
            })
            .and_then(Value::as_str)
            .unwrap_or("unknown sender");
        let snippet = message
            .get("snippet")
            .or_else(|| message.get("preview"))
            .or_else(|| message.get("messageText"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let received = message
            .get("messageTimestamp")
            .or_else(|| message.get("internalDate"))
            .or_else(|| message.get("date"))
            .and_then(Value::as_str)
            .unwrap_or("");
        lines.push(format!("## {index}. {subject}"));
        lines.push(format!("- From: {sender}"));
        if !received.is_empty() {
            lines.push(format!("- Received: {received}"));
        }
        if !snippet.is_empty() {
            lines.push(String::new());
            lines.push(snippet.to_string());
        }
        lines.push(String::new());
    }
    lines.join("\n")
}

pub fn gmail_message_to_markdown(data: &Value) -> String {
    let message = data
        .get("message")
        .or_else(|| data.get("data"))
        .unwrap_or(data);

    let subject = message
        .get("subject")
        .or_else(|| {
            message
                .get("payload")
                .and_then(|payload| payload.get("subject"))
        })
        .and_then(Value::as_str)
        .unwrap_or("(no subject)");
    let sender = message
        .get("sender")
        .or_else(|| message.get("from"))
        .or_else(|| {
            message
                .get("payload")
                .and_then(|payload| payload.get("from"))
        })
        .and_then(Value::as_str)
        .unwrap_or("unknown sender");
    let snippet = message
        .get("snippet")
        .or_else(|| message.get("preview"))
        .or_else(|| message.get("messageText"))
        .or_else(|| message.get("body"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let received = message
        .get("messageTimestamp")
        .or_else(|| message.get("internalDate"))
        .or_else(|| message.get("date"))
        .and_then(Value::as_str)
        .unwrap_or("");

    let mut lines = vec![format!("# {subject}"), format!("- From: {sender}")];
    if !received.is_empty() {
        lines.push(format!("- Received: {received}"));
    }
    if !snippet.is_empty() {
        lines.push(String::new());
        lines.push(snippet.to_string());
    }
    lines.join("\n")
}

pub fn gmail_threads_to_markdown(data: &Value) -> String {
    let threads = data
        .get("threads")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| {
            data.get("data")
                .and_then(|inner| inner.get("threads"))
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default();

    if threads.is_empty() {
        return "No Gmail threads matched the query.".to_string();
    }

    let mut lines = vec!["# Gmail threads".to_string(), String::new()];
    for (index, thread) in threads.iter().take(25).enumerate() {
        let id = thread
            .get("id")
            .or_else(|| thread.get("threadId"))
            .and_then(Value::as_str)
            .unwrap_or("(unknown id)");
        let snippet = thread.get("snippet").and_then(Value::as_str).unwrap_or("");
        lines.push(format!("## {index}. Thread {id}"));
        if !snippet.is_empty() {
            lines.push(snippet.to_string());
        }
        lines.push(String::new());
    }
    lines.join("\n")
}
