use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMemory {
    pub id: String,
    pub ts: DateTime<Utc>,
    pub character_id: String,
    pub user_id: String,
    #[serde(rename = "type")]
    pub memory_type: String,
    pub summary: String,
    pub importance: f64,
    pub tags: Vec<String>,
    pub source_kind: String,
    pub source_id: Option<String>,
    pub provenance: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub topic: Option<String>,
    pub metadata: serde_json::Value,
}

/// Frontend-friendly memory record. Keeps `type` compatibility with the legacy
/// JSONL API while adding source/provenance fields for the vault UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMemoryRecord {
    pub id: String,
    pub ts: String,
    pub character_id: String,
    #[serde(rename = "type")]
    pub memory_type: String,
    pub summary: String,
    pub importance: f64,
    pub tags: Vec<String>,
    pub source_kind: String,
    pub source_id: Option<String>,
    pub provenance: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub topic: Option<String>,
    pub metadata: serde_json::Value,
}

impl From<VaultMemory> for VaultMemoryRecord {
    fn from(memory: VaultMemory) -> Self {
        Self {
            id: memory.id,
            ts: memory.ts.to_rfc3339(),
            character_id: memory.character_id,
            memory_type: memory.memory_type,
            summary: memory.summary,
            importance: memory.importance,
            tags: memory.tags,
            source_kind: memory.source_kind,
            source_id: memory.source_id,
            provenance: memory.provenance,
            pinned: memory.pinned,
            topic: memory.topic,
            metadata: memory.metadata,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySourceItem {
    pub id: String,
    pub ts: DateTime<Utc>,
    pub character_id: String,
    pub user_id: String,
    pub source_kind: String,
    pub title: String,
    pub body_markdown: String,
    pub content_hash: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySourceRecord {
    pub id: String,
    pub ts: String,
    pub character_id: String,
    pub source_kind: String,
    pub title: String,
    pub content_hash: String,
    pub metadata: serde_json::Value,
}

impl From<MemorySourceItem> for MemorySourceRecord {
    fn from(source: MemorySourceItem) -> Self {
        Self {
            id: source.id,
            ts: source.ts.to_rfc3339(),
            character_id: source.character_id,
            source_kind: source.source_kind,
            title: source.title,
            content_hash: source.content_hash,
            metadata: source.metadata,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicSummary {
    pub topic: String,
    pub count: usize,
    pub summary: String,
    pub latest_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposioToolkitStatus {
    pub slug: String,
    pub name: String,
    pub connected: bool,
    pub status: String,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipSnapshot {
    pub character_id: String,
    pub user_id: String,
    pub mood: String,
    pub trust: f64,
    pub affection: f64,
    pub energy: f64,
    pub relationship_summary: String,
    pub updated_at: String,
}

impl RelationshipSnapshot {
    pub fn neutral(character_id: &str, user_id: &str) -> Self {
        Self {
            character_id: character_id.to_string(),
            user_id: user_id.to_string(),
            mood: "neutral".to_string(),
            trust: 0.0,
            affection: 0.0,
            energy: 0.7,
            relationship_summary: "still early and getting to know each other".to_string(),
            updated_at: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamRun {
    pub id: String,
    pub character_id: String,
    pub user_id: String,
    pub status: String,
    pub summary: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MemoryVaultOverview {
    pub total_memories: usize,
    pub total_sources: usize,
    pub total_dreams: usize,
    pub semantic_count: usize,
    pub episodic_count: usize,
    pub reflection_count: usize,
    pub latest_memory_at: Option<String>,
    pub latest_dream_at: Option<String>,
    pub vault_path: String,
    pub database_path: String,
    pub relationship: Option<RelationshipSnapshot>,
    #[serde(default)]
    pub pinned_count: usize,
    #[serde(default)]
    pub topic_count: usize,
    #[serde(default)]
    pub latest_source_at: Option<String>,
}
