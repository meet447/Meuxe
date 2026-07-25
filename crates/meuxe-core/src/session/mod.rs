pub mod types;

pub use types::SessionMessage;

use crate::Result;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub struct SessionStore {
    data_dir: PathBuf,
    _lock: RwLock<()>,
}

impl SessionStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.join("data"),
            _lock: RwLock::new(()),
        }
    }

    fn session_path(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir
            .join("users")
            .join(user_id)
            .join("sessions")
            .join(format!("{character_id}.jsonl"))
    }

    pub fn load_history(
        &self,
        character_id: &str,
        user_id: &str,
        limit: Option<usize>,
    ) -> Result<Vec<SessionMessage>> {
        let _guard = self
            ._lock
            .read()
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        let path = self.session_path(character_id, user_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = fs::File::open(&path)?;
        let reader = BufReader::new(file);
        let mut messages: Vec<SessionMessage> = Vec::new();

        for line in reader.lines() {
            let line = line?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let msg: SessionMessage = serde_json::from_str(trimmed)?;
            messages.push(msg);
        }

        if let Some(n) = limit {
            if messages.len() > n {
                messages = messages.split_off(messages.len() - n);
            }
        }

        Ok(messages)
    }

    pub fn append_message(
        &self,
        character_id: &str,
        user_id: &str,
        role: &str,
        content: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<()> {
        let _guard = self
            ._lock
            .write()
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        let path = self.session_path(character_id, user_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let msg = SessionMessage {
            ts: chrono::Utc::now().to_rfc3339(),
            role: role.to_string(),
            content: content.to_string(),
            metadata,
        };

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;

        let json = serde_json::to_string(&msg)?;
        writeln!(file, "{json}")?;

        Ok(())
    }

    pub fn clear_history(&self, character_id: &str, user_id: &str) -> Result<()> {
        let _guard = self
            ._lock
            .write()
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        let path = self.session_path(character_id, user_id);
        if path.exists() {
            fs::remove_file(&path)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_empty_session() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        let history = store.load_history("char1", "user1", None).unwrap();
        assert!(history.is_empty());
    }

    #[test]
    fn test_append_and_load() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());

        store
            .append_message("char1", "user1", "user", "Hello!", None)
            .unwrap();
        store
            .append_message("char1", "user1", "assistant", "Hi there!", None)
            .unwrap();

        let history = store.load_history("char1", "user1", None).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].role, "user");
        assert_eq!(history[0].content, "Hello!");
        assert_eq!(history[1].role, "assistant");
        assert_eq!(history[1].content, "Hi there!");
    }

    #[test]
    fn test_load_with_limit() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());

        for i in 0..10 {
            store
                .append_message("char1", "user1", "user", &format!("msg {i}"), None)
                .unwrap();
        }

        let history = store.load_history("char1", "user1", Some(3)).unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].content, "msg 7");
        assert_eq!(history[1].content, "msg 8");
        assert_eq!(history[2].content, "msg 9");
    }

    #[test]
    fn test_clear_history() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());

        store
            .append_message("char1", "user1", "user", "Hello!", None)
            .unwrap();

        let history = store.load_history("char1", "user1", None).unwrap();
        assert_eq!(history.len(), 1);

        store.clear_history("char1", "user1").unwrap();

        let history = store.load_history("char1", "user1", None).unwrap();
        assert!(history.is_empty());
    }
}
