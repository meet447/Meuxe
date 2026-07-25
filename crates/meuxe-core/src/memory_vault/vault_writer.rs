use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::Result;

use super::types::{DreamRun, MemoryVaultOverview, RelationshipSnapshot, VaultMemory};

pub fn write_vault(
    vault_dir: &Path,
    character_id: &str,
    memories: &[VaultMemory],
    relationship: &RelationshipSnapshot,
    latest_dream: Option<&DreamRun>,
    overview: &MemoryVaultOverview,
) -> Result<()> {
    std::fs::create_dir_all(vault_dir)?;
    std::fs::create_dir_all(vault_dir.join("memories"))?;
    std::fs::create_dir_all(vault_dir.join("characters").join(character_id))?;
    std::fs::create_dir_all(vault_dir.join("daily"))?;

    write_atomic(
        vault_dir.join("index.md"),
        &render_index(character_id, overview, latest_dream),
    )?;
    write_atomic(
        vault_dir
            .join("characters")
            .join(character_id)
            .join("relationship.md"),
        &render_relationship(relationship),
    )?;
    write_atomic(
        vault_dir
            .join("characters")
            .join(character_id)
            .join("reflections.md"),
        &render_memories(
            "Reflections",
            memories
                .iter()
                .filter(|memory| memory.memory_type == "reflections")
                .collect::<Vec<_>>()
                .as_slice(),
        ),
    )?;

    let mut by_type: BTreeMap<&str, Vec<&VaultMemory>> = BTreeMap::new();
    for memory in memories {
        by_type.entry(&memory.memory_type).or_default().push(memory);
    }
    for (memory_type, values) in by_type {
        write_atomic(
            vault_dir
                .join("memories")
                .join(format!("{}.md", slug_file(memory_type))),
            &render_memories(&format!("{} memories", title_case(memory_type)), &values),
        )?;
    }

    let today = chrono::Utc::now().date_naive().to_string();
    write_atomic(
        vault_dir.join("daily").join(format!("{today}.md")),
        &render_daily(today, memories),
    )?;
    Ok(())
}

fn render_index(
    character_id: &str,
    overview: &MemoryVaultOverview,
    latest_dream: Option<&DreamRun>,
) -> String {
    let latest_dream_summary = latest_dream
        .map(|dream| dream.summary.as_str())
        .unwrap_or("No dream/reflection run has completed yet.");
    format!(
        "# Meuxe Memory Vault\n\n\
         Character: `{character_id}`\n\n\
         ## Stats\n\n\
         - Total memories: {}\n\
         - Sources: {}\n\
         - Dream runs: {}\n\
         - Semantic: {}\n\
         - Episodic: {}\n\
         - Reflections: {}\n\
         - Latest memory: {}\n\
         - Latest dream: {}\n\n\
         ## Latest dream\n\n{}\n\n\
         ## Folders\n\n\
         - `memories/` canonical memory summaries\n\
         - `characters/{character_id}/relationship.md` companion relationship state\n\
         - `daily/` generated day views\n",
        overview.total_memories,
        overview.total_sources,
        overview.total_dreams,
        overview.semantic_count,
        overview.episodic_count,
        overview.reflection_count,
        overview.latest_memory_at.as_deref().unwrap_or("none"),
        overview.latest_dream_at.as_deref().unwrap_or("none"),
        latest_dream_summary
    )
}

fn render_relationship(relationship: &RelationshipSnapshot) -> String {
    format!(
        "---\ncharacter: {}\nupdated_at: {}\n---\n\n\
         # Relationship State\n\n\
         - Mood: {}\n\
         - Trust: {:.2}\n\
         - Affection: {:.2}\n\
         - Energy: {:.2}\n\n\
         ## Summary\n\n{}\n",
        relationship.character_id,
        relationship.updated_at,
        relationship.mood,
        relationship.trust,
        relationship.affection,
        relationship.energy,
        relationship.relationship_summary
    )
}

fn render_memories(title: &str, memories: &[&VaultMemory]) -> String {
    let mut out = format!("# {title}\n\n");
    if memories.is_empty() {
        out.push_str("No entries yet.\n");
        return out;
    }

    for memory in memories {
        out.push_str(&format!(
            "## {}\n\n\
             - Type: `{}`\n\
             - Created: {}\n\
             - Importance: {:.0}%\n\
             - Source: `{}`\n\
             - Tags: {}\n\
             - Provenance: {}\n\n{}\n\n",
            memory.id,
            memory.memory_type,
            memory.ts.to_rfc3339(),
            memory.importance * 100.0,
            memory.source_kind,
            if memory.tags.is_empty() {
                "none".to_string()
            } else {
                memory.tags.join(", ")
            },
            memory.provenance.as_deref().unwrap_or("none"),
            memory.summary
        ));
    }
    out
}

fn render_daily(today: String, memories: &[VaultMemory]) -> String {
    let mut out = format!("# {today}\n\n");
    let today_memories = memories
        .iter()
        .filter(|memory| memory.ts.date_naive().to_string() == today)
        .collect::<Vec<_>>();
    if today_memories.is_empty() {
        out.push_str("No memory entries written today.\n");
    } else {
        out.push_str(&render_memories("Entries written today", &today_memories));
    }
    out
}

fn write_atomic(path: PathBuf, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
    }
    std::fs::rename(tmp, path)?;
    Ok(())
}

fn slug_file(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn title_case(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
        None => String::new(),
    }
}
