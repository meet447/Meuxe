pub mod clipboard;
pub mod desktop;
pub mod file_ops;
pub mod shell;
pub mod types;
pub mod web_search;

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use serde_json::json;

use crate::composio::tools::{
    composio_tool_available, refresh_catalog_for, ComposioToolState, ComposioToolStateHandle,
};
use crate::composio::{execute_catalog_entry, ComposioCatalogEntry};
use crate::config::types::SearchConfig;
use crate::error::{MeuxError, Result};

// Re-export core types
pub use types::{PermissionLevel, ToolCallRequest, ToolDefinition, ToolResult};

/// Trait that all tools must implement.
#[async_trait]
pub trait Tool: Send + Sync {
    fn definition(&self) -> ToolDefinition;
    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult>;
}

/// Registry that holds all available tools and dispatches execution.
pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
    search_config: Arc<RwLock<SearchConfig>>,
    composio_state: ComposioToolStateHandle,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            search_config: Arc::new(RwLock::new(SearchConfig::default())),
            composio_state: Arc::new(RwLock::new(ComposioToolState::default())),
        }
    }

    /// Create a registry with all built-in tools registered.
    pub fn with_defaults(base_dir: std::path::PathBuf) -> Self {
        let mut registry = Self::new();
        // File tools
        registry.register(Box::new(file_ops::ReadFileTool));
        registry.register(Box::new(file_ops::WriteFileTool));
        registry.register(Box::new(file_ops::ListDirectoryTool));
        registry.register(Box::new(file_ops::SummarizeFileTool));
        registry.register(Box::new(file_ops::FindFilesTool));
        registry.register(Box::new(file_ops::EditFileTool));
        registry.register(Box::new(file_ops::MoveFileTool));
        registry.register(Box::new(file_ops::DeleteFileTool::new(base_dir)));
        // Shell
        registry.register(Box::new(shell::RunCommandTool::new()));
        // Desktop
        registry.register(Box::new(desktop::OpenApplicationTool));
        registry.register(Box::new(desktop::OpenUrlTool));
        registry.register(Box::new(desktop::OrganizeDesktopTool));
        registry.register(Box::new(desktop::SystemInfoTool));
        // Web — shares the search_config with the registry
        registry.register(Box::new(web_search::WebSearchTool::with_config(
            Arc::clone(&registry.search_config),
        )));
        registry
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        let def = tool.definition();
        self.tools.insert(def.name.clone(), tool);
    }

    /// Fetch Composio tool schemas for connected integrations and cache on state.
    pub async fn refresh_composio_catalog(&self) -> Result<()> {
        let snapshot = self
            .composio_state
            .read()
            .map_err(|e| MeuxError::Tool(e.to_string()))?
            .clone();
        let catalog = refresh_catalog_for(&snapshot).await?;
        let mut slot = self
            .composio_state
            .write()
            .map_err(|e| MeuxError::Tool(e.to_string()))?;
        slot.catalog = catalog;
        Ok(())
    }

    fn composio_catalog_entries(&self) -> Vec<ComposioCatalogEntry> {
        self.composio_state
            .read()
            .ok()
            .map(|state| state.catalog.values().cloned().collect())
            .unwrap_or_default()
    }

    /// Get all tool definitions.
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        let mut defs: Vec<ToolDefinition> = self.tools.values().map(|t| t.definition()).collect();
        for entry in self.composio_catalog_entries() {
            defs.push(entry.to_definition());
        }
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        defs
    }

    /// Format tool definitions as the OpenAI `tools` array for the API request.
    /// Excludes tools listed in `disabled`.
    pub fn openai_tools_json_filtered(&self, disabled: &[String]) -> Vec<serde_json::Value> {
        let composio = self.composio_state.read().ok().map(|state| state.clone());
        self.openai_tools_json_filtered_with_composio(disabled, composio.as_ref())
    }

    pub fn openai_tools_json_filtered_with_composio(
        &self,
        disabled: &[String],
        composio: Option<&ComposioToolState>,
    ) -> Vec<serde_json::Value> {
        let mut out: Vec<serde_json::Value> = self
            .tools
            .values()
            .filter(|tool| {
                let name = tool.definition().name;
                !disabled.contains(&name)
            })
            .map(|tool| {
                let def = tool.definition();
                json!({
                    "type": "function",
                    "function": {
                        "name": def.name,
                        "description": def.description,
                        "parameters": def.parameters,
                    }
                })
            })
            .collect();

        if let Some(state) = composio {
            if state
                .api_key
                .as_ref()
                .is_some_and(|key| !key.trim().is_empty())
            {
                let mut composio_tools: Vec<_> = state.catalog.values().collect();
                composio_tools.sort_by(|a, b| a.llm_name.cmp(&b.llm_name));
                for entry in composio_tools {
                    if disabled.contains(&entry.llm_name) {
                        continue;
                    }
                    if composio_tool_available(&entry.llm_name, state) {
                        out.push(entry.to_openai_json());
                    }
                }
            }
        }

        out
    }

    /// Format all tool definitions (no filtering).
    pub fn openai_tools_json(&self) -> Vec<serde_json::Value> {
        self.openai_tools_json_filtered(&[])
    }

    /// List all tool definitions with name, description, and permission level.
    /// Used by the frontend to render the tools settings page.
    pub fn list_all(&self) -> Vec<ToolDefinition> {
        self.definitions()
    }

    /// Execute a tool call by name.
    pub async fn execute(&self, call: &ToolCallRequest) -> Result<ToolResult> {
        let composio_call = self.composio_state.read().ok().and_then(|guard| {
            let entry = guard.catalog.get(&call.name)?.clone();
            Some((guard.clone(), entry))
        });
        if let Some((state, entry)) = composio_call {
            return execute_catalog_entry(&state, &entry, call.arguments.clone()).await;
        }

        let tool = self
            .tools
            .get(&call.name)
            .ok_or_else(|| MeuxError::Tool(format!("Unknown tool: {}", call.name)))?;

        tool.execute(call.arguments.clone()).await
    }

    /// Get the permission level for a tool by name.
    pub fn permission_level(&self, name: &str) -> Option<PermissionLevel> {
        if let Ok(state) = self.composio_state.read() {
            if let Some(entry) = state.catalog.get(name) {
                return Some(entry.permission_level.clone());
            }
        }
        self.tools
            .get(name)
            .map(|t| t.definition().permission_level)
    }

    /// Update the search provider config (called when settings change).
    pub fn update_search_config(&self, config: SearchConfig) {
        if let Ok(mut cfg) = self.search_config.write() {
            *cfg = config;
        }
    }

    pub fn update_composio_state(&self, state: ComposioToolState) {
        if let Ok(mut slot) = self.composio_state.write() {
            *slot = state;
        }
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
