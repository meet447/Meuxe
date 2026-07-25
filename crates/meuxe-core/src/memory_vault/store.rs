use std::cmp::Ordering;
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::RwLock;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

use crate::error::{MeuxeError, Result};
use crate::memory::extractor;
use crate::memory::store::Memory;

use super::types::{
    DreamRun, MemorySourceItem, MemoryVaultOverview, RelationshipSnapshot, TopicSummary,
    VaultMemory,
};

const SCHEMA_VERSION: i64 = 2;

pub struct MemoryVault {
    data_dir: PathBuf,
    _lock: RwLock<()>,
}

impl MemoryVault {
    pub fn new(data_dir: impl Into<PathBuf>) -> Self {
        Self {
            data_dir: data_dir.into().join("data").join("users"),
            _lock: RwLock::new(()),
        }
    }

    pub fn user_memory_dir(&self, user_id: &str) -> PathBuf {
        self.data_dir.join(user_id).join("memory")
    }

    pub fn vault_dir(&self, user_id: &str) -> PathBuf {
        self.user_memory_dir(user_id).join("vault")
    }

    pub fn db_path(&self, user_id: &str) -> PathBuf {
        self.user_memory_dir(user_id).join("memory.db")
    }

    fn connection(&self, user_id: &str) -> Result<Connection> {
        let dir = self.user_memory_dir(user_id);
        std::fs::create_dir_all(&dir)?;
        let conn = Connection::open(self.db_path(user_id))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        self.migrate(&conn)?;
        Ok(conn)
    }

    fn migrate(&self, conn: &Connection) -> Result<()> {
        let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version >= SCHEMA_VERSION {
            return Ok(());
        }

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS source_items (
                id TEXT PRIMARY KEY,
                ts TEXT NOT NULL,
                user_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                title TEXT NOT NULL,
                body_markdown TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                UNIQUE(user_id, character_id, content_hash)
            );

            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                ts TEXT NOT NULL,
                user_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                type TEXT NOT NULL,
                summary TEXT NOT NULL,
                importance REAL NOT NULL,
                tags_json TEXT NOT NULL DEFAULT '[]',
                source_kind TEXT NOT NULL,
                source_id TEXT,
                provenance TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                topic TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                UNIQUE(user_id, character_id, type, summary)
            );

            CREATE INDEX IF NOT EXISTS idx_memories_scope_ts
                ON memories(user_id, character_id, ts DESC);
            CREATE INDEX IF NOT EXISTS idx_memories_type
                ON memories(user_id, character_id, type);
            CREATE INDEX IF NOT EXISTS idx_memories_pinned
                ON memories(user_id, character_id, pinned);
            CREATE INDEX IF NOT EXISTS idx_memories_topic
                ON memories(user_id, character_id, topic);

            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                memory_id UNINDEXED,
                summary,
                tags
            );

            CREATE TABLE IF NOT EXISTS relationship_state (
                user_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                mood TEXT NOT NULL,
                trust REAL NOT NULL,
                affection REAL NOT NULL,
                energy REAL NOT NULL,
                relationship_summary TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(user_id, character_id)
            );

            CREATE TABLE IF NOT EXISTS dream_runs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                status TEXT NOT NULL,
                summary TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                error TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_dream_runs_scope_ts
                ON dream_runs(user_id, character_id, started_at DESC);

            "#,
        )?;
        ensure_column(conn, "memories", "pinned", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "memories", "topic", "TEXT")?;
        rebuild_fts(conn)?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        Ok(())
    }

    pub fn ingest_chat_exchange(
        &self,
        character_id: &str,
        user_id: &str,
        user_message: &str,
        assistant_message: &str,
    ) -> Result<Vec<VaultMemory>> {
        let (saved, should_dream, relationship_mood) = {
            let _guard = self
                ._lock
                .write()
                .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
            let conn = self.connection(user_id)?;
            let tx = conn.unchecked_transaction()?;

            let source = insert_source_item(
                &tx,
                character_id,
                user_id,
                "chat",
                "Chat exchange",
                &chat_exchange_markdown(user_message, assistant_message),
                serde_json::json!({
                    "user_message": user_message,
                    "assistant_preview": truncate_chars(assistant_message, 240),
                }),
            )?;

            let existing = list_memories_tx(&tx, character_id, user_id, None, usize::MAX)?;
            let mut saved = Vec::new();
            for candidate in extractor::extract_memories(user_message) {
                if duplicate_summary(&existing, &candidate.memory_type, &candidate.summary) {
                    continue;
                }
                if let Some(memory) = insert_memory(
                    &tx,
                    character_id,
                    user_id,
                    &candidate.memory_type,
                    &candidate.summary,
                    candidate.importance,
                    candidate.tags,
                    "chat",
                    Some(&source.id),
                    Some(&format!("source://{}", source.id)),
                    serde_json::json!({ "extractor": "heuristic_v1" }),
                )? {
                    saved.push(memory);
                }
            }

            if extractor::check_positive_response(user_message) {
                let summary = format!(
                    "User found the response helpful: \"{}\"",
                    truncate_chars(assistant_message, 120)
                );
                if !duplicate_summary(&existing, "reflections", &summary) {
                    if let Some(memory) = insert_memory(
                        &tx,
                        character_id,
                        user_id,
                        "reflections",
                        &summary,
                        0.6,
                        vec!["positive_feedback".to_string(), "reflection".to_string()],
                        "chat",
                        Some(&source.id),
                        Some(&format!("source://{}", source.id)),
                        serde_json::json!({ "extractor": "gratitude_v1" }),
                    )? {
                        saved.push(memory);
                    }
                }
            }

            let relationship = update_relationship_from_exchange_tx(
                &tx,
                character_id,
                user_id,
                user_message,
                assistant_message,
            )?;
            let should_dream = saved.len() >= 2 || relationship.mood == "warm";
            let relationship_mood = relationship.mood;
            tx.commit()?;
            (saved, should_dream, relationship_mood)
        };

        let _ = self.rebuild_vault(character_id, user_id);
        if should_dream || relationship_mood == "warm" {
            let _ = self.run_dream(character_id, user_id);
        }

        Ok(saved)
    }

    pub fn migrate_legacy_memories(
        &self,
        character_id: &str,
        user_id: &str,
        memories: &[Memory],
    ) -> Result<usize> {
        let imported = {
            let _guard = self
                ._lock
                .write()
                .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
            let conn = self.connection(user_id)?;
            let tx = conn.unchecked_transaction()?;
            let existing = list_memories_tx(&tx, character_id, user_id, None, usize::MAX)?;
            let mut imported = 0;
            for memory in memories {
                if duplicate_summary(&existing, &memory.memory_type, &memory.summary) {
                    continue;
                }
                let source = insert_source_item(
                    &tx,
                    character_id,
                    user_id,
                    "legacy_jsonl",
                    &format!("Legacy {} memory", memory.memory_type),
                    &memory.summary,
                    serde_json::json!({
                        "legacy_id": memory.id,
                        "legacy_type": memory.memory_type,
                        "legacy_ts": memory.ts.to_rfc3339(),
                    }),
                )?;
                if insert_memory(
                    &tx,
                    character_id,
                    user_id,
                    &memory.memory_type,
                    &memory.summary,
                    memory.importance,
                    memory.tags.clone(),
                    "legacy_jsonl",
                    Some(&source.id),
                    Some(&format!("legacy://{}", memory.id)),
                    memory.metadata.clone(),
                )?
                .is_some()
                {
                    imported += 1;
                }
            }
            tx.commit()?;
            imported
        };
        let _ = self.rebuild_vault(character_id, user_id);
        Ok(imported)
    }

    pub fn ingest_manual_note(
        &self,
        character_id: &str,
        user_id: &str,
        title: &str,
        body_markdown: &str,
    ) -> Result<Vec<VaultMemory>> {
        self.ingest_source_markdown(
            character_id,
            user_id,
            "manual_note",
            title,
            body_markdown,
            serde_json::json!({ "ingest": "manual_note" }),
        )
    }

    pub fn ingest_meeting_transcript(
        &self,
        character_id: &str,
        user_id: &str,
        title: &str,
        transcript: &str,
    ) -> Result<Vec<VaultMemory>> {
        let body = format!("# Meeting transcript: {title}\n\n{transcript}");
        self.ingest_source_markdown(
            character_id,
            user_id,
            "meeting_transcript",
            title,
            &body,
            serde_json::json!({ "ingest": "meeting_transcript" }),
        )
    }

    pub fn ingest_text_file(
        &self,
        character_id: &str,
        user_id: &str,
        path: PathBuf,
    ) -> Result<Vec<VaultMemory>> {
        let body = std::fs::read_to_string(&path)?;
        let title = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Imported file")
            .to_string();
        self.ingest_source_markdown(
            character_id,
            user_id,
            "local_file",
            &title,
            &body,
            serde_json::json!({
                "path": path.to_string_lossy(),
                "ingest": "local_file",
            }),
        )
    }

    pub fn ingest_text_folder(
        &self,
        character_id: &str,
        user_id: &str,
        path: PathBuf,
    ) -> Result<usize> {
        let mut imported = 0;
        for entry in WalkDir::new(path)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path().to_path_buf();
            if is_text_ingest_file(&path) {
                imported += self.ingest_text_file(character_id, user_id, path)?.len();
            }
        }
        Ok(imported)
    }

    pub fn ingest_composio_github_readonly(
        &self,
        character_id: &str,
        user_id: &str,
        owner: &str,
        repo: &str,
        readme_markdown: &str,
    ) -> Result<Vec<VaultMemory>> {
        self.ingest_source_markdown(
            character_id,
            user_id,
            "composio_github",
            &format!("{owner}/{repo} README"),
            readme_markdown,
            serde_json::json!({
                "toolkit": "github",
                "owner": owner,
                "repo": repo,
                "mode": "read_only",
                "via": "composio",
            }),
        )
    }

    pub fn ingest_composio_gmail_readonly(
        &self,
        character_id: &str,
        user_id: &str,
        title: &str,
        body_markdown: &str,
        metadata: serde_json::Value,
    ) -> Result<Vec<VaultMemory>> {
        let mut metadata = metadata;
        if metadata.get("toolkit").is_none() {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert("toolkit".to_string(), serde_json::json!("gmail"));
            }
        }
        if metadata.get("mode").is_none() {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert("mode".to_string(), serde_json::json!("read_only"));
            }
        }
        if metadata.get("via").is_none() {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert("via".to_string(), serde_json::json!("composio"));
            }
        }
        self.ingest_source_markdown(
            character_id,
            user_id,
            "composio_gmail",
            title,
            body_markdown,
            metadata,
        )
    }

    pub fn ingest_source_markdown(
        &self,
        character_id: &str,
        user_id: &str,
        source_kind: &str,
        title: &str,
        body_markdown: &str,
        metadata: serde_json::Value,
    ) -> Result<Vec<VaultMemory>> {
        let saved = {
            let _guard = self
                ._lock
                .write()
                .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
            let conn = self.connection(user_id)?;
            let tx = conn.unchecked_transaction()?;
            let source = insert_source_item(
                &tx,
                character_id,
                user_id,
                source_kind,
                title,
                body_markdown,
                metadata,
            )?;
            let existing = list_memories_tx(&tx, character_id, user_id, None, usize::MAX)?;
            let mut saved = Vec::new();

            let candidates = extractor::extract_memories(body_markdown);
            for candidate in candidates {
                if duplicate_summary(&existing, &candidate.memory_type, &candidate.summary) {
                    continue;
                }
                if let Some(memory) = insert_memory(
                    &tx,
                    character_id,
                    user_id,
                    &candidate.memory_type,
                    &candidate.summary,
                    candidate.importance,
                    candidate.tags,
                    source_kind,
                    Some(&source.id),
                    Some(&format!("source://{}", source.id)),
                    serde_json::json!({ "extractor": "source_heuristic_v1" }),
                )? {
                    saved.push(memory);
                }
            }

            let fallback_summary = format!("Imported {source_kind}: {title}");
            if saved.is_empty()
                && !duplicate_summary(&existing, "episodic", &fallback_summary)
                && !body_markdown.trim().is_empty()
            {
                if let Some(memory) = insert_memory(
                    &tx,
                    character_id,
                    user_id,
                    "episodic",
                    &fallback_summary,
                    0.5,
                    vec![source_kind.to_string(), "imported_source".to_string()],
                    source_kind,
                    Some(&source.id),
                    Some(&format!("source://{}", source.id)),
                    serde_json::json!({
                        "source_excerpt": truncate_chars(body_markdown, 500),
                    }),
                )? {
                    saved.push(memory);
                }
            }
            tx.commit()?;
            saved
        };

        let _ = self.rebuild_vault(character_id, user_id);
        Ok(saved)
    }

    pub fn list_memories(
        &self,
        character_id: &str,
        user_id: &str,
        memory_type: Option<&str>,
        limit: usize,
    ) -> Result<Vec<VaultMemory>> {
        let _guard = self
            ._lock
            .read()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
        let conn = self.connection(user_id)?;
        list_memories_tx(&conn, character_id, user_id, memory_type, limit)
    }

    pub fn search_memories(
        &self,
        character_id: &str,
        user_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<VaultMemory>> {
        let _guard = self
            ._lock
            .read()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
        let conn = self.connection(user_id)?;
        let mut memories = search_memories_tx(&conn, character_id, user_id, query, limit * 4)?;
        if memories.is_empty() {
            memories = list_memories_tx(&conn, character_id, user_id, None, usize::MAX)?;
        }
        rank_memories(query, &mut memories);
        memories.truncate(limit);
        Ok(memories)
    }

    pub fn delete_memory(&self, character_id: &str, user_id: &str, memory_id: &str) -> Result<()> {
        {
            let _guard = self
                ._lock
                .write()
                .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
            let conn = self.connection(user_id)?;
            conn.execute(
                "DELETE FROM memories WHERE user_id = ?1 AND character_id = ?2 AND id = ?3",
                params![user_id, character_id, memory_id],
            )?;
            conn.execute(
                "DELETE FROM memory_fts WHERE memory_id = ?1",
                params![memory_id],
            )?;
        }
        self.rebuild_vault(character_id, user_id)?;
        Ok(())
    }

    pub fn set_memory_pinned(
        &self,
        character_id: &str,
        user_id: &str,
        memory_id: &str,
        pinned: bool,
    ) -> Result<()> {
        {
            let _guard = self
                ._lock
                .write()
                .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
            let conn = self.connection(user_id)?;
            conn.execute(
                "UPDATE memories SET pinned = ?1 WHERE user_id = ?2 AND character_id = ?3 AND id = ?4",
                params![if pinned { 1 } else { 0 }, user_id, character_id, memory_id],
            )?;
        }
        self.rebuild_vault(character_id, user_id)?;
        Ok(())
    }

    pub fn list_sources(
        &self,
        character_id: &str,
        user_id: &str,
        limit: usize,
    ) -> Result<Vec<MemorySourceItem>> {
        let conn = self.connection(user_id)?;
        let mut stmt = conn.prepare(
            "SELECT id, ts, user_id, character_id, source_kind, title, body_markdown, content_hash, metadata_json
             FROM source_items
             WHERE user_id = ?1 AND character_id = ?2
             ORDER BY ts DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(
            params![user_id, character_id, limit as i64],
            source_from_row,
        )?;
        let mut sources = Vec::new();
        for row in rows {
            sources.push(row?);
        }
        Ok(sources)
    }

    pub fn topic_summaries(&self, character_id: &str, user_id: &str) -> Result<Vec<TopicSummary>> {
        let memories = self.list_memories(character_id, user_id, None, usize::MAX)?;
        let mut topics: std::collections::BTreeMap<String, Vec<VaultMemory>> =
            std::collections::BTreeMap::new();
        for memory in memories {
            if let Some(topic) = memory.topic.clone() {
                topics.entry(topic).or_default().push(memory);
            }
        }
        Ok(topics
            .into_iter()
            .map(|(topic, mut memories)| {
                memories.sort_by_key(|m| std::cmp::Reverse(m.ts));
                let latest_at = memories.first().map(|m| m.ts.to_rfc3339());
                let highlights = memories
                    .iter()
                    .take(3)
                    .map(|m| m.summary.as_str())
                    .collect::<Vec<_>>()
                    .join(" | ");
                TopicSummary {
                    topic,
                    count: memories.len(),
                    summary: highlights,
                    latest_at,
                }
            })
            .collect())
    }

    pub fn export_zip(
        &self,
        character_id: &str,
        user_id: &str,
        output_path: PathBuf,
    ) -> Result<PathBuf> {
        let vault_dir = self.rebuild_vault(character_id, user_id)?;
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = std::fs::File::create(&output_path)?;
        let mut zip = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for entry in WalkDir::new(&vault_dir)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path();
            let relative = path.strip_prefix(&vault_dir).map_err(|e| {
                MeuxeError::Memory(format!(
                    "Failed to build zip path for {}: {e}",
                    path.display()
                ))
            })?;
            zip.start_file(relative.to_string_lossy().replace('\\', "/"), options)?;
            let bytes = std::fs::read(path)?;
            zip.write_all(&bytes)?;
        }
        zip.finish()?;
        Ok(output_path)
    }

    pub fn import_zip(
        &self,
        character_id: &str,
        user_id: &str,
        input_path: PathBuf,
    ) -> Result<usize> {
        let file = std::fs::File::open(&input_path)?;
        let mut archive = zip::ZipArchive::new(file)?;
        let mut imported = 0;
        for index in 0..archive.len() {
            let mut file = archive.by_index(index)?;
            if !file.is_file() || !is_text_archive_name(file.name()) {
                continue;
            }
            let mut content = String::new();
            file.read_to_string(&mut content)?;
            imported += self
                .ingest_source_markdown(
                    character_id,
                    user_id,
                    "vault_zip_import",
                    file.name(),
                    &content,
                    serde_json::json!({
                        "zip_path": input_path.to_string_lossy(),
                        "entry": file.name(),
                    }),
                )?
                .len();
        }
        Ok(imported)
    }

    pub fn clear(&self, character_id: &str, user_id: &str) -> Result<()> {
        let _guard = self
            ._lock
            .write()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
        let conn = self.connection(user_id)?;
        conn.execute(
            "DELETE FROM memories WHERE user_id = ?1 AND character_id = ?2",
            params![user_id, character_id],
        )?;
        conn.execute(
            "DELETE FROM memory_fts WHERE memory_id NOT IN (SELECT id FROM memories)",
            [],
        )?;
        conn.execute(
            "DELETE FROM source_items WHERE user_id = ?1 AND character_id = ?2",
            params![user_id, character_id],
        )?;
        conn.execute(
            "DELETE FROM relationship_state WHERE user_id = ?1 AND character_id = ?2",
            params![user_id, character_id],
        )?;
        self.rebuild_vault(character_id, user_id)?;
        Ok(())
    }

    pub fn get_relationship(
        &self,
        character_id: &str,
        user_id: &str,
    ) -> Result<RelationshipSnapshot> {
        let conn = self.connection(user_id)?;
        relationship_tx(&conn, character_id, user_id)
    }

    pub fn format_relationship_prompt(&self, character_id: &str, user_id: &str) -> Result<String> {
        let state = self.get_relationship(character_id, user_id)?;
        Ok(format!(
            "Current relational state:\n- Mood: {}\n- Trust: {:.2}\n- Affection: {:.2}\n- Energy: {:.2}\n- Relationship: {}\n\nLet this influence tone naturally. Do not mention these values explicitly.",
            state.mood, state.trust, state.affection, state.energy, state.relationship_summary
        ))
    }

    pub fn format_memory_prompt(
        &self,
        character_id: &str,
        user_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<String> {
        let mut relevant = self.search_memories(character_id, user_id, query, limit)?;
        if relevant.is_empty() {
            return Ok(String::new());
        }
        relevant.sort_by(|a, b| {
            b.pinned.cmp(&a.pinned).then_with(|| {
                b.importance
                    .partial_cmp(&a.importance)
                    .unwrap_or(Ordering::Equal)
            })
        });
        let mut out = String::from("Relevant long-term memory vault entries:\n");
        let mut used = out.len();
        let budget = 1_800usize;
        for memory in relevant {
            let line = format!(
                "- [{} | importance {:.0}%] {}\n",
                memory.memory_type,
                memory.importance * 100.0,
                memory.summary
            );
            if used + line.len() > budget {
                out.push_str("- [memory budget reached]\n");
                break;
            }
            used += line.len();
            out.push_str(&line);
        }
        Ok(out)
    }

    pub fn run_dream(&self, character_id: &str, user_id: &str) -> Result<DreamRun> {
        let _guard = self
            ._lock
            .write()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;
        let conn = self.connection(user_id)?;
        let started_at = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO dream_runs (id, user_id, character_id, status, summary, started_at)
             VALUES (?1, ?2, ?3, 'running', '', ?4)",
            params![id, user_id, character_id, started_at],
        )?;

        let recent = list_memories_tx(&conn, character_id, user_id, None, 20)?;
        let relationship = relationship_tx(&conn, character_id, user_id)?;
        let summary = dream_summary(&recent, &relationship);

        let tx = conn.unchecked_transaction()?;
        let _ = insert_memory(
            &tx,
            character_id,
            user_id,
            "reflections",
            &summary,
            0.72,
            vec!["dream".to_string(), "reflection".to_string()],
            "dream",
            Some(&id),
            Some(&format!("dream://{id}")),
            serde_json::json!({ "dream_run_id": id }),
        )?;
        tx.execute(
            "UPDATE dream_runs SET status = 'completed', summary = ?1, finished_at = ?2 WHERE id = ?3",
            params![summary, Utc::now().to_rfc3339(), id],
        )?;
        tx.commit()?;

        let _ = self.rebuild_vault(character_id, user_id);
        self.latest_dream(character_id, user_id)?
            .ok_or_else(|| MeuxeError::Memory("Dream run was not recorded".to_string()))
    }

    pub fn latest_dream(&self, character_id: &str, user_id: &str) -> Result<Option<DreamRun>> {
        let conn = self.connection(user_id)?;
        conn.query_row(
            "SELECT id, character_id, user_id, status, summary, started_at, finished_at, error
             FROM dream_runs
             WHERE user_id = ?1 AND character_id = ?2
             ORDER BY started_at DESC LIMIT 1",
            params![user_id, character_id],
            dream_from_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn overview(&self, character_id: &str, user_id: &str) -> Result<MemoryVaultOverview> {
        let conn = self.connection(user_id)?;
        let total_memories: i64 = count_scope(&conn, "memories", character_id, user_id)?;
        let total_sources: i64 = count_scope(&conn, "source_items", character_id, user_id)?;
        let total_dreams: i64 = count_scope(&conn, "dream_runs", character_id, user_id)?;
        let semantic_count = count_type(&conn, character_id, user_id, "semantic")?;
        let episodic_count = count_type(&conn, character_id, user_id, "episodic")?;
        let reflection_count = count_type(&conn, character_id, user_id, "reflections")?;
        let pinned_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM memories WHERE user_id = ?1 AND character_id = ?2 AND pinned = 1",
            params![user_id, character_id],
            |row| row.get(0),
        )?;
        let topic_count: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT topic) FROM memories WHERE user_id = ?1 AND character_id = ?2 AND topic IS NOT NULL",
            params![user_id, character_id],
            |row| row.get(0),
        )?;
        let latest_memory_at: Option<String> = conn
            .query_row(
                "SELECT ts FROM memories WHERE user_id = ?1 AND character_id = ?2 ORDER BY ts DESC LIMIT 1",
                params![user_id, character_id],
                |row| row.get(0),
            )
            .optional()?;
        let latest_dream_at: Option<String> = conn
            .query_row(
                "SELECT finished_at FROM dream_runs WHERE user_id = ?1 AND character_id = ?2 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1",
                params![user_id, character_id],
                |row| row.get(0),
            )
            .optional()?;
        let latest_source_at: Option<String> = conn
            .query_row(
                "SELECT ts FROM source_items WHERE user_id = ?1 AND character_id = ?2 ORDER BY ts DESC LIMIT 1",
                params![user_id, character_id],
                |row| row.get(0),
            )
            .optional()?;

        Ok(MemoryVaultOverview {
            total_memories: total_memories as usize,
            total_sources: total_sources as usize,
            total_dreams: total_dreams as usize,
            semantic_count: semantic_count as usize,
            episodic_count: episodic_count as usize,
            reflection_count: reflection_count as usize,
            latest_memory_at,
            latest_dream_at,
            vault_path: self.vault_dir(user_id).to_string_lossy().to_string(),
            database_path: self.db_path(user_id).to_string_lossy().to_string(),
            relationship: Some(relationship_tx(&conn, character_id, user_id)?),
            pinned_count: pinned_count as usize,
            topic_count: topic_count as usize,
            latest_source_at,
        })
    }

    pub fn rebuild_vault(&self, character_id: &str, user_id: &str) -> Result<PathBuf> {
        let conn = self.connection(user_id)?;
        let memories = list_memories_tx(&conn, character_id, user_id, None, usize::MAX)?;
        let relationship = relationship_tx(&conn, character_id, user_id)?;
        let latest_dream = self.latest_dream(character_id, user_id)?;
        let overview = self.overview(character_id, user_id)?;
        let vault_dir = self.vault_dir(user_id);
        super::vault_writer::write_vault(
            &vault_dir,
            character_id,
            &memories,
            &relationship,
            latest_dream.as_ref(),
            &overview,
        )?;
        Ok(vault_dir)
    }

    pub fn as_legacy_memories(memories: Vec<VaultMemory>) -> Vec<Memory> {
        memories
            .into_iter()
            .map(|m| Memory {
                id: m.id,
                ts: m.ts,
                memory_type: m.memory_type,
                summary: m.summary,
                importance: m.importance,
                tags: m.tags,
                metadata: m.metadata,
            })
            .collect()
    }
}

fn insert_source_item(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
    source_kind: &str,
    title: &str,
    body_markdown: &str,
    metadata: serde_json::Value,
) -> Result<MemorySourceItem> {
    let id = Uuid::new_v4().to_string();
    let ts = Utc::now();
    let content_hash = content_hash(&format!(
        "{character_id}\n{user_id}\n{source_kind}\n{body_markdown}"
    ));
    conn.execute(
        "INSERT OR IGNORE INTO source_items
         (id, ts, user_id, character_id, source_kind, title, body_markdown, content_hash, metadata_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            ts.to_rfc3339(),
            user_id,
            character_id,
            source_kind,
            title,
            body_markdown,
            content_hash,
            serde_json::to_string(&metadata)?,
        ],
    )?;

    let stored = conn.query_row(
        "SELECT id, ts, user_id, character_id, source_kind, title, body_markdown, content_hash, metadata_json
         FROM source_items
         WHERE user_id = ?1 AND character_id = ?2 AND content_hash = ?3",
        params![user_id, character_id, content_hash],
        source_from_row,
    )?;
    Ok(stored)
}

#[allow(clippy::too_many_arguments)]
fn insert_memory(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
    memory_type: &str,
    summary: &str,
    importance: f64,
    tags: Vec<String>,
    source_kind: &str,
    source_id: Option<&str>,
    provenance: Option<&str>,
    metadata: serde_json::Value,
) -> Result<Option<VaultMemory>> {
    let id = Uuid::new_v4().to_string();
    let ts = Utc::now();
    let tags_json = serde_json::to_string(&tags)?;
    let inserted = conn.execute(
        "INSERT OR IGNORE INTO memories
         (id, ts, user_id, character_id, type, summary, importance, tags_json, source_kind, source_id, provenance, pinned, topic, metadata_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, ?13)",
        params![
            id,
            ts.to_rfc3339(),
            user_id,
            character_id,
            memory_type,
            summary,
            importance.clamp(0.0, 1.0),
            tags_json,
            source_kind,
            source_id,
            provenance,
            infer_topic(summary, &tags),
            serde_json::to_string(&metadata)?,
        ],
    )?;

    if inserted == 0 {
        return Ok(None);
    }

    conn.execute(
        "INSERT INTO memory_fts (memory_id, summary, tags) VALUES (?1, ?2, ?3)",
        params![id, summary, tags.join(" ")],
    )?;

    let topic = infer_topic(summary, &tags);
    Ok(Some(VaultMemory {
        id,
        ts,
        character_id: character_id.to_string(),
        user_id: user_id.to_string(),
        memory_type: memory_type.to_string(),
        summary: summary.to_string(),
        importance: importance.clamp(0.0, 1.0),
        tags,
        source_kind: source_kind.to_string(),
        source_id: source_id.map(str::to_string),
        provenance: provenance.map(str::to_string),
        pinned: false,
        topic,
        metadata,
    }))
}

fn list_memories_tx(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
    memory_type: Option<&str>,
    limit: usize,
) -> Result<Vec<VaultMemory>> {
    let mut memories = Vec::new();
    if let Some(memory_type) = memory_type {
        let mut stmt = conn.prepare(
            "SELECT id, ts, user_id, character_id, type, summary, importance, tags_json, source_kind, source_id, provenance, pinned, topic, metadata_json
             FROM memories
             WHERE user_id = ?1 AND character_id = ?2 AND type = ?3
             ORDER BY pinned DESC, ts DESC
             LIMIT ?4",
        )?;
        let rows = stmt.query_map(
            params![user_id, character_id, memory_type, limit as i64],
            memory_from_row,
        )?;
        for row in rows {
            memories.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, ts, user_id, character_id, type, summary, importance, tags_json, source_kind, source_id, provenance, pinned, topic, metadata_json
             FROM memories
             WHERE user_id = ?1 AND character_id = ?2
             ORDER BY pinned DESC, ts DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(
            params![user_id, character_id, limit as i64],
            memory_from_row,
        )?;
        for row in rows {
            memories.push(row?);
        }
    }
    Ok(memories)
}

fn update_relationship_from_exchange_tx(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
    user_message: &str,
    assistant_message: &str,
) -> Result<RelationshipSnapshot> {
    let mut state = relationship_tx(conn, character_id, user_id)?;
    let user_tokens = token_set(user_message);
    let assistant_tokens = token_set(assistant_message);
    let positive = [
        "thanks", "thank", "love", "great", "awesome", "helpful", "sweet", "nice",
    ];
    let negative = [
        "hate",
        "annoying",
        "bad",
        "upset",
        "angry",
        "frustrated",
        "sad",
    ];
    let attachment = ["remember", "miss", "stay", "together", "companion", "care"];

    if positive.iter().any(|t| user_tokens.contains(*t)) {
        state.trust += 0.04;
        state.affection += 0.05;
        state.mood = "warm".to_string();
    }
    if negative.iter().any(|t| user_tokens.contains(*t)) {
        state.trust -= 0.01;
        state.energy = f64::max(0.35, state.energy - 0.03);
        state.mood = "concerned".to_string();
    }
    if attachment.iter().any(|t| user_tokens.contains(*t)) {
        state.trust += 0.02;
        state.affection += 0.03;
    }
    if assistant_tokens.contains("proud") || assistant_tokens.contains("glad") {
        state.affection += 0.01;
    }

    state.trust = state.trust.clamp(0.0, 1.0);
    state.affection = state.affection.clamp(0.0, 1.0);
    state.energy = state.energy.clamp(0.0, 1.0);
    state.relationship_summary = if state.trust >= 0.7 && state.affection >= 0.7 {
        "close, trusting, emotionally open".to_string()
    } else if state.trust >= 0.4 || state.affection >= 0.4 {
        "growing warmer and more familiar".to_string()
    } else {
        "still early and getting to know each other".to_string()
    };
    state.updated_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO relationship_state
         (user_id, character_id, mood, trust, affection, energy, relationship_summary, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(user_id, character_id) DO UPDATE SET
           mood = excluded.mood,
           trust = excluded.trust,
           affection = excluded.affection,
           energy = excluded.energy,
           relationship_summary = excluded.relationship_summary,
           updated_at = excluded.updated_at",
        params![
            user_id,
            character_id,
            state.mood,
            state.trust,
            state.affection,
            state.energy,
            state.relationship_summary,
            state.updated_at,
        ],
    )?;
    Ok(state)
}

fn relationship_tx(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
) -> Result<RelationshipSnapshot> {
    let state = conn
        .query_row(
            "SELECT user_id, character_id, mood, trust, affection, energy, relationship_summary, updated_at
             FROM relationship_state WHERE user_id = ?1 AND character_id = ?2",
            params![user_id, character_id],
            |row| {
                Ok(RelationshipSnapshot {
                    user_id: row.get(0)?,
                    character_id: row.get(1)?,
                    mood: row.get(2)?,
                    trust: row.get(3)?,
                    affection: row.get(4)?,
                    energy: row.get(5)?,
                    relationship_summary: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()?;
    Ok(state.unwrap_or_else(|| RelationshipSnapshot::neutral(character_id, user_id)))
}

fn memory_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<VaultMemory> {
    let ts: String = row.get(1)?;
    let tags_json: String = row.get(7)?;
    let metadata_json: String = row.get(13)?;
    Ok(VaultMemory {
        id: row.get(0)?,
        ts: parse_ts(&ts),
        user_id: row.get(2)?,
        character_id: row.get(3)?,
        memory_type: row.get(4)?,
        summary: row.get(5)?,
        importance: row.get(6)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        source_kind: row.get(8)?,
        source_id: row.get(9)?,
        provenance: row.get(10)?,
        pinned: row.get::<_, i64>(11)? != 0,
        topic: row.get(12)?,
        metadata: serde_json::from_str(&metadata_json).unwrap_or_else(|_| serde_json::json!({})),
    })
}

fn source_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemorySourceItem> {
    let ts: String = row.get(1)?;
    let metadata_json: String = row.get(8)?;
    Ok(MemorySourceItem {
        id: row.get(0)?,
        ts: parse_ts(&ts),
        user_id: row.get(2)?,
        character_id: row.get(3)?,
        source_kind: row.get(4)?,
        title: row.get(5)?,
        body_markdown: row.get(6)?,
        content_hash: row.get(7)?,
        metadata: serde_json::from_str(&metadata_json).unwrap_or_else(|_| serde_json::json!({})),
    })
}

fn dream_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DreamRun> {
    Ok(DreamRun {
        id: row.get(0)?,
        character_id: row.get(1)?,
        user_id: row.get(2)?,
        status: row.get(3)?,
        summary: row.get(4)?,
        started_at: row.get(5)?,
        finished_at: row.get(6)?,
        error: row.get(7)?,
    })
}

fn parse_ts(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

fn duplicate_summary(existing: &[VaultMemory], memory_type: &str, summary: &str) -> bool {
    let normalized = summary.trim().to_lowercase();
    existing
        .iter()
        .any(|m| m.memory_type == memory_type && m.summary.trim().to_lowercase() == normalized)
}

fn chat_exchange_markdown(user_message: &str, assistant_message: &str) -> String {
    format!(
        "# Chat exchange\n\n## User\n\n{}\n\n## Assistant\n\n{}\n",
        user_message.trim(),
        assistant_message.trim()
    )
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut iter = value.chars();
    let truncated: String = iter.by_ref().take(max_chars).collect();
    if iter.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn content_hash(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn token_set(value: &str) -> HashSet<String> {
    extractor::extract_tokens(value)
}

fn rank_memories(query: &str, memories: &mut [VaultMemory]) {
    let query_tokens = token_set(query);
    memories.sort_by(|a, b| {
        score_memory(&query_tokens, b)
            .partial_cmp(&score_memory(&query_tokens, a))
            .unwrap_or(Ordering::Equal)
    });
}

fn score_memory(query_tokens: &HashSet<String>, memory: &VaultMemory) -> f64 {
    let memory_tokens = token_set(&memory.summary);
    let overlap = query_tokens.intersection(&memory_tokens).count() as f64;
    let tag_overlap = memory
        .tags
        .iter()
        .filter(|tag| query_tokens.contains(&tag.to_lowercase()))
        .count() as f64;
    overlap * 2.0 + tag_overlap * 1.5 + memory.importance
}

fn dream_summary(memories: &[VaultMemory], relationship: &RelationshipSnapshot) -> String {
    if memories.is_empty() {
        return format!(
            "Dream reflection: no long-term memories yet; relationship remains {}.",
            relationship.relationship_summary
        );
    }

    let highlights = memories
        .iter()
        .take(5)
        .map(|m| format!("{}: {}", m.memory_type, m.summary))
        .collect::<Vec<_>>()
        .join(" | ");
    format!(
        "Dream reflection: recent memories suggest the relationship is {}; active themes include {}.",
        relationship.relationship_summary, highlights
    )
}

fn count_scope(conn: &Connection, table: &str, character_id: &str, user_id: &str) -> Result<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table} WHERE user_id = ?1 AND character_id = ?2");
    conn.query_row(&sql, params![user_id, character_id], |row| row.get(0))
        .map_err(Into::into)
}

fn count_type(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
    memory_type: &str,
) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM memories WHERE user_id = ?1 AND character_id = ?2 AND type = ?3",
        params![user_id, character_id, memory_type],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )?;
    Ok(())
}

fn rebuild_fts(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM memory_fts", [])?;
    conn.execute(
        "INSERT INTO memory_fts (memory_id, summary, tags)
         SELECT id, summary, tags_json FROM memories",
        [],
    )?;
    Ok(())
}

fn search_memories_tx(
    conn: &Connection,
    character_id: &str,
    user_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<VaultMemory>> {
    let fts_query = fts_query(query);
    if fts_query.is_empty() {
        return list_memories_tx(conn, character_id, user_id, None, limit);
    }

    let mut stmt = conn.prepare(
        "SELECT m.id, m.ts, m.user_id, m.character_id, m.type, m.summary, m.importance,
                m.tags_json, m.source_kind, m.source_id, m.provenance, m.pinned, m.topic, m.metadata_json
         FROM memory_fts f
         JOIN memories m ON m.id = f.memory_id
         WHERE memory_fts MATCH ?1 AND m.user_id = ?2 AND m.character_id = ?3
         ORDER BY m.pinned DESC, bm25(memory_fts), m.importance DESC, m.ts DESC
         LIMIT ?4",
    )?;
    let rows = stmt.query_map(
        params![fts_query, user_id, character_id, limit as i64],
        memory_from_row,
    )?;
    let mut memories = Vec::new();
    for row in rows {
        memories.push(row?);
    }
    Ok(memories)
}

fn fts_query(query: &str) -> String {
    extractor::extract_tokens(query)
        .into_iter()
        .take(12)
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn infer_topic(summary: &str, tags: &[String]) -> Option<String> {
    if let Some(tag) = tags.iter().find(|tag| {
        matches!(
            tag.as_str(),
            "project" | "user_goal" | "preferences" | "identity" | "education" | "desire"
        )
    }) {
        return Some(tag.clone());
    }

    let tokens = extractor::extract_tokens(summary);
    [
        "rust", "github", "gmail", "meeting", "project", "memory", "database", "frontend",
        "backend",
    ]
    .iter()
    .find(|candidate| tokens.contains(**candidate))
    .map(|candidate| candidate.to_string())
}

fn is_text_ingest_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown" | "txt"))
        .unwrap_or(false)
}

fn is_text_archive_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md")
        || lower.ends_with(".markdown")
        || lower.ends_with(".txt")
        || lower.ends_with(".jsonl")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn ingests_chat_and_builds_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = MemoryVault::new(tmp.path());
        let saved = vault
            .ingest_chat_exchange(
                "rika",
                "user1",
                "My name is Alice. I am building a local AI desktop app. thanks!",
                "I'm glad that helped.",
            )
            .unwrap();

        assert!(saved.len() >= 2);
        let overview = vault.overview("rika", "user1").unwrap();
        assert!(overview.total_memories >= 2);
        assert!(Path::new(&overview.vault_path).join("index.md").exists());
        let state = vault.get_relationship("rika", "user1").unwrap();
        assert_eq!(state.mood, "warm");
    }

    #[test]
    fn search_ranks_relevant_memories() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = MemoryVault::new(tmp.path());
        vault
            .ingest_chat_exchange(
                "rika",
                "user1",
                "I prefer Rust for backend work.",
                "Got it.",
            )
            .unwrap();
        let results = vault
            .search_memories("rika", "user1", "backend rust", 1)
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].summary.to_lowercase().contains("rust"));
    }

    #[test]
    fn supports_pin_delete_sources_and_zip_import_export() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = MemoryVault::new(tmp.path());
        let saved = vault
            .ingest_manual_note(
                "rika",
                "user1",
                "Project note",
                "I prefer GitHub issues for project tracking.",
            )
            .unwrap();
        assert!(!saved.is_empty());
        let memory_id = saved[0].id.clone();

        vault
            .set_memory_pinned("rika", "user1", &memory_id, true)
            .unwrap();
        let pinned = vault.list_memories("rika", "user1", None, 10).unwrap();
        assert!(pinned[0].pinned);
        assert!(!vault.topic_summaries("rika", "user1").unwrap().is_empty());
        assert_eq!(vault.list_sources("rika", "user1", 10).unwrap().len(), 1);

        let export_path = tmp.path().join("vault.zip");
        vault
            .export_zip("rika", "user1", export_path.clone())
            .unwrap();
        assert!(export_path.exists());
        let imported = vault.import_zip("rika", "user1", export_path).unwrap();
        assert!(imported > 0);

        vault.delete_memory("rika", "user1", &memory_id).unwrap();
        assert!(!vault
            .list_memories("rika", "user1", None, 10)
            .unwrap()
            .iter()
            .any(|memory| memory.id == memory_id));
    }
}
