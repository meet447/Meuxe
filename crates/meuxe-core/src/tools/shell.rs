use async_trait::async_trait;
use serde_json::json;
use std::process::Stdio;
use tokio::process::Command;

use crate::error::{MeuxeError, Result};

use super::types::*;
use super::Tool;

pub struct CommandOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub status_code: Option<i32>,
    pub success: bool,
}

#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn run(&self, command: &str) -> Result<CommandOutput>;
}

pub struct DefaultCommandRunner;

#[async_trait]
impl CommandRunner for DefaultCommandRunner {
    async fn run(&self, command: &str) -> Result<CommandOutput> {
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            Command::new("sh")
                .arg("-c")
                .arg(command)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output(),
        )
        .await
        .map_err(|_| MeuxeError::Tool("Command timed out after 30 seconds".to_string()))?
        .map_err(|e| MeuxeError::Tool(e.to_string()))?;

        Ok(CommandOutput {
            stdout: output.stdout,
            stderr: output.stderr,
            status_code: output.status.code(),
            success: output.status.success(),
        })
    }
}

pub struct RunCommandTool {
    runner: Box<dyn CommandRunner>,
}

impl RunCommandTool {
    pub fn new() -> Self {
        Self {
            runner: Box::new(DefaultCommandRunner),
        }
    }

    pub fn with_runner(runner: Box<dyn CommandRunner>) -> Self {
        Self { runner }
    }
}

impl Default for RunCommandTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for RunCommandTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "run_command".to_string(),
            description:
                "Execute a shell command and return its output (stdout + stderr). Has a 30-second timeout."
                    .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    }
                },
                "required": ["command"]
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let command = arguments["command"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'command' argument".to_string()))?;

        let output = self.runner.run(command).await?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let exit_code = output.status_code.unwrap_or(-1);

        let content = if stderr.is_empty() {
            format!("Exit code: {exit_code}\n\n{stdout}")
        } else {
            format!("Exit code: {exit_code}\n\nStdout:\n{stdout}\n\nStderr:\n{stderr}")
        };

        // Truncate if output is very large
        let content = if content.len() > 50_000 {
            format!(
                "{}\n\n[Output truncated — showing first 50KB]",
                &content[..50_000]
            )
        } else {
            content
        };

        Ok(ToolResult {
            tool_call_id: String::new(),
            content,
            success: output.success,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct MockCommandRunner {
        result: Result<CommandOutput>,
        // We can track the command that was run if we want, but for these tests
        // we just return the mocked result.
    }

    impl MockCommandRunner {
        fn new_success(stdout: &str, stderr: &str, exit_code: i32) -> Self {
            Self {
                result: Ok(CommandOutput {
                    stdout: stdout.as_bytes().to_vec(),
                    stderr: stderr.as_bytes().to_vec(),
                    status_code: Some(exit_code),
                    success: exit_code == 0,
                }),
            }
        }

        fn new_error(error_msg: &str) -> Self {
            Self {
                result: Err(MeuxeError::Tool(error_msg.to_string())),
            }
        }
    }

    #[async_trait]
    impl CommandRunner for MockCommandRunner {
        async fn run(&self, _command: &str) -> Result<CommandOutput> {
            match &self.result {
                Ok(output) => Ok(CommandOutput {
                    stdout: output.stdout.clone(),
                    stderr: output.stderr.clone(),
                    status_code: output.status_code,
                    success: output.success,
                }),
                Err(e) => Err(MeuxeError::Tool(e.to_string())),
            }
        }
    }

    #[test]
    fn test_definition() {
        let tool = RunCommandTool::new();
        let def = tool.definition();
        assert_eq!(def.name, "run_command");
        assert_eq!(def.permission_level, PermissionLevel::Dangerous);
        assert!(def.parameters["properties"].get("command").is_some());
    }

    #[tokio::test]
    async fn test_success_path() {
        let mock_runner = MockCommandRunner::new_success("test output", "", 0);
        let tool = RunCommandTool::with_runner(Box::new(mock_runner));

        let result = tool
            .execute(json!({"command": "echo 'test output'"}))
            .await
            .unwrap();

        assert!(result.success);
        assert_eq!(result.content, "Exit code: 0\n\ntest output");
    }

    #[tokio::test]
    async fn test_missing_command() {
        let tool = RunCommandTool::new();
        let result = tool.execute(json!({})).await;

        assert!(result.is_err());
        if let Err(MeuxeError::Tool(msg)) = result {
            assert_eq!(msg, "Missing 'command' argument");
        } else {
            panic!("Expected MeuxeError::Tool");
        }
    }

    #[tokio::test]
    async fn test_stderr_output() {
        let mock_runner = MockCommandRunner::new_success("out", "err", 1);
        let tool = RunCommandTool::with_runner(Box::new(mock_runner));

        let result = tool.execute(json!({"command": "some_cmd"})).await.unwrap();

        assert!(!result.success);
        assert_eq!(
            result.content,
            "Exit code: 1\n\nStdout:\nout\n\nStderr:\nerr"
        );
    }

    #[tokio::test]
    async fn test_large_output_truncation() {
        let large_stdout = String::from_utf8(vec![b'A'; 60000]).unwrap();
        let mock_runner = MockCommandRunner::new_success(&large_stdout, "", 0);
        let tool = RunCommandTool::with_runner(Box::new(mock_runner));

        let result = tool
            .execute(json!({"command": "large_output_cmd"}))
            .await
            .unwrap();

        assert!(result.success);
        assert!(result
            .content
            .ends_with("\n\n[Output truncated — showing first 50KB]"));
        assert_eq!(
            result.content.len(),
            50000 + "\n\n[Output truncated — showing first 50KB]".len()
        );
    }

    #[tokio::test]
    async fn test_command_timeout_error() {
        let mock_runner = MockCommandRunner::new_error("Command timed out after 30 seconds");
        let tool = RunCommandTool::with_runner(Box::new(mock_runner));

        let result = tool.execute(json!({"command": "sleep 100"})).await;

        assert!(result.is_err());
        if let Err(MeuxeError::Tool(msg)) = result {
            assert_eq!(msg, "Tool error: Command timed out after 30 seconds");
        } else {
            panic!("Expected MeuxeError::Tool");
        }
    }
}
