use async_trait::async_trait;
use serde_json::json;
use std::sync::{Arc, RwLock};

use crate::config::types::SearchConfig;
use crate::error::{MeuxeError, Result};

use super::types::*;
use super::Tool;

/// Web search tool that supports DuckDuckGo (free), SerpAPI, and Exa.
pub struct WebSearchTool {
    config: Arc<RwLock<SearchConfig>>,
}

impl Default for WebSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

impl WebSearchTool {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(SearchConfig::default())),
        }
    }

    /// Create with a shared config reference (used by ToolRegistry).
    pub fn with_config(config: Arc<RwLock<SearchConfig>>) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_search".to_string(),
            description: "Search the internet and return a summary of the top results.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let query = arguments["query"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'query' argument".to_string()))?;

        let config = self
            .config
            .read()
            .map_err(|e| MeuxeError::Tool(format!("Config lock error: {e}")))?
            .clone();

        match config.provider.as_str() {
            "serpapi" => {
                let api_key = config
                    .serp_api_key
                    .as_deref()
                    .filter(|k| !k.is_empty())
                    .ok_or_else(|| {
                        MeuxeError::Tool(
                            "SerpAPI key not configured. Go to Settings → Web Search to add it."
                                .to_string(),
                        )
                    })?;
                search_serpapi(query, api_key).await
            }
            "exa" => {
                let api_key = config
                    .exa_api_key
                    .as_deref()
                    .filter(|k| !k.is_empty())
                    .ok_or_else(|| {
                        MeuxeError::Tool(
                            "Exa API key not configured. Go to Settings → Web Search to add it."
                                .to_string(),
                        )
                    })?;
                search_exa(query, api_key).await
            }
            _ => search_duckduckgo(query).await,
        }
    }
}

// ---------------------------------------------------------------------------
// DuckDuckGo (free, no API key)
// ---------------------------------------------------------------------------

async fn search_duckduckgo(query: &str) -> Result<ToolResult> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://html.duckduckgo.com/html/")
        .query(&[("q", query)])
        .header("User-Agent", "Meuxe/1.0")
        .send()
        .await
        .map_err(|e| MeuxeError::Tool(format!("Search request failed: {e}")))?;

    let html = response
        .text()
        .await
        .map_err(|e| MeuxeError::Tool(format!("Failed to read response: {e}")))?;

    let results = parse_ddg_results(&html);

    if results.is_empty() {
        return Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("No results found for: {query}"),
            success: true,
        });
    }

    let mut output = format!("Search results for: {query} (via DuckDuckGo)\n\n");
    for (i, result) in results.iter().enumerate().take(8) {
        output.push_str(&format!(
            "{}. {}\n   {}\n   {}\n\n",
            i + 1,
            result.title,
            result.url,
            result.snippet
        ));
    }

    Ok(ToolResult {
        tool_call_id: String::new(),
        content: output,
        success: true,
    })
}

// ---------------------------------------------------------------------------
// SerpAPI (https://serpapi.com)
// ---------------------------------------------------------------------------

async fn search_serpapi(query: &str, api_key: &str) -> Result<ToolResult> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://serpapi.com/search.json")
        .query(&[
            ("q", query),
            ("api_key", api_key),
            ("engine", "google"),
            ("num", "8"),
        ])
        .send()
        .await
        .map_err(|e| MeuxeError::Tool(format!("SerpAPI request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("SerpAPI error (HTTP {status}): {text}"),
            success: false,
        });
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| MeuxeError::Tool(format!("Failed to parse SerpAPI response: {e}")))?;

    let mut output = format!("Search results for: {query} (via SerpAPI/Google)\n\n");

    // Answer box if available
    if let Some(answer) = json.get("answer_box") {
        if let Some(snippet) = answer.get("snippet").and_then(|s| s.as_str()) {
            output.push_str(&format!("Featured: {snippet}\n\n"));
        } else if let Some(answer_text) = answer.get("answer").and_then(|s| s.as_str()) {
            output.push_str(&format!("Featured: {answer_text}\n\n"));
        }
    }

    // Organic results
    if let Some(results) = json.get("organic_results").and_then(|r| r.as_array()) {
        for (i, result) in results.iter().enumerate().take(8) {
            let title = result.get("title").and_then(|t| t.as_str()).unwrap_or("");
            let link = result.get("link").and_then(|l| l.as_str()).unwrap_or("");
            let snippet = result.get("snippet").and_then(|s| s.as_str()).unwrap_or("");
            output.push_str(&format!(
                "{}. {}\n   {}\n   {}\n\n",
                i + 1,
                title,
                link,
                snippet
            ));
        }
    }

    if output.lines().count() <= 2 {
        output.push_str("No organic results found.\n");
    }

    Ok(ToolResult {
        tool_call_id: String::new(),
        content: output,
        success: true,
    })
}

// ---------------------------------------------------------------------------
// Exa (https://exa.ai)
// ---------------------------------------------------------------------------

async fn search_exa(query: &str, api_key: &str) -> Result<ToolResult> {
    let client = reqwest::Client::new();
    let body = json!({
        "query": query,
        "numResults": 8,
        "type": "neural",
        "contents": {
            "text": {
                "maxCharacters": 500
            }
        }
    });

    let response = client
        .post("https://api.exa.ai/search")
        .header("x-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| MeuxeError::Tool(format!("Exa request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("Exa error (HTTP {status}): {text}"),
            success: false,
        });
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| MeuxeError::Tool(format!("Failed to parse Exa response: {e}")))?;

    let mut output = format!("Search results for: {query} (via Exa)\n\n");

    if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
        for (i, result) in results.iter().enumerate().take(8) {
            let title = result.get("title").and_then(|t| t.as_str()).unwrap_or("");
            let url = result.get("url").and_then(|u| u.as_str()).unwrap_or("");
            let text = result.get("text").and_then(|t| t.as_str()).unwrap_or("");
            output.push_str(&format!(
                "{}. {}\n   {}\n   {}\n\n",
                i + 1,
                title,
                url,
                text
            ));
        }
    }

    if output.lines().count() <= 2 {
        output.push_str("No results found.\n");
    }

    Ok(ToolResult {
        tool_call_id: String::new(),
        content: output,
        success: true,
    })
}

// ---------------------------------------------------------------------------
// DDG HTML parser
// ---------------------------------------------------------------------------

struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

fn parse_ddg_results(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    for block in html.split("class=\"result__body\"") {
        if results.len() >= 8 {
            break;
        }

        let title = extract_between(block, "class=\"result__a\"", "</a>")
            .map(|s| strip_html_tags(&s))
            .unwrap_or_default();

        let url = extract_between(block, "class=\"result__url\"", "</a>")
            .map(|s| strip_html_tags(&s).trim().to_string())
            .unwrap_or_default();

        let snippet = extract_between(block, "class=\"result__snippet\"", "</a>")
            .map(|s| strip_html_tags(&s))
            .unwrap_or_default();

        if !title.is_empty() {
            results.push(SearchResult {
                title,
                url,
                snippet,
            });
        }
    }

    results
}

fn extract_between(html: &str, start_marker: &str, end_marker: &str) -> Option<String> {
    let start = html.find(start_marker)?;
    let after_marker = &html[start + start_marker.len()..];
    let content_start = after_marker.find('>')? + 1;
    let content = &after_marker[content_start..];
    let end = content.find(end_marker)?;
    Some(content[..end].to_string())
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
}
