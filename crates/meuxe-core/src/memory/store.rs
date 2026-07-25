use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::RwLock;
use uuid::Uuid;

use crate::{MeuxeError, Result};

/// A single memory entry persisted in JSONL format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub ts: DateTime<Utc>,
    #[serde(rename = "type")]
    pub memory_type: String,
    pub summary: String,
    pub importance: f64,
    pub tags: Vec<String>,
    pub metadata: serde_json::Value,
}

/// The JSONL file layout for each memory category.
pub const MEMORY_FILES: [(&str, &str); 3] = [
    ("episodic", "episodic.jsonl"),
    ("semantic", "semantic.jsonl"),
    ("reflections", "reflections.jsonl"),
];

/// Thread-safe, file-backed memory store using JSONL files.
pub struct MemoryStore {
    data_dir: PathBuf,
    _lock: RwLock<()>,
}

impl MemoryStore {
    /// Create a new store rooted at `data_dir/data`.
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir: data_dir.join("data"),
            _lock: RwLock::new(()),
        }
    }

    /// Build the directory path for a specific character + user pair.
    fn store_path(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir
            .join(character_id)
            .join(user_id)
            .join("memory")
    }

    /// Ensure the on-disk directory and empty JSONL files exist.
    pub fn ensure_store(&self, character_id: &str, user_id: &str) -> Result<()> {
        let dir = self.store_path(character_id, user_id);
        std::fs::create_dir_all(&dir)?;
        for (_kind, filename) in &MEMORY_FILES {
            let path = dir.join(filename);
            if !path.exists() {
                std::fs::File::create(&path)?;
            }
        }
        Ok(())
    }

    /// Validate that `memory_type` is one of the known categories.
    fn validate_type(memory_type: &str) -> Result<()> {
        if MEMORY_FILES.iter().any(|(k, _)| *k == memory_type) {
            Ok(())
        } else {
            Err(MeuxeError::Memory(format!(
                "Invalid memory type: {memory_type}"
            )))
        }
    }

    /// Look up the JSONL filename for a given memory type.
    fn filename_for(memory_type: &str) -> &'static str {
        MEMORY_FILES
            .iter()
            .find(|(k, _)| *k == memory_type)
            .map(|(_, f)| *f)
            .unwrap()
    }

    /// Append a new memory entry, returning the created `Memory`.
    pub fn append(
        &self,
        character_id: &str,
        user_id: &str,
        memory_type: &str,
        summary: &str,
        importance: f64,
        tags: Vec<String>,
    ) -> Result<Memory> {
        Self::validate_type(memory_type)?;
        self.ensure_store(character_id, user_id)?;

        let memory = Memory {
            id: Uuid::new_v4().to_string(),
            ts: Utc::now(),
            memory_type: memory_type.to_string(),
            summary: summary.to_string(),
            importance,
            tags,
            metadata: serde_json::Value::Object(serde_json::Map::new()),
        };

        let _guard = self
            ._lock
            .write()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;

        let dir = self.store_path(character_id, user_id);
        let path = dir.join(Self::filename_for(memory_type));
        let mut file = std::fs::OpenOptions::new().append(true).open(&path)?;
        let line = serde_json::to_string(&memory)?;
        writeln!(file, "{line}")?;

        Ok(memory)
    }

    /// List memories, optionally filtered by type, sorted newest-first,
    /// returning at most `limit` entries.
    pub fn list(
        &self,
        character_id: &str,
        user_id: &str,
        memory_type: Option<&str>,
        limit: usize,
    ) -> Result<Vec<Memory>> {
        if let Some(mt) = memory_type {
            Self::validate_type(mt)?;
        }

        let dir = self.store_path(character_id, user_id);
        if !dir.exists() {
            return Ok(vec![]);
        }

        let _guard = self
            ._lock
            .read()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;

        let types_to_read: Vec<&str> = match memory_type {
            Some(mt) => vec![mt],
            None => MEMORY_FILES.iter().map(|(k, _)| *k).collect(),
        };

        let mut memories: Vec<Memory> = Vec::new();
        for mt in types_to_read {
            let path = dir.join(Self::filename_for(mt));
            if !path.exists() {
                continue;
            }
            let file = std::fs::File::open(&path)?;
            let reader = std::io::BufReader::new(file);
            for line in reader.lines() {
                let line = line?;
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let mem: Memory = serde_json::from_str(trimmed)?;
                memories.push(mem);
            }
        }

        memories.sort_by_key(|m| Reverse(m.ts));
        memories.truncate(limit);
        Ok(memories)
    }

    /// Clear memories: if `memory_type` is given, truncate that file only;
    /// otherwise truncate all JSONL files.
    pub fn clear(
        &self,
        character_id: &str,
        user_id: &str,
        memory_type: Option<&str>,
    ) -> Result<()> {
        if let Some(mt) = memory_type {
            Self::validate_type(mt)?;
        }

        let dir = self.store_path(character_id, user_id);
        if !dir.exists() {
            return Ok(());
        }

        let _guard = self
            ._lock
            .write()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))?;

        let types_to_clear: Vec<&str> = match memory_type {
            Some(mt) => vec![mt],
            None => MEMORY_FILES.iter().map(|(k, _)| *k).collect(),
        };

        for mt in types_to_clear {
            let path = dir.join(Self::filename_for(mt));
            if path.exists() {
                std::fs::File::create(&path)?; // truncates
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_append_and_list() {
        let tmp = tempfile::tempdir().unwrap();
        let store = MemoryStore::new(tmp.path().to_path_buf());

        store
            .append(
                "char1",
                "user1",
                "semantic",
                "User likes Rust",
                0.9,
                vec!["preferences".into()],
            )
            .unwrap();
        store
            .append(
                "char1",
                "user1",
                "episodic",
                "Discussed project plan",
                0.7,
                vec!["project".into()],
            )
            .unwrap();
        store
            .append(
                "char1",
                "user1",
                "semantic",
                "User's name is Alice",
                1.0,
                vec!["identity".into()],
            )
            .unwrap();

        // List all
        let all = store.list("char1", "user1", None, 100).unwrap();
        assert_eq!(all.len(), 3);

        // List filtered
        let semantic = store.list("char1", "user1", Some("semantic"), 100).unwrap();
        assert_eq!(semantic.len(), 2);

        // List with limit
        let limited = store.list("char1", "user1", None, 2).unwrap();
        assert_eq!(limited.len(), 2);
        // Should be newest first
        assert!(limited[0].ts >= limited[1].ts);
    }

    #[test]
    fn test_clear_memories() {
        let tmp = tempfile::tempdir().unwrap();
        let store = MemoryStore::new(tmp.path().to_path_buf());

        store
            .append("char1", "user1", "semantic", "Fact A", 0.8, vec![])
            .unwrap();
        store
            .append("char1", "user1", "episodic", "Event B", 0.7, vec![])
            .unwrap();

        // Clear only semantic
        store.clear("char1", "user1", Some("semantic")).unwrap();
        let semantic = store.list("char1", "user1", Some("semantic"), 100).unwrap();
        assert_eq!(semantic.len(), 0);
        let episodic = store.list("char1", "user1", Some("episodic"), 100).unwrap();
        assert_eq!(episodic.len(), 1);

        // Clear all
        store.clear("char1", "user1", None).unwrap();
        let all = store.list("char1", "user1", None, 100).unwrap();
        assert_eq!(all.len(), 0);
    }

    #[test]
    fn test_invalid_memory_type() {
        let tmp = tempfile::tempdir().unwrap();
        let store = MemoryStore::new(tmp.path().to_path_buf());

        let result = store.append("char1", "user1", "invalid_type", "test", 0.5, vec![]);
        assert!(result.is_err());

        let result = store.list("char1", "user1", Some("invalid_type"), 10);
        assert!(result.is_err());

        let result = store.clear("char1", "user1", Some("invalid_type"));
        assert!(result.is_err());
    }
}
