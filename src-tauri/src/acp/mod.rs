//! Agent Client Protocol (ACP) integration — companion shell as ACP *client*.
//!
//! See `docs/DIRECTION.md` and `docs/ROADMAP.md`. Phase 2 will spawn the user's
//! CLI agent (Claude Code, Codex, etc.) and bridge session events to the React UI.

#[derive(Debug, Clone)]
pub struct AgentLaunchConfig {
    pub program: String,
    pub args: Vec<String>,
    pub working_directory: String,
}

/// Placeholder until Phase 2 implements JSON-RPC over stdio.
pub fn default_launch_config(home_dir: &std::path::Path) -> AgentLaunchConfig {
    AgentLaunchConfig {
        program: "echo".to_string(),
        args: vec!["meuxe-acp-not-configured".to_string()],
        working_directory: home_dir.to_string_lossy().to_string(),
    }
}
