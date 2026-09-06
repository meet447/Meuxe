pub mod types;

pub use types::SessionMessage;

use crate::ids::validate_id;
use crate::Result;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

const TAIL_READ_CHUNK: usize = 64 * 1024;

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

    fn session_path(&self, character_id: &str, user_id: &str) -> Result<PathBuf> {
        validate_id(character_id)?;
        validate_id(user_id)?;
        Ok(self
            .data_dir
            .join("users")
            .join(user_id)
            .join("sessions")
            .join(format!("{character_id}.jsonl")))
    }

    pub fn load_history(
        &self,
        character_id: &str,
        user_id: &str,
        limit: Option<usize>,
    ) -> Result<Vec<SessionMessage>> {
        if let Some(n) = limit {
            return self.load_history_tail(character_id, user_id, n);
        }

        let _guard = self
            ._lock
            .read()
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        let path = self.session_path(character_id, user_id)?;
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = fs::File::open(&path)?;
        let reader = BufReader::new(file);
        let mut messages: Vec<SessionMessage> = Vec::new();
        let mut line_number = 0u64;

        for line in reader.lines() {
            line_number += 1;
            let line = line?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            match serde_json::from_str::<SessionMessage>(trimmed) {
                Ok(msg) => messages.push(msg),
                Err(e) => {
                    eprintln!(
                        "session: skipping corrupt line {} in {}: {}",
                        line_number,
                        path.display(),
                        e
                    );
                }
            }
        }

        Ok(messages)
    }

    pub fn load_history_tail(
        &self,
        character_id: &str,
        user_id: &str,
        limit: usize,
    ) -> Result<Vec<SessionMessage>> {
        let _guard = self
            ._lock
            .read()
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        let path = self.session_path(character_id, user_id)?;
        if !path.exists() {
            return Ok(Vec::new());
        }

        if limit == 0 {
            return Ok(Vec::new());
        }

        let raw_lines = read_tail_lines(&path, limit)?;
        let mut messages = Vec::with_capacity(raw_lines.len());
        for line in raw_lines {
            match serde_json::from_str::<SessionMessage>(&line) {
                Ok(msg) => messages.push(msg),
                Err(e) => {
                    let line_number = line_number_for_content(&path, &line).unwrap_or(0);
                    eprintln!(
                        "session: skipping corrupt line {} in {}: {}",
                        line_number,
                        path.display(),
                        e
                    );
                }
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

        let path = self.session_path(character_id, user_id)?;
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

        let path = self.session_path(character_id, user_id)?;
        if path.exists() {
            fs::remove_file(&path)?;
        }

        Ok(())
    }
}

fn read_tail_lines(path: &Path, limit: usize) -> Result<Vec<String>> {
    let mut file = File::open(path)?;
    let file_len = file.metadata()?.len();
    if file_len == 0 {
        return Ok(Vec::new());
    }

    let mut pos = file_len;
    let mut carry = Vec::new();
    let mut collected: Vec<Vec<u8>> = Vec::new();

    while pos > 0 && collected.len() < limit {
        let chunk_size = std::cmp::min(TAIL_READ_CHUNK as u64, pos);
        pos -= chunk_size;
        file.seek(SeekFrom::Start(pos))?;
        let mut chunk = vec![0u8; chunk_size as usize];
        file.read_exact(&mut chunk)?;

        if !carry.is_empty() {
            chunk.extend_from_slice(&carry);
            carry.clear();
        }

        let mut end = chunk.len();
        while end > 0 && collected.len() < limit {
            match chunk[..end].iter().rposition(|byte| *byte == b'\n') {
                Some(newline_at) => {
                    let line = &chunk[newline_at + 1..end];
                    end = newline_at;
                    if !line.is_empty() {
                        collected.push(line.to_vec());
                    }
                }
                None => {
                    carry = chunk[..end].to_vec();
                    break;
                }
            }
        }
    }

    if pos == 0 && !carry.is_empty() && collected.len() < limit {
        collected.push(carry);
    }

    collected.reverse();

    Ok(collected
        .into_iter()
        .filter_map(|bytes| {
            let text = String::from_utf8(bytes).ok()?;
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect())
}

fn line_number_for_content(path: &Path, needle: &str) -> Result<u64> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    for (idx, line) in reader.lines().enumerate() {
        let line = line?;
        if line.trim() == needle {
            return Ok(idx as u64 + 1);
        }
    }
    Ok(0)
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

    #[test]
    fn test_load_rejects_invalid_ids() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        assert!(store.load_history("../x", "user1", None).is_err());
        assert!(store.load_history("char1", "a/b", None).is_err());
    }

    #[test]
    fn test_load_skips_corrupt_lines() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        let path = tmp.path().join("data/users/user1/sessions/char1.jsonl");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();

        let valid1 = serde_json::json!({
            "ts": "2026-01-01T00:00:00Z",
            "role": "user",
            "content": "first"
        });
        let valid2 = serde_json::json!({
            "ts": "2026-01-01T00:01:00Z",
            "role": "assistant",
            "content": "second"
        });
        std::fs::write(&path, format!("{valid1}\nNOT VALID JSON\n{valid2}\n")).unwrap();

        let history = store.load_history("char1", "user1", None).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].content, "first");
        assert_eq!(history[1].content, "second");
    }

    fn write_session_line(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        let msg = serde_json::json!({
            "ts": "2026-01-01T00:00:00Z",
            "role": "user",
            "content": content
        });
        writeln!(file, "{msg}").unwrap();
    }

    #[test]
    fn test_load_history_tail_small_file() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        for i in 0..5 {
            store
                .append_message("char1", "user1", "user", &format!("msg {i}"), None)
                .unwrap();
        }

        let tail = store.load_history_tail("char1", "user1", 3).unwrap();
        assert_eq!(tail.len(), 3);
        assert_eq!(tail[0].content, "msg 2");
        assert_eq!(tail[2].content, "msg 4");

        let via_load = store.load_history("char1", "user1", Some(3)).unwrap();
        assert_eq!(via_load.len(), tail.len());
        for (a, b) in via_load.iter().zip(tail.iter()) {
            assert_eq!(a.content, b.content);
        }
    }

    #[test]
    fn test_load_history_tail_limit_larger_than_file() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        store
            .append_message("char1", "user1", "user", "only one", None)
            .unwrap();

        let tail = store.load_history_tail("char1", "user1", 50).unwrap();
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].content, "only one");
    }

    #[test]
    fn test_load_history_tail_across_chunk_boundary() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        let path = tmp.path().join("data/users/user1/sessions/char1.jsonl");

        let padding = "x".repeat(TAIL_READ_CHUNK - 20);
        write_session_line(&path, &padding);
        for i in 0..5 {
            write_session_line(&path, &format!("tail msg {i}"));
        }

        let tail = store.load_history_tail("char1", "user1", 3).unwrap();
        assert_eq!(tail.len(), 3);
        assert_eq!(tail[0].content, "tail msg 2");
        assert_eq!(tail[2].content, "tail msg 4");
    }

    #[test]
    fn test_load_history_tail_skips_corrupt_line() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        let path = tmp.path().join("data/users/user1/sessions/char1.jsonl");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();

        let valid1 = serde_json::json!({
            "ts": "2026-01-01T00:00:00Z",
            "role": "user",
            "content": "good one"
        });
        let valid2 = serde_json::json!({
            "ts": "2026-01-01T00:02:00Z",
            "role": "assistant",
            "content": "good two"
        });
        std::fs::write(&path, format!("{valid1}\nNOT VALID JSON\n{valid2}\n")).unwrap();

        let tail = store.load_history_tail("char1", "user1", 5).unwrap();
        assert_eq!(tail.len(), 2);
        assert_eq!(tail[0].content, "good one");
        assert_eq!(tail[1].content, "good two");
    }
}
