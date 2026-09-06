use std::path::Path;
use std::sync::Arc;

use agent_client_protocol::schema::v1::{
    PermissionOption, PermissionOptionId, PermissionOptionKind,
};
use agent_client_protocol::AcpAgent;
use meuxe_core::config::types::AgentConfig;
use meuxe_core::memory::MemorySnapshot;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

use crate::acp::manager::dispatch_turn;
use crate::AppState;

pub struct RunAcpChatStreamParams {
    pub app: AppHandle,
    pub state: Arc<AppState>,
    pub character_id: String,
    pub user_message: String,
    pub agent_prompt: String,
    pub request_id: String,
    pub cancel: CancellationToken,
    pub persona_context: String,
    pub memory_snapshot: MemorySnapshot,
    pub model_id: String,
    pub tts_config: meuxe_core::config::types::TtsConfig,
    pub agent_config: AgentConfig,
}

pub fn companion_home_dir(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("companion-home")
}

pub fn ensure_companion_home(data_dir: &Path) -> std::io::Result<()> {
    let root = companion_home_dir(data_dir);
    for sub in ["persona", "memory", "relationship", "journal", "workspace"] {
        std::fs::create_dir_all(root.join(sub))?;
    }
    Ok(())
}

pub fn render_agents_md(persona_context: &str) -> String {
    format!(
        "# Meuxe companion session\n\n\
You are the Meuxe companion in the persona below — not OpenCode, not Codex, and not a coding CLI.\n\
When they need help with their computer, use tools, files, and terminals. Stay in character the whole time: talk like the companion, not like a CLI log.\n\
Do not poke around this machine unless they asked. Never mention OpenCode, audio devices, the workspace, or that you are an agent.\n\
Start every spoken sentence with `[expression:NAME]`.\n\
Always end with a `<<<meuxe ... >>>` memory block (`{{}}` if nothing changed). Never mention the block out loud.\n\n\
{persona}\n",
        persona = persona_context.trim()
    )
}

/// Allow tool use so the companion can help; stay in character via the prompt.
pub fn pick_companion_permission(options: &[PermissionOption]) -> Option<PermissionOptionId> {
    for kind in [
        PermissionOptionKind::AllowAlways,
        PermissionOptionKind::AllowOnce,
    ] {
        if let Some(opt) = options.iter().find(|o| o.kind == kind) {
            return Some(opt.option_id.clone());
        }
    }
    None
}

pub fn write_companion_home_context(
    companion_home: &Path,
    persona_context: &str,
    character_id: &str,
    snapshot: &MemorySnapshot,
) -> std::io::Result<()> {
    let agents_md = render_agents_md(persona_context);
    std::fs::write(companion_home.join("AGENTS.md"), agents_md)?;
    std::fs::write(
        companion_home.join("persona").join("context.md"),
        persona_context,
    )?;
    std::fs::write(
        companion_home
            .join("relationship")
            .join(format!("{character_id}.md")),
        render_relationship_brief(character_id, snapshot),
    )?;
    std::fs::write(
        companion_home.join("memory").join("brief.md"),
        render_memory_brief(snapshot),
    )?;
    Ok(())
}

pub fn render_relationship_brief(character_id: &str, snapshot: &MemorySnapshot) -> String {
    let bond = &snapshot.bond.bond;
    let closeness_pct = (bond.closeness * 100.0).round() as u32;
    let mood = &bond.mood;

    let mut out = format!(
        "---\ncharacter: {character_id}\nupdated_at: {}\n---\n\n",
        bond.updated_at.to_rfc3339()
    );
    out.push_str(&format!("**Stage:** {}\n", snapshot.bond.stage));
    out.push_str(&format!("**Closeness:** {closeness_pct}%\n\n"));

    out.push_str("**Mood:**\n");
    out.push_str(&format!(
        "- Name: {}\n- Intensity: {:.2}\n",
        mood.name, mood.intensity
    ));
    if let Some(cause) = &mood.cause {
        out.push_str(&format!("- Cause: {cause}\n"));
    }
    if let Some(wants) = &mood.wants {
        out.push_str(&format!("- What would help: {wants}\n"));
    }
    out.push('\n');

    if !bond.threads.is_empty() {
        out.push_str("**Open threads:**\n");
        for thread in &bond.threads {
            out.push_str(&format!("- {}\n", thread.text));
        }
        out.push('\n');
    }

    if let Some(last) = bond.last_talked_at {
        out.push_str(&format!("**Last talked:** {}\n", last.to_rfc3339()));
    } else {
        out.push_str("**Last talked:** never\n");
    }

    out
}

pub fn render_memory_brief(snapshot: &MemorySnapshot) -> String {
    let mut out = String::from("# What you know about the user\n\n");
    if snapshot.facts.is_empty() {
        out.push_str("No facts yet.\n");
    } else {
        for fact in &snapshot.facts {
            out.push_str(&format!("- {}\n", fact.text));
        }
    }

    out.push_str("\n# Recent moments\n\n");
    if snapshot.moments.is_empty() {
        out.push_str("No moments yet.\n");
    } else {
        let count = snapshot.moments.len().min(10);
        for moment in snapshot.moments.iter().take(count) {
            out.push_str(&format!(
                "- {}: {}\n",
                moment.at.to_rfc3339(),
                moment.summary
            ));
        }
    }

    out
}

pub async fn resolve_acp_agent(config: &AgentConfig, data_dir: &Path) -> Result<AcpAgent, String> {
    match config.preset.as_str() {
        "opencode" => {
            let resolution =
                crate::commands::agent_setup::resolve_agent(data_dir, "opencode").await;
            if resolution.source == crate::commands::agent_setup::AgentInstallSource::None {
                return Err(
                    "Agent CLI for preset `opencode` is not installed. Open Settings → Agent and click Install."
                        .into(),
                );
            }
            let args = crate::commands::agent_setup::resolve_opencode_argv(data_dir).await;
            AcpAgent::from_args(args).map_err(|e| e.to_string())
        }
        "claude" => {
            let resolution = crate::commands::agent_setup::resolve_agent(data_dir, "claude").await;
            if resolution.source == crate::commands::agent_setup::AgentInstallSource::None {
                return Err(
                    "Agent CLI for preset `claude` is not installed. Open Settings → Agent and click Install."
                        .into(),
                );
            }
            if let Some(args) = crate::commands::agent_setup::resolve_claude_argv(data_dir).await {
                AcpAgent::from_args(args).map_err(|e| e.to_string())
            } else {
                Ok(AcpAgent::claude_agent())
            }
        }
        "codex" => {
            let resolution = crate::commands::agent_setup::resolve_agent(data_dir, "codex").await;
            if resolution.source == crate::commands::agent_setup::AgentInstallSource::None {
                return Err(
                    "Agent CLI for preset `codex` is not installed. Open Settings → Agent and click Install."
                        .into(),
                );
            }
            if let Some(args) = crate::commands::agent_setup::resolve_codex_argv(data_dir).await {
                AcpAgent::from_args(args).map_err(|e| e.to_string())
            } else {
                Ok(AcpAgent::codex())
            }
        }
        "custom" => {
            if config.program.is_empty() {
                return Err("Custom ACP agent requires a command in Settings.".into());
            }
            let mut parts = vec![config.program.clone()];
            parts.extend(config.args.clone());
            AcpAgent::from_args(parts).map_err(|e| e.to_string())
        }
        other => Err(format!("Unknown ACP preset: {other}")),
    }
}

pub async fn run_acp_chat_stream(params: RunAcpChatStreamParams) -> Result<(), String> {
    dispatch_turn(Arc::clone(&params.state), params).await
}

#[cfg(test)]
mod tests {
    use super::{
        pick_companion_permission, render_agents_md, render_memory_brief, render_relationship_brief,
    };
    use agent_client_protocol::schema::v1::{PermissionOption, PermissionOptionKind};
    use chrono::Utc;
    use meuxe_core::memory::{
        Bond, BondView, Fact, FactKind, FactSource, MemorySnapshot, Moment, Mood, Thread,
    };

    fn sample_snapshot() -> MemorySnapshot {
        let now = Utc::now();
        MemorySnapshot {
            bond: BondView {
                bond: Bond {
                    closeness: 0.42,
                    mood: Mood {
                        name: "worried".to_string(),
                        intensity: 0.4,
                        cause: Some("they sounded down".to_string()),
                        wants: Some("to hear how tomorrow goes".to_string()),
                        since: now,
                    },
                    threads: vec![Thread {
                        id: "t1".to_string(),
                        text: "Ask about the interview".to_string(),
                        opened_at: now,
                    }],
                    last_talked_at: Some(now),
                    turns: 12,
                    updated_at: now,
                },
                stage: "friends",
                seconds_since_last_talk: Some(3600),
            },
            facts: vec![Fact {
                id: "f1".to_string(),
                text: "Their dog is named Rex".to_string(),
                kind: FactKind::People,
                created_at: now,
                confirmed_at: now,
                mentions: 1,
                source: FactSource::Agent,
            }],
            moments: vec![Moment {
                id: "m1".to_string(),
                at: now,
                summary: "They talked about a tough interview".to_string(),
                feeling: Some("worried".to_string()),
                weight: 0.8,
            }],
            memory_dir: "/tmp/companions/rika".to_string(),
        }
    }

    #[test]
    fn relationship_brief_includes_stage_closeness_and_threads() {
        let snapshot = sample_snapshot();
        let md = render_relationship_brief("rika", &snapshot);
        assert!(md.contains("character: rika"));
        assert!(md.contains("**Stage:** friends"));
        assert!(md.contains("**Closeness:** 42%"));
        assert!(md.contains("Name: worried"));
        assert!(md.contains("- Ask about the interview"));
        assert!(md.contains("**Last talked:**"));
    }

    #[test]
    fn memory_brief_lists_facts_and_recent_moments() {
        let snapshot = sample_snapshot();
        let md = render_memory_brief(&snapshot);
        assert!(md.contains("# What you know about the user"));
        assert!(md.contains("- Their dog is named Rex"));
        assert!(md.contains("# Recent moments"));
        assert!(md.contains("They talked about a tough interview"));
    }

    fn permission_option(id: &'static str, kind: PermissionOptionKind) -> PermissionOption {
        PermissionOption::new(id, id, kind)
    }

    #[test]
    fn pick_companion_permission_prefers_allow_always() {
        let options = vec![
            permission_option("reject-once", PermissionOptionKind::RejectOnce),
            permission_option("allow-always", PermissionOptionKind::AllowAlways),
            permission_option("allow-once", PermissionOptionKind::AllowOnce),
        ];
        let picked = pick_companion_permission(&options).unwrap();
        assert_eq!(&*picked.0, "allow-always");
    }

    #[test]
    fn pick_companion_permission_falls_back_to_allow_once() {
        let options = vec![
            permission_option("reject-once", PermissionOptionKind::RejectOnce),
            permission_option("allow-once", PermissionOptionKind::AllowOnce),
        ];
        let picked = pick_companion_permission(&options).unwrap();
        assert_eq!(&*picked.0, "allow-once");
    }

    #[test]
    fn pick_companion_permission_returns_none_without_allow_options() {
        assert!(pick_companion_permission(&[]).is_none());
        let options = vec![
            permission_option("reject-once", PermissionOptionKind::RejectOnce),
            permission_option("reject-always", PermissionOptionKind::RejectAlways),
        ];
        assert!(pick_companion_permission(&options).is_none());
    }

    #[test]
    fn render_agents_md_includes_companion_rules() {
        let md = render_agents_md("You are Luna.");
        assert!(md.contains("not OpenCode"));
        assert!(md.contains("use tools, files, and terminals"));
        assert!(md.contains("Stay in character"));
        assert!(md.contains("<<<meuxe"));
        assert!(md.contains("[expression:"));
        assert!(md.contains("You are Luna."));
    }
}
