use async_trait::async_trait;
use serde_json::json;
use std::path::Path;

use crate::error::{MeuxeError, Result};

use super::types::*;
use super::Tool;

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

pub struct ReadFileTool;

#[async_trait]
impl Tool for ReadFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "read_file".to_string(),
            description:
                "Read the contents of a file. Returns the text content. Limited to ~100KB."
                    .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute or relative path to the file to read"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let path = Path::new(&expanded);

        if !path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("File not found: {}", path.display()),
                success: false,
            });
        }

        let metadata = std::fs::metadata(path).map_err(|e| MeuxeError::Tool(e.to_string()))?;
        if metadata.len() > 100_000 {
            // Read first 100KB
            let content =
                std::fs::read_to_string(path).map_err(|e| MeuxeError::Tool(e.to_string()))?;
            let truncated: String = content.chars().take(100_000).collect();
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!(
                    "{}\n\n[File truncated — showing first 100KB of {}]",
                    truncated,
                    metadata.len()
                ),
                success: true,
            });
        }

        let content = std::fs::read_to_string(path).map_err(|e| MeuxeError::Tool(e.to_string()))?;
        Ok(ToolResult {
            tool_call_id: String::new(),
            content,
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// list_directory
// ---------------------------------------------------------------------------

pub struct ListDirectoryTool;

#[async_trait]
impl Tool for ListDirectoryTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "list_directory".to_string(),
            description: "List files and directories at a given path. Returns names with type indicators (/ for dirs)."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path to list"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let dir = Path::new(&expanded);

        if !dir.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Directory not found: {}", dir.display()),
                success: false,
            });
        }

        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(dir).map_err(|e| MeuxeError::Tool(e.to_string()))?;

        for entry in read_dir {
            let entry = entry.map_err(|e| MeuxeError::Tool(e.to_string()))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let file_type = entry
                .file_type()
                .map_err(|e| MeuxeError::Tool(e.to_string()))?;
            if file_type.is_dir() {
                entries.push(format!("{name}/"));
            } else {
                entries.push(name);
            }
        }

        entries.sort();
        Ok(ToolResult {
            tool_call_id: String::new(),
            content: entries.join("\n"),
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// summarize_file
// ---------------------------------------------------------------------------

pub struct SummarizeFileTool;

#[async_trait]
impl Tool for SummarizeFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "summarize_file".to_string(),
            description: "Read a file and return its content for summarization. The content is truncated to fit context. Use this when the user asks you to summarize a document."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to summarize"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let path = Path::new(&expanded);

        if !path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("File not found: {}", path.display()),
                success: false,
            });
        }

        let content = std::fs::read_to_string(path).map_err(|e| MeuxeError::Tool(e.to_string()))?;
        // Truncate to ~50K chars to leave room for LLM to summarize
        let truncated: String = content.chars().take(50_000).collect();
        let was_truncated = content.len() > 50_000;

        let result = if was_truncated {
            format!(
                "File: {}\nSize: {} bytes (truncated to first 50K chars)\n\n---\n{}",
                path.display(),
                content.len(),
                truncated
            )
        } else {
            format!(
                "File: {}\nSize: {} bytes\n\n---\n{}",
                path.display(),
                content.len(),
                truncated
            )
        };

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: result,
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

pub struct WriteFileTool;

#[async_trait]
impl Tool for WriteFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "write_file".to_string(),
            description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Parent directories are created automatically."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'path' argument".to_string()))?;
        let content = arguments["content"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'content' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let file_path = Path::new(&expanded);

        // Create parent directories if needed
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| MeuxeError::Tool(e.to_string()))?;
        }

        std::fs::write(file_path, content).map_err(|e| MeuxeError::Tool(e.to_string()))?;

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("Written {} bytes to {}", content.len(), file_path.display()),
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// find_files
// ---------------------------------------------------------------------------

pub struct FindFilesTool;

#[async_trait]
impl Tool for FindFilesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "find_files".to_string(),
            description: "Recursively search for files matching a name pattern within a directory. Returns up to 50 matching file paths."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "Directory to search in (e.g., '~', '~/Documents')"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "File name pattern to search for (case-insensitive substring match, e.g., 'report', '.pdf', 'todo.txt')"
                    }
                },
                "required": ["directory", "pattern"]
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let directory = arguments["directory"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'directory' argument".to_string()))?;
        let pattern = arguments["pattern"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'pattern' argument".to_string()))?;

        let expanded = shellexpand::tilde(directory).to_string();
        let dir = Path::new(&expanded);

        if !dir.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Directory not found: {}", dir.display()),
                success: false,
            });
        }

        let pattern_lower = pattern.to_lowercase();
        let mut matches = Vec::new();
        find_recursive(dir, &pattern_lower, &mut matches, 50, 5);

        if matches.is_empty() {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("No files matching '{}' found in {}", pattern, dir.display()),
                success: true,
            })
        } else {
            let count = matches.len();
            let result = matches.join("\n");
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Found {count} file(s):\n{result}"),
                success: true,
            })
        }
    }
}

fn find_recursive(
    dir: &Path,
    pattern: &str,
    results: &mut Vec<String>,
    max: usize,
    max_depth: usize,
) {
    if results.len() >= max || max_depth == 0 {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // Skip directories we can't read (permissions)
    };

    for entry in entries {
        if results.len() >= max {
            return;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden directories to avoid crawling .git, .cache, etc.
        if name.starts_with('.') {
            continue;
        }

        let path = entry.path();

        if name.to_lowercase().contains(pattern) {
            results.push(path.to_string_lossy().to_string());
        }

        if path.is_dir() {
            find_recursive(&path, pattern, results, max, max_depth - 1);
        }
    }
}

// ---------------------------------------------------------------------------
// edit_file
// ---------------------------------------------------------------------------

pub struct EditFileTool;

#[async_trait]
impl Tool for EditFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "edit_file".to_string(),
            description: "Edit a file by finding and replacing a specific string. Use this for surgical edits instead of rewriting the entire file."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to edit"
                    },
                    "find": {
                        "type": "string",
                        "description": "The exact text to find in the file"
                    },
                    "replace": {
                        "type": "string",
                        "description": "The text to replace it with"
                    },
                    "all": {
                        "type": "boolean",
                        "description": "If true, replace all occurrences. If false (default), replace only the first."
                    }
                },
                "required": ["path", "find", "replace"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'path' argument".to_string()))?;
        let find = arguments["find"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'find' argument".to_string()))?;
        let replace = arguments["replace"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'replace' argument".to_string()))?;
        let replace_all = arguments["all"].as_bool().unwrap_or(false);

        let expanded = shellexpand::tilde(path).to_string();
        let file_path = Path::new(&expanded);

        if !file_path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("File not found: {}", file_path.display()),
                success: false,
            });
        }

        let content =
            std::fs::read_to_string(file_path).map_err(|e| MeuxeError::Tool(e.to_string()))?;

        if !content.contains(find) {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Text to find not found in {}", file_path.display()),
                success: false,
            });
        }

        let (new_content, count) = if replace_all {
            let count = content.matches(find).count();
            (content.replace(find, replace), count)
        } else {
            (content.replacen(find, replace, 1), 1)
        };

        std::fs::write(file_path, &new_content).map_err(|e| MeuxeError::Tool(e.to_string()))?;

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!(
                "Edited {}: replaced {} occurrence(s)",
                file_path.display(),
                count
            ),
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// move_file
// ---------------------------------------------------------------------------

pub struct MoveFileTool;

#[async_trait]
impl Tool for MoveFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "move_file".to_string(),
            description: "Move or rename a file or directory from one path to another.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "Source path"
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination path"
                    }
                },
                "required": ["source", "destination"]
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let source = arguments["source"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'source' argument".to_string()))?;
        let destination = arguments["destination"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'destination' argument".to_string()))?;

        let src = shellexpand::tilde(source).to_string();
        let dst = shellexpand::tilde(destination).to_string();

        std::fs::rename(&src, &dst).map_err(|e| MeuxeError::Tool(e.to_string()))?;

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("Moved {src} → {dst}"),
            success: true,
        })
    }
}

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

use std::path::PathBuf;

pub struct DeleteFileTool {
    base_dir: PathBuf,
}

impl DeleteFileTool {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }
}

#[async_trait]
impl Tool for DeleteFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "delete_file".to_string(),
            description: "Delete a file or empty directory. Use with caution.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to delete"
                    }
                },
                "required": ["path"]
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'path' argument".to_string()))?;

        let expanded = shellexpand::tilde(path).to_string();
        let path = Path::new(&expanded);

        if !path.exists() {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Path not found: {}", path.display()),
                success: false,
            });
        }

        // Security fix: Path Traversal Prevention
        // Canonicalize both the requested path and the base directory to resolve any ".." or symlinks.
        let canonical_path = path
            .canonicalize()
            .map_err(|e| MeuxeError::Tool(format!("Failed to canonicalize path: {e}")))?;

        let canonical_base = if self.base_dir.exists() {
            self.base_dir
                .canonicalize()
                .map_err(|e| MeuxeError::Tool(format!("Failed to canonicalize base_dir: {e}")))?
        } else {
            self.base_dir.clone() // Fallback if base_dir doesn't exist (though it should)
        };

        if !canonical_path.starts_with(&canonical_base) {
            return Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!(
                    "Access denied: Path {} is outside the allowed directory.",
                    path.display()
                ),
                success: false,
            });
        }

        if path.is_dir() {
            std::fs::remove_dir(path).map_err(|e| MeuxeError::Tool(e.to_string()))?;
        } else {
            std::fs::remove_file(path).map_err(|e| MeuxeError::Tool(e.to_string()))?;
        }

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: format!("Deleted: {}", path.display()),
            success: true,
        })
    }
}
