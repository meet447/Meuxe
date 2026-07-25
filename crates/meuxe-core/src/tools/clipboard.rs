use async_trait::async_trait;
use serde_json::json;
use std::process::Stdio;
use tokio::process::Command;

use crate::error::{MeuxeError, Result};

use super::types::*;
use super::Tool;

// ---------------------------------------------------------------------------
// clipboard_read
// ---------------------------------------------------------------------------

pub struct ClipboardReadTool;

#[async_trait]
impl Tool for ClipboardReadTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "clipboard_read".to_string(),
            description: "Read the current contents of the system clipboard.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, _arguments: serde_json::Value) -> Result<ToolResult> {
        let output = Command::new("pbpaste")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| MeuxeError::Tool(format!("Failed to read clipboard: {e}")))?;

        if output.status.success() {
            let content = String::from_utf8_lossy(&output.stdout).to_string();
            if content.is_empty() {
                Ok(ToolResult {
                    tool_call_id: String::new(),
                    content: "Clipboard is empty.".to_string(),
                    success: true,
                })
            } else {
                // Truncate very large clipboard contents
                let truncated = if content.len() > 50_000 {
                    format!(
                        "{}\n\n[Clipboard truncated — showing first 50KB of {} bytes]",
                        &content[..50_000],
                        content.len()
                    )
                } else {
                    content
                };
                Ok(ToolResult {
                    tool_call_id: String::new(),
                    content: truncated,
                    success: true,
                })
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Failed to read clipboard: {stderr}"),
                success: false,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// clipboard_write
// ---------------------------------------------------------------------------

pub struct ClipboardWriteTool;

#[async_trait]
impl Tool for ClipboardWriteTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "clipboard_write".to_string(),
            description: "Write text to the system clipboard.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "Text to copy to the clipboard"
                    }
                },
                "required": ["content"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let content = arguments["content"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'content' argument".to_string()))?;

        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| MeuxeError::Tool(format!("Failed to write clipboard: {e}")))?;

        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            stdin
                .write_all(content.as_bytes())
                .await
                .map_err(|e| MeuxeError::Tool(format!("Failed to write to pbcopy stdin: {e}")))?;
        }

        let status = child
            .wait()
            .await
            .map_err(|e| MeuxeError::Tool(format!("pbcopy failed: {e}")))?;

        if status.success() {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Copied {} bytes to clipboard.", content.len()),
                success: true,
            })
        } else {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: "Failed to write to clipboard.".to_string(),
                success: false,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_clipboard_read_definition() {
        let tool = ClipboardReadTool;
        let def = tool.definition();

        assert_eq!(def.name, "clipboard_read");
        assert_eq!(def.permission_level, PermissionLevel::Safe);
        assert_eq!(def.parameters["type"], "object");
        assert!(def.parameters["required"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_clipboard_write_definition() {
        let tool = ClipboardWriteTool;
        let def = tool.definition();

        assert_eq!(def.name, "clipboard_write");
        assert_eq!(def.permission_level, PermissionLevel::Cautious);
        assert_eq!(def.parameters["type"], "object");

        let required = def.parameters["required"].as_array().unwrap();
        assert_eq!(required.len(), 1);
        assert_eq!(required[0].as_str().unwrap(), "content");
    }

    #[tokio::test]
    async fn test_clipboard_write_missing_content() {
        let tool = ClipboardWriteTool;
        let args = json!({});

        let result = tool.execute(args).await;
        assert!(result.is_err());
        if let Err(MeuxeError::Tool(msg)) = result {
            assert_eq!(msg, "Missing 'content' argument");
        } else {
            panic!("Expected Tool error with missing content message");
        }
    }
}
