use std::pin::Pin;

use async_stream::try_stream;
use futures::Stream;
use reqwest::Client;
use serde_json::json;

use crate::error::{MeuxError, Result};

use super::types::{ModelsListResponse, *};

pub struct OpenAiCompatClient {
    client: Client,
}

impl OpenAiCompatClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Stream chat completions using SSE (Server-Sent Events).
    /// This is the legacy method that only yields text chunks.
    pub fn stream_chat(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send + '_>> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let body = json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": true,
        });
        let api_key = config.api_key.clone();

        Box::pin(try_stream! {
            let response = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {api_key}"))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(MeuxError::Http)?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                Err(MeuxError::Llm(format!("HTTP {status}: {text}")))?;
                unreachable!();
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();

            use futures::StreamExt;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(MeuxError::Http)?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                // Process complete lines from the buffer
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if line == "data: [DONE]" {
                        return;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        match serde_json::from_str::<ChatCompletionChunk>(data) {
                            Ok(chunk) => {
                                for choice in &chunk.choices {
                                    if let Some(ref content) = choice.delta.content {
                                        if !content.is_empty() {
                                            yield StreamChunk {
                                                text: content.clone(),
                                            };
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                Err(MeuxError::Llm(format!(
                                    "Failed to parse SSE chunk: {e} — raw: {data}"
                                )))?;
                            }
                        }
                    }
                }
            }
        })
    }

    /// Stream chat completions with tool-calling support.
    /// Yields `StreamEvent` variants for text, tool calls, and completion.
    pub fn stream_chat_with_tools(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
        tools: Option<Vec<serde_json::Value>>,
    ) -> Pin<Box<dyn Stream<Item = Result<StreamEvent>> + Send + '_>> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let mut body = json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": true,
        });

        if let Some(tools) = tools {
            if !tools.is_empty() {
                body["tools"] = serde_json::Value::Array(tools);
            }
        }

        let api_key = config.api_key.clone();

        Box::pin(try_stream! {
            let response = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {api_key}"))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(MeuxError::Http)?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                Err(MeuxError::Llm(format!("HTTP {status}: {text}")))?;
                unreachable!();
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();
            let mut last_finish_reason: Option<String> = None;

            // Accumulate tool calls across multiple SSE chunks.
            // Each index maps to (id, name, accumulated_arguments).
            let mut tool_call_acc: Vec<(String, String, String)> = Vec::new();

            use futures::StreamExt;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(MeuxError::Http)?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if line == "data: [DONE]" {
                        // Emit any accumulated tool calls
                        for (id, name, args) in tool_call_acc.drain(..) {
                            yield StreamEvent::ToolCallComplete { id, name, arguments: args };
                        }

                        let reason = last_finish_reason.take().unwrap_or_else(|| "stop".to_string());
                        yield StreamEvent::Done { finish_reason: reason };
                        return;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        match serde_json::from_str::<ChatCompletionChunk>(data) {
                            Ok(parsed) => {
                                for choice in &parsed.choices {
                                    // Track finish_reason
                                    if let Some(ref reason) = choice.finish_reason {
                                        last_finish_reason = Some(reason.clone());
                                    }

                                    // Text content
                                    if let Some(ref content) = choice.delta.content {
                                        if !content.is_empty() {
                                            yield StreamEvent::TextDelta(content.clone());
                                        }
                                    }

                                    // Tool call deltas
                                    if let Some(ref tc_deltas) = choice.delta.tool_calls {
                                        for tc in tc_deltas {
                                            let idx = tc.index;

                                            // Ensure we have enough slots
                                            while tool_call_acc.len() <= idx {
                                                tool_call_acc.push((String::new(), String::new(), String::new()));
                                            }

                                            // Set id if present
                                            if let Some(ref id) = tc.id {
                                                tool_call_acc[idx].0 = id.clone();
                                            }

                                            // Set function name if present
                                            if let Some(ref func) = tc.function {
                                                if let Some(ref name) = func.name {
                                                    tool_call_acc[idx].1 = name.clone();
                                                }
                                                if let Some(ref args) = func.arguments {
                                                    tool_call_acc[idx].2.push_str(args);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                Err(MeuxError::Llm(format!(
                                    "Failed to parse SSE chunk: {e} — raw: {data}"
                                )))?;
                            }
                        }
                    }
                }
            }

            // If stream ended without [DONE], emit accumulated tool calls + done
            for (id, name, args) in tool_call_acc.drain(..) {
                yield StreamEvent::ToolCallComplete { id, name, arguments: args };
            }
            let reason = last_finish_reason.take().unwrap_or_else(|| "stop".to_string());
            yield StreamEvent::Done { finish_reason: reason };
        })
    }

    /// List models from an OpenAI-compatible `GET /v1/models` endpoint.
    pub async fn list_models(&self, base_url: &str, api_key: &str) -> Result<Vec<String>> {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let mut request = self
            .client
            .get(&url)
            .header("Content-Type", "application/json");
        if !api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {api_key}"));
        }

        let response = request.send().await.map_err(MeuxError::Http)?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(MeuxError::Llm(format!("HTTP {status}: {text}")));
        }

        let body = response.text().await.map_err(MeuxError::Http)?;
        parse_models_list_body(&body)
    }

    /// Non-streaming chat completion with retry (up to 2 retries).
    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Result<String> {
        crate::retry::retry_with_backoff(5, 500, crate::retry::is_retryable_llm_error, || {
            self.chat_once(messages.clone(), config)
        })
        .await
    }

    async fn chat_once(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Result<String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let body = json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": false,
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(MeuxError::Http)?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(MeuxError::Llm(format!("HTTP {status}: {text}")));
        }

        let completion: ChatCompletionResponse = response.json().await.map_err(MeuxError::Http)?;

        completion
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .ok_or_else(|| MeuxError::Llm("No content in response".to_string()))
    }
}

fn parse_models_list_body(body: &str) -> Result<Vec<String>> {
    if let Ok(parsed) = serde_json::from_str::<ModelsListResponse>(body) {
        let mut ids: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
        ids.sort();
        ids.dedup();
        if !ids.is_empty() {
            return Ok(ids);
        }
    }

    // Some providers return a bare array of model objects.
    if let Ok(entries) = serde_json::from_str::<Vec<ModelListEntry>>(body) {
        let mut ids: Vec<String> = entries.into_iter().map(|m| m.id).collect();
        ids.sort();
        ids.dedup();
        if !ids.is_empty() {
            return Ok(ids);
        }
    }

    Err(MeuxError::Llm(
        "Models endpoint returned no recognizable model IDs".to_string(),
    ))
}

impl Default for OpenAiCompatClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_openai_models_envelope() {
        let body = r#"{"object":"list","data":[{"id":"gpt-4o"},{"id":"gpt-4o-mini"}]}"#;
        let ids = parse_models_list_body(body).unwrap();
        assert_eq!(ids, vec!["gpt-4o", "gpt-4o-mini"]);
    }

    #[test]
    fn parses_bare_model_array() {
        let body = r#"[{"id":"llama3.2"},{"id":"llama3"}]"#;
        let ids = parse_models_list_body(body).unwrap();
        assert_eq!(ids, vec!["llama3", "llama3.2"]);
    }
}
