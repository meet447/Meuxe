use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::process::Command as AsyncCommand;
use tokio::time::timeout;

const NPM_INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize)]
pub struct AcpPrerequisitesStatus {
    pub node_available: bool,
    pub npx_available: bool,
    pub node_version: Option<String>,
    pub npx_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentPresetSetupStatus {
    pub preset: String,
    pub ready: bool,
    pub managed_install: bool,
    pub system_path: bool,
    pub needs_node: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSetupStatusResponse {
    pub prerequisites: AcpPrerequisitesStatus,
    pub agent: AgentPresetSetupStatus,
}

pub fn managed_npm_prefix(data_dir: &Path) -> PathBuf {
    data_dir.join("agents/npm")
}

pub fn managed_npm_bin_dir(data_dir: &Path) -> PathBuf {
    managed_npm_prefix(data_dir).join("bin")
}

fn trim_version(stdout: &[u8]) -> Option<String> {
    let s = String::from_utf8_lossy(stdout);
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.lines().next()?.trim().to_string())
    }
}

async fn command_ok(program: &str, args: &[&str]) -> bool {
    AsyncCommand::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

async fn command_version(program: &str) -> Option<String> {
    let output = AsyncCommand::new(program)
        .arg("--version")
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    trim_version(&output.stdout)
}

pub async fn check_prerequisites() -> AcpPrerequisitesStatus {
    let node_available = command_ok("node", &["--version"]).await;
    let npx_available = command_ok("npx", &["--version"]).await;
    let node_version = if node_available {
        command_version("node").await
    } else {
        None
    };
    let npx_version = if npx_available {
        command_version("npx").await
    } else {
        None
    };
    AcpPrerequisitesStatus {
        node_available,
        npx_available,
        node_version,
        npx_version,
    }
}

fn managed_bin(data_dir: &Path, name: &str) -> PathBuf {
    managed_npm_bin_dir(data_dir).join(name)
}

pub async fn check_preset(data_dir: &Path, preset: &str) -> AgentPresetSetupStatus {
    let prerequisites = check_prerequisites().await;

    match preset {
        "opencode" => {
            let managed = managed_bin(data_dir, "opencode");
            let managed_install = managed.is_file();
            let system_path = command_ok("opencode", &["--version"]).await;
            let ready = managed_install || system_path;
            let needs_node = !managed_install && !prerequisites.node_available;
            let detail = if ready {
                if managed_install {
                    "OpenCode is installed for Meuxe.".into()
                } else {
                    "OpenCode found on your PATH.".into()
                }
            } else if needs_node {
                "Install Node.js, then use Install to add OpenCode.".into()
            } else {
                "OpenCode not found. Use Install to set it up.".into()
            };
            AgentPresetSetupStatus {
                preset: preset.to_string(),
                ready,
                managed_install,
                system_path,
                needs_node,
                detail,
            }
        }
        "claude" => {
            let managed = managed_bin(data_dir, "claude-agent-acp");
            let managed_install = managed.is_file();
            let system_path = prerequisites.npx_available;
            let ready = managed_install || system_path;
            let needs_node = !prerequisites.node_available;
            let detail = if ready {
                if managed_install {
                    "Claude ACP adapter installed for Meuxe.".into()
                } else {
                    "Node/npx available — adapter will run via npx on first chat.".into()
                }
            } else if needs_node {
                "Install Node.js (includes npx), then install the Claude adapter.".into()
            } else {
                "Install the Claude ACP adapter.".into()
            };
            AgentPresetSetupStatus {
                preset: preset.to_string(),
                ready,
                managed_install,
                system_path,
                needs_node,
                detail,
            }
        }
        "codex" => {
            let managed = managed_bin(data_dir, "codex-acp");
            let managed_install = managed.is_file();
            let system_path = prerequisites.npx_available;
            let ready = managed_install || system_path;
            let needs_node = !prerequisites.node_available;
            let detail = if ready {
                if managed_install {
                    "Codex ACP adapter installed for Meuxe.".into()
                } else {
                    "Node/npx available — adapter will run via npx on first chat.".into()
                }
            } else if needs_node {
                "Install Node.js (includes npx), then install the Codex adapter.".into()
            } else {
                "Install the Codex ACP adapter.".into()
            };
            AgentPresetSetupStatus {
                preset: preset.to_string(),
                ready,
                managed_install,
                system_path,
                needs_node,
                detail,
            }
        }
        "custom" => AgentPresetSetupStatus {
            preset: preset.to_string(),
            ready: true,
            managed_install: false,
            system_path: false,
            needs_node: false,
            detail: "You will provide the agent command.".into(),
        },
        other => AgentPresetSetupStatus {
            preset: other.to_string(),
            ready: false,
            managed_install: false,
            system_path: false,
            needs_node: false,
            detail: format!("Unknown preset: {other}"),
        },
    }
}

async fn run_npm_install(prefix: &Path, package: &str) -> Result<(), String> {
    let prefix_str = prefix.to_string_lossy().to_string();
    let mut child = AsyncCommand::new("npm")
        .args([
            "install",
            "--no-audit",
            "--no-fund",
            "--prefix",
            &prefix_str,
            package,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run npm: {e}"))?;

    let wait = child.wait_with_output();
    let output = timeout(NPM_INSTALL_TIMEOUT, wait)
        .await
        .map_err(|_| "npm install timed out (5 minutes)".to_string())?
        .map_err(|e| format!("npm install failed: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "npm install failed: {}",
            if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            }
        ))
    }
}

pub async fn install_preset(data_dir: &Path, preset: &str) -> Result<AgentSetupStatusResponse, String> {
    let prerequisites = check_prerequisites().await;
    if !prerequisites.node_available {
        return Err(
            "Node.js is required. Install it from https://nodejs.org (LTS), then try again."
                .into(),
        );
    }

    let prefix = managed_npm_prefix(data_dir);
    std::fs::create_dir_all(&prefix).map_err(|e| e.to_string())?;

    let package = match preset {
        "opencode" => "opencode-ai",
        "claude" => "@agentclientprotocol/claude-agent-acp",
        "codex" => "@agentclientprotocol/codex-acp",
        "custom" => return Err("Nothing to install for a custom agent.".into()),
        other => return Err(format!("Unknown preset: {other}")),
    };

    run_npm_install(&prefix, package).await?;

    let agent = check_preset(data_dir, preset).await;
    if !agent.ready {
        return Err(format!(
            "Install finished but the agent is still not ready: {}",
            agent.detail
        ));
    }

    Ok(AgentSetupStatusResponse {
        prerequisites,
        agent,
    })
}

pub async fn full_status(data_dir: &Path, preset: &str) -> AgentSetupStatusResponse {
    let prerequisites = check_prerequisites().await;
    let agent = check_preset(data_dir, preset).await;
    AgentSetupStatusResponse {
        prerequisites,
        agent,
    }
}

#[tauri::command]
pub async fn agent_setup_status(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    preset: String,
) -> Result<AgentSetupStatusResponse, String> {
    Ok(full_status(&state.data_dir, &preset).await)
}

#[tauri::command]
pub async fn agent_setup_install(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    preset: String,
) -> Result<AgentSetupStatusResponse, String> {
    install_preset(&state.data_dir, &preset).await
}
