use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::process::Command as AsyncCommand;
use tokio::time::timeout;

const NPM_INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentInstallSource {
    System,
    Npx,
    None,
}

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
    /// Legacy field kept for frontend compatibility; always false (installs are global now).
    pub managed_install: bool,
    /// A CLI was found on the user/system PATH (or standard global locations).
    pub system_path: bool,
    pub needs_node: bool,
    pub detail: String,
    pub install_source: AgentInstallSource,
    pub system_command: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSetupStatusResponse {
    pub prerequisites: AcpPrerequisitesStatus,
    pub agent: AgentPresetSetupStatus,
}

/// Program name on PATH for each preset (system / global install).
pub fn preset_system_binary_name(preset: &str) -> Option<&'static str> {
    match preset {
        "opencode" => Some("opencode"),
        "claude" => Some("claude-agent-acp"),
        "codex" => Some("codex-acp"),
        _ => None,
    }
}

fn candidate_filenames(program: &str) -> Vec<String> {
    let names = vec![program.to_string()];
    #[cfg(windows)]
    {
        for ext in [".exe", ".cmd", ".bat"] {
            names.push(format!("{program}{ext}"));
        }
    }
    names
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = path.metadata() {
            return meta.permissions().mode() & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Extra directories where global npm / user CLIs commonly live (before scanning PATH).
fn global_cli_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
        dirs.push(PathBuf::from(prefix).join("bin"));
    }
    if let Ok(home) = std::env::var("HOME") {
        let home = PathBuf::from(home);
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".npm-global").join("bin"));
        dirs.push(home.join("bin"));
    }
    #[cfg(windows)]
    if let Ok(appdata) = std::env::var("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs
}

/// Find an executable in the given search directories.
pub fn find_executable_in_dirs(program: &str, search_dirs: &[PathBuf]) -> Option<PathBuf> {
    for dir in search_dirs {
        for name in candidate_filenames(program) {
            let candidate = dir.join(&name);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// Find an executable on PATH and common global install locations.
pub fn find_executable_on_path(program: &str) -> Option<PathBuf> {
    let mut search_dirs: Vec<PathBuf> = global_cli_search_dirs();
    if let Some(path_var) = std::env::var_os("PATH") {
        search_dirs.extend(std::env::split_paths(&path_var));
    }
    find_executable_in_dirs(program, &search_dirs)
}

pub fn resolve_system_bin(preset: &str) -> Option<PathBuf> {
    let name = preset_system_binary_name(preset)?;
    find_executable_on_path(name)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentResolution {
    pub source: AgentInstallSource,
    pub executable: Option<PathBuf>,
}

/// Global system install first, then npx (Claude/Codex only).
pub async fn resolve_agent(_data_dir: &Path, preset: &str) -> AgentResolution {
    if let Some(system) = resolve_system_bin(preset) {
        return AgentResolution {
            source: AgentInstallSource::System,
            executable: Some(system),
        };
    }

    let prerequisites = check_prerequisites().await;

    match preset {
        "claude" | "codex" if prerequisites.npx_available => AgentResolution {
            source: AgentInstallSource::Npx,
            executable: None,
        },
        _ => AgentResolution {
            source: AgentInstallSource::None,
            executable: None,
        },
    }
}

/// argv for spawning the agent (system install or bare name on PATH).
pub async fn resolve_opencode_argv(data_dir: &Path) -> Vec<String> {
    let resolution = resolve_agent(data_dir, "opencode").await;
    match resolution.executable {
        Some(path) => vec![path.to_string_lossy().into_owned(), "acp".into()],
        None => vec!["opencode".into(), "acp".into()],
    }
}

pub async fn resolve_claude_argv(data_dir: &Path) -> Option<Vec<String>> {
    let resolution = resolve_agent(data_dir, "claude").await;
    resolution
        .executable
        .map(|p| vec![p.to_string_lossy().into_owned()])
}

pub async fn resolve_codex_argv(data_dir: &Path) -> Option<Vec<String>> {
    let resolution = resolve_agent(data_dir, "codex").await;
    resolution
        .executable
        .map(|p| vec![p.to_string_lossy().into_owned()])
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
    let node_version = command_version("node").await;
    let npx_version = command_version("npx").await;
    AcpPrerequisitesStatus {
        node_available: node_version.is_some(),
        npx_available: npx_version.is_some(),
        node_version,
        npx_version,
    }
}

fn status_from_resolution(preset: &str, resolution: AgentResolution) -> AgentPresetSetupStatus {
    let system_path = resolution.source == AgentInstallSource::System;
    let ready = resolution.source != AgentInstallSource::None;
    let system_command = resolution
        .executable
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned());

    let (needs_node, detail) = match preset {
        "opencode" => {
            let needs_node = resolution.source == AgentInstallSource::None;
            let detail = match resolution.source {
                AgentInstallSource::System => format!(
                    "Using OpenCode on your system: {}",
                    system_command.clone().unwrap_or_else(|| "opencode".into())
                ),
                AgentInstallSource::None => {
                    "Install OpenCode globally (e.g. npm i -g opencode-ai) or use Install in settings.".into()
                }
                AgentInstallSource::Npx => unreachable!(),
            };
            (needs_node, detail)
        }
        "claude" => {
            let needs_node = resolution.source == AgentInstallSource::None;
            let detail = match resolution.source {
                AgentInstallSource::System => format!(
                    "Using Claude ACP adapter on your system: {}",
                    system_command.clone().unwrap_or_default()
                ),
                AgentInstallSource::Npx => {
                    "No global adapter found — will run via npx on chat (install globally for a fixed version).".into()
                }
                AgentInstallSource::None => {
                    "Install Node.js, then npm i -g @agentclientprotocol/claude-agent-acp (or use Install in settings).".into()
                }
            };
            (needs_node, detail)
        }
        "codex" => {
            let needs_node = resolution.source == AgentInstallSource::None;
            let detail = match resolution.source {
                AgentInstallSource::System => format!(
                    "Using Codex ACP adapter on your system: {}",
                    system_command.clone().unwrap_or_default()
                ),
                AgentInstallSource::Npx => {
                    "No global adapter found — will run via npx on chat (install globally for a fixed version).".into()
                }
                AgentInstallSource::None => {
                    "Install Node.js, then npm i -g @agentclientprotocol/codex-acp (or use Install in settings).".into()
                }
            };
            (needs_node, detail)
        }
        _ => (false, String::new()),
    };

    AgentPresetSetupStatus {
        preset: preset.to_string(),
        ready,
        managed_install: false,
        system_path,
        needs_node,
        detail,
        install_source: resolution.source,
        system_command,
    }
}

pub async fn check_preset(data_dir: &Path, preset: &str) -> AgentPresetSetupStatus {
    match preset {
        "opencode" | "claude" | "codex" => {
            let resolution = resolve_agent(data_dir, preset).await;
            status_from_resolution(preset, resolution)
        }
        "custom" => AgentPresetSetupStatus {
            preset: preset.to_string(),
            ready: true,
            managed_install: false,
            system_path: false,
            needs_node: false,
            detail: "You will provide the agent command.".into(),
            install_source: AgentInstallSource::None,
            system_command: None,
        },
        other => AgentPresetSetupStatus {
            preset: other.to_string(),
            ready: false,
            managed_install: false,
            system_path: false,
            needs_node: false,
            detail: format!("Unknown preset: {other}"),
            install_source: AgentInstallSource::None,
            system_command: None,
        },
    }
}

async fn run_npm_global_install(package: &str) -> Result<(), String> {
    let child = AsyncCommand::new("npm")
        .args(["install", "-g", "--no-audit", "--no-fund", package])
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
            "npm install -g failed: {}",
            if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            }
        ))
    }
}

fn preset_npm_package(preset: &str) -> Result<&'static str, String> {
    match preset {
        "opencode" => Ok("opencode-ai"),
        "claude" => Ok("@agentclientprotocol/claude-agent-acp"),
        "codex" => Ok("@agentclientprotocol/codex-acp"),
        "custom" => Err("Nothing to install for a custom agent.".into()),
        other => Err(format!("Unknown preset: {other}")),
    }
}

/// Install the preset's npm package with `npm install -g` (user-global, same as terminal).
pub async fn install_global_package(preset: &str) -> Result<(), String> {
    let prerequisites = check_prerequisites().await;
    if !prerequisites.node_available {
        return Err(
            "Node.js is required. Install it from https://nodejs.org (LTS), then try again.".into(),
        );
    }
    let package = preset_npm_package(preset)?;
    run_npm_global_install(package).await
}

pub async fn install_preset(
    data_dir: &Path,
    preset: &str,
) -> Result<AgentSetupStatusResponse, String> {
    install_global_package(preset).await?;

    let prerequisites = check_prerequisites().await;
    let agent = check_preset(data_dir, preset).await;
    if !agent.ready {
        return Err(format!(
            "Global install finished but the agent is still not ready: {}",
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn find_executable_in_dirs_discovers_file() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("meuxe-test-cli");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let found = find_executable_in_dirs("meuxe-test-cli", &[tmp.path().to_path_buf()]);
        assert_eq!(found, Some(bin));
    }

    #[test]
    fn resolve_system_bin_finds_executable_in_search_dirs() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("opencode");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let found = find_executable_in_dirs("opencode", &[tmp.path().to_path_buf()]);
        assert!(found.is_some());
    }
}
