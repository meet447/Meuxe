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
    Managed,
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
    /// Meuxe app-data npm prefix install exists.
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

pub fn managed_npm_prefix(data_dir: &Path) -> PathBuf {
    data_dir.join("agents/npm")
}

pub fn managed_npm_bin_dir(data_dir: &Path) -> PathBuf {
    managed_npm_prefix(data_dir).join("bin")
}

pub fn managed_npm_modules_bin_dir(data_dir: &Path) -> PathBuf {
    managed_npm_prefix(data_dir)
        .join("node_modules")
        .join(".bin")
}

/// Resolves a CLI shim from our managed npm prefix (`bin/` for global installs, or legacy `node_modules/.bin/`).
pub fn resolve_managed_bin(data_dir: &Path, name: &str) -> Option<PathBuf> {
    let candidates = [
        managed_npm_bin_dir(data_dir).join(name),
        managed_npm_modules_bin_dir(data_dir).join(name),
    ];
    candidates.into_iter().find(|p| is_executable_file(p))
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

/// Find an executable on PATH and common global install locations.
pub fn find_executable_on_path(program: &str) -> Option<PathBuf> {
    let mut search_dirs: Vec<PathBuf> = global_cli_search_dirs();
    if let Some(path_var) = std::env::var_os("PATH") {
        search_dirs.extend(std::env::split_paths(&path_var));
    }

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

pub fn resolve_system_bin(preset: &str) -> Option<PathBuf> {
    let name = preset_system_binary_name(preset)?;
    find_executable_on_path(name)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentResolution {
    pub source: AgentInstallSource,
    pub executable: Option<PathBuf>,
}

/// Global system install first, then Meuxe-managed fallback, then npx (Claude/Codex only).
pub async fn resolve_agent(data_dir: &Path, preset: &str) -> AgentResolution {
    let prerequisites = check_prerequisites().await;

    if let Some(system) = resolve_system_bin(preset) {
        return AgentResolution {
            source: AgentInstallSource::System,
            executable: Some(system),
        };
    }

    if let Some(name) = preset_system_binary_name(preset) {
        if let Some(managed) = resolve_managed_bin(data_dir, name) {
            return AgentResolution {
                source: AgentInstallSource::Managed,
                executable: Some(managed),
            };
        }
    }

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

/// argv for spawning the agent (system → managed → bare name on PATH).
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

fn status_from_resolution(preset: &str, resolution: AgentResolution) -> AgentPresetSetupStatus {
    let managed_install = resolution.source == AgentInstallSource::Managed;
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
                AgentInstallSource::Managed => {
                    "Using OpenCode from Meuxe app folder (local fallback).".into()
                }
                AgentInstallSource::None => {
                    "Install OpenCode globally (e.g. npm i -g opencode-ai) or use the local fallback installer.".into()
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
                AgentInstallSource::Managed => {
                    "Using Claude ACP adapter from Meuxe app folder (local fallback).".into()
                }
                AgentInstallSource::Npx => {
                    "No global adapter found — will run via npx on chat (install globally for a fixed version).".into()
                }
                AgentInstallSource::None => {
                    "Install Node.js, then npm i -g @agentclientprotocol/claude-agent-acp or use the local fallback.".into()
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
                AgentInstallSource::Managed => {
                    "Using Codex ACP adapter from Meuxe app folder (local fallback).".into()
                }
                AgentInstallSource::Npx => {
                    "No global adapter found — will run via npx on chat (install globally for a fixed version).".into()
                }
                AgentInstallSource::None => {
                    "Install Node.js, then npm i -g @agentclientprotocol/codex-acp or use the local fallback.".into()
                }
            };
            (needs_node, detail)
        }
        _ => (false, String::new()),
    };

    AgentPresetSetupStatus {
        preset: preset.to_string(),
        ready,
        managed_install,
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

async fn run_npm_install(prefix: &Path, package: &str) -> Result<(), String> {
    let prefix_str = prefix.to_string_lossy().to_string();
    let child = AsyncCommand::new("npm")
        .args([
            "install",
            "--global",
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

pub async fn install_preset(
    data_dir: &Path,
    preset: &str,
) -> Result<AgentSetupStatusResponse, String> {
    let prerequisites = check_prerequisites().await;
    if !prerequisites.node_available {
        return Err(
            "Node.js is required for the local fallback install. Install it from https://nodejs.org (LTS), or install the agent globally via npm.".into(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn find_executable_on_path_discovers_file() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("meuxe-test-cli");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let original = std::env::var_os("PATH").unwrap();
        let new_path = format!("{}:{}", tmp.path().display(), original.to_string_lossy());
        std::env::set_var("PATH", new_path);

        let found = find_executable_on_path("meuxe-test-cli");
        assert_eq!(found, Some(bin));
    }

    #[test]
    fn resolution_prefers_system_over_managed() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().join("data");
        let managed_bin = managed_npm_bin_dir(&data_dir);
        fs::create_dir_all(&managed_bin).unwrap();
        let managed = managed_bin.join("opencode");
        fs::write(&managed, b"").unwrap();

        let system_tmp = TempDir::new().unwrap();
        let system_bin = system_tmp.path().join("opencode");
        fs::write(&system_bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&system_bin, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let original = std::env::var_os("PATH").unwrap();
        std::env::set_var(
            "PATH",
            format!(
                "{}:{}",
                system_tmp.path().display(),
                original.to_string_lossy()
            ),
        );

        let system = resolve_system_bin("opencode");
        assert!(system.is_some());
        assert_ne!(system.unwrap(), managed);
    }
}
