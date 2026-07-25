use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionLevel {
    /// Auto-executed without user confirmation (e.g., read_file, list_directory, web_search)
    Safe,
    /// Executed with a notification to the user (e.g., open_application, take_screenshot)
    Cautious,
    /// Requires explicit user approval before execution (e.g., delete_file, run_command)
    Dangerous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    /// JSON Schema describing the tool's parameters
    pub parameters: serde_json::Value,
    pub permission_level: PermissionLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub content: String,
    pub success: bool,
}
