use async_trait::async_trait;
use serde_json::json;
use std::collections::HashMap;

use crate::error::{MeuxeError, Result};

use super::types::*;
use super::Tool;

// ---------------------------------------------------------------------------
// open_application
// ---------------------------------------------------------------------------

fn is_valid_app_name(name: &str) -> bool {
    let name = name.trim();
    if name.is_empty() || name.starts_with('-') {
        return false;
    }
    // Allow alphanumeric, space, dot, hyphen, underscore
    name.chars()
        .all(|c| c.is_alphanumeric() || c == ' ' || c == '.' || c == '-' || c == '_')
}

pub struct OpenApplicationTool;

#[async_trait]
impl Tool for OpenApplicationTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "open_application".to_string(),
            description: "Open an application by name on the user's computer.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The application name (e.g., 'Safari', 'Visual Studio Code', 'Finder')"
                    }
                },
                "required": ["name"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let name = arguments["name"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'name' argument".to_string()))?;

        if !is_valid_app_name(name) {
            return Err(MeuxeError::Tool(format!(
                "Invalid application name: {name}"
            )));
        }

        let output = tokio::process::Command::new("open")
            .arg("-a")
            .arg(name)
            .output()
            .await
            .map_err(|e| MeuxeError::Tool(e.to_string()))?;

        if output.status.success() {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Opened application: {name}"),
                success: true,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Failed to open {name}: {stderr}"),
                success: false,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// open_url
// ---------------------------------------------------------------------------

pub struct OpenUrlTool;

#[async_trait]
impl Tool for OpenUrlTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "open_url".to_string(),
            description: "Open a URL in the user's default web browser.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to open (e.g., 'https://example.com')"
                    }
                },
                "required": ["url"]
            }),
            permission_level: PermissionLevel::Cautious,
        }
    }

    async fn execute(&self, arguments: serde_json::Value) -> Result<ToolResult> {
        let url = arguments["url"]
            .as_str()
            .ok_or_else(|| MeuxeError::Tool("Missing 'url' argument".to_string()))?;

        let lower_url = url.trim().to_lowercase();
        if !lower_url.starts_with("http://") && !lower_url.starts_with("https://") {
            return Err(MeuxeError::Tool(
                "Invalid URL scheme. Only http:// and https:// are allowed.".to_string(),
            ));
        }

        let output = tokio::process::Command::new("open")
            .arg(url)
            .output()
            .await
            .map_err(|e| MeuxeError::Tool(e.to_string()))?;

        if output.status.success() {
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Opened URL: {url}"),
                success: true,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(ToolResult {
                tool_call_id: String::new(),
                content: format!("Failed to open URL {url}: {stderr}"),
                success: false,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// organize_desktop
// ---------------------------------------------------------------------------

pub struct OrganizeDesktopTool;

#[async_trait]
impl Tool for OrganizeDesktopTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "organize_desktop".to_string(),
            description: "Organize files on the Desktop by moving them into categorized folders (Images, Documents, Videos, Music, Archives, Code, Other)."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            permission_level: PermissionLevel::Dangerous,
        }
    }

    async fn execute(&self, _arguments: serde_json::Value) -> Result<ToolResult> {
        let desktop = dirs::desktop_dir()
            .ok_or_else(|| MeuxeError::Tool("Could not find Desktop directory".to_string()))?;

        Self::organize_directory(&desktop)
    }
}

impl OrganizeDesktopTool {
    pub fn organize_directory(desktop: &std::path::Path) -> Result<ToolResult> {
        let category_map = build_extension_map();
        let mut moved: Vec<String> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        let entries = std::fs::read_dir(desktop).map_err(|e| MeuxeError::Tool(e.to_string()))?;

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    errors.push(e.to_string());
                    continue;
                }
            };

            let path = entry.path();

            // Skip directories and hidden files
            if path.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }

            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let category = category_map.get(ext.as_str()).cloned().unwrap_or("Other");

            let target_dir = desktop.join(category);
            if let Err(e) = std::fs::create_dir_all(&target_dir) {
                errors.push(format!("Failed to create {}: {}", target_dir.display(), e));
                continue;
            }

            let target = target_dir.join(entry.file_name());
            match std::fs::rename(&path, &target) {
                Ok(_) => moved.push(format!(
                    "{} → {}/",
                    entry.file_name().to_string_lossy(),
                    category
                )),
                Err(e) => errors.push(format!(
                    "Failed to move {}: {}",
                    entry.file_name().to_string_lossy(),
                    e
                )),
            }
        }

        let mut result = String::new();
        if !moved.is_empty() {
            result.push_str(&format!("Organized {} files:\n", moved.len()));
            for m in &moved {
                result.push_str(&format!("  {m}\n"));
            }
        } else {
            result.push_str("No files to organize on the Desktop.\n");
        }
        if !errors.is_empty() {
            result.push_str(&format!("\n{} errors:\n", errors.len()));
            for e in &errors {
                result.push_str(&format!("  {e}\n"));
            }
        }

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: result,
            success: errors.is_empty(),
        })
    }
}

fn build_extension_map() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    // Images
    for ext in &[
        "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "heic",
    ] {
        m.insert(*ext, "Images");
    }
    // Documents
    for ext in &[
        "pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", "csv", "md",
        "pages", "numbers", "key",
    ] {
        m.insert(*ext, "Documents");
    }
    // Videos
    for ext in &["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "m4v"] {
        m.insert(*ext, "Videos");
    }
    // Music
    for ext in &["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"] {
        m.insert(*ext, "Music");
    }
    // Archives
    for ext in &["zip", "tar", "gz", "rar", "7z", "dmg", "iso", "bz2", "xz"] {
        m.insert(*ext, "Archives");
    }
    // Code
    for ext in &[
        "rs", "py", "js", "ts", "jsx", "tsx", "html", "css", "json", "yaml", "yml", "toml", "sh",
        "go", "java", "c", "cpp", "h", "swift",
    ] {
        m.insert(*ext, "Code");
    }
    m
}

// ---------------------------------------------------------------------------
// system_info
// ---------------------------------------------------------------------------

pub struct SystemInfoTool;

#[async_trait]
impl Tool for SystemInfoTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "system_info".to_string(),
            description: "Get system information: OS, hostname, CPU, memory usage, disk usage, battery level, uptime, and running processes (top 10 by CPU)."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            permission_level: PermissionLevel::Safe,
        }
    }

    async fn execute(&self, _arguments: serde_json::Value) -> Result<ToolResult> {
        let mut info = String::new();

        // OS & hostname
        if let Ok(output) = tokio::process::Command::new("sw_vers").output().await {
            let sw = String::from_utf8_lossy(&output.stdout);
            info.push_str("=== macOS ===\n");
            info.push_str(&sw);
            info.push('\n');
        }
        if let Ok(output) = tokio::process::Command::new("hostname").output().await {
            let host = String::from_utf8_lossy(&output.stdout).trim().to_string();
            info.push_str(&format!("Hostname: {host}\n\n"));
        }

        // CPU info
        if let Ok(output) = tokio::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .await
        {
            let cpu = String::from_utf8_lossy(&output.stdout).trim().to_string();
            info.push_str(&format!("=== CPU ===\n{cpu}\n\n"));
        }

        // Memory usage
        if let Ok(output) = tokio::process::Command::new("vm_stat").output().await {
            let vm = String::from_utf8_lossy(&output.stdout);
            // Parse page size and free/active/inactive/wired pages
            let page_size: u64 = 16384; // default on Apple Silicon
            let mut free_pages: u64 = 0;
            let mut active_pages: u64 = 0;
            let mut inactive_pages: u64 = 0;
            let mut wired_pages: u64 = 0;

            for line in vm.lines() {
                if let Some(val) = extract_vm_stat_value(line) {
                    if line.contains("free") {
                        free_pages = val;
                    } else if line.contains("active") && !line.contains("inactive") {
                        active_pages = val;
                    } else if line.contains("inactive") {
                        inactive_pages = val;
                    } else if line.contains("wired") {
                        wired_pages = val;
                    }
                }
            }

            let used_gb = (active_pages + wired_pages) as f64 * page_size as f64 / 1_073_741_824.0;
            let free_gb = (free_pages + inactive_pages) as f64 * page_size as f64 / 1_073_741_824.0;
            info.push_str(&format!(
                "=== Memory ===\nUsed: {used_gb:.1} GB\nAvailable: {free_gb:.1} GB\n\n"
            ));
        }

        // Disk usage
        if let Ok(output) = tokio::process::Command::new("df")
            .args(["-h", "/"])
            .output()
            .await
        {
            let df = String::from_utf8_lossy(&output.stdout);
            info.push_str("=== Disk (/) ===\n");
            info.push_str(&df);
            info.push('\n');
        }

        // Battery
        if let Ok(output) = tokio::process::Command::new("pmset")
            .args(["-g", "batt"])
            .output()
            .await
        {
            let batt = String::from_utf8_lossy(&output.stdout);
            // Extract percentage
            if let Some(pct_start) = batt.find('\t') {
                let batt_line = &batt[pct_start..];
                info.push_str(&format!("=== Battery ===\n{}\n\n", batt_line.trim()));
            }
        }

        // Uptime
        if let Ok(output) = tokio::process::Command::new("uptime").output().await {
            let up = String::from_utf8_lossy(&output.stdout).trim().to_string();
            info.push_str(&format!("=== Uptime ===\n{up}\n\n"));
        }

        // Top processes by CPU
        if let Ok(output) = tokio::process::Command::new("ps")
            .args(["aux", "--sort=-%cpu"])
            .output()
            .await
        {
            let ps = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = ps.lines().take(11).collect(); // header + top 10
            info.push_str("=== Top Processes (by CPU) ===\n");
            info.push_str(&lines.join("\n"));
            info.push('\n');
        }

        Ok(ToolResult {
            tool_call_id: String::new(),
            content: if info.is_empty() {
                "Could not retrieve system information.".to_string()
            } else {
                info
            },
            success: true,
        })
    }
}

fn extract_vm_stat_value(line: &str) -> Option<u64> {
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    parts[1].trim().trim_end_matches('.').parse::<u64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use tempfile::tempdir;

    #[test]
    fn test_is_valid_app_name() {
        assert!(is_valid_app_name("Safari"));
        assert!(is_valid_app_name("Visual Studio Code"));
        assert!(is_valid_app_name("iTerm2"));
        assert!(is_valid_app_name("TextEdit.app"));
        assert!(is_valid_app_name("App_Name-1.0"));

        assert!(!is_valid_app_name(""));
        assert!(!is_valid_app_name("-Safari"));
        assert!(!is_valid_app_name("--args"));
        assert!(!is_valid_app_name("Not an app; rm -rf /"));
        assert!(!is_valid_app_name("App|Name"));
        assert!(!is_valid_app_name("App&Name"));
    }

    #[test]
    fn test_organize_directory() {
        let dir = tempdir().unwrap();
        let path = dir.path();

        // Create dummy files matching expected categories
        File::create(path.join("test.png")).unwrap(); // Images
        File::create(path.join("doc.pdf")).unwrap(); // Documents
        File::create(path.join("video.mp4")).unwrap(); // Videos
        File::create(path.join("song.mp3")).unwrap(); // Music
        File::create(path.join("archive.zip")).unwrap(); // Archives
        File::create(path.join("script.rs")).unwrap(); // Code
        File::create(path.join("unknown.xyz")).unwrap(); // Other

        // Edge cases
        File::create(path.join(".hidden.txt")).unwrap(); // Hidden file
        fs::create_dir(path.join("subfolder")).unwrap(); // Sub-directory

        // Organize the temporary directory
        let result = OrganizeDesktopTool::organize_directory(path).unwrap();
        assert!(result.success);

        // Verify categories
        assert!(path.join("Images/test.png").exists());
        assert!(path.join("Documents/doc.pdf").exists());
        assert!(path.join("Videos/video.mp4").exists());
        assert!(path.join("Music/song.mp3").exists());
        assert!(path.join("Archives/archive.zip").exists());
        assert!(path.join("Code/script.rs").exists());
        assert!(path.join("Other/unknown.xyz").exists());

        // Verify edge cases are ignored and still in the root of temp dir
        assert!(path.join(".hidden.txt").exists());
        assert!(path.join("subfolder").is_dir());

        // Verify original files are gone from the root of temp dir
        assert!(!path.join("test.png").exists());
        assert!(!path.join("doc.pdf").exists());
        assert!(!path.join("video.mp4").exists());
    }
}
