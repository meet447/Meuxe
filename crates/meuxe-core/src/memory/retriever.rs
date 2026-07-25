use chrono::Utc;

use super::extractor::extract_tokens;
use super::store::Memory;

/// Score and rank `memories` against `query`, returning the top `limit`.
///
/// Scoring formula:
///   token_overlap * 1.6 + tag_overlap * 1.2 + importance + recency_bonus
///
/// `recency_bonus` = max(0, 0.3 - min(age_days / 365, 0.3))
pub fn retrieve_relevant(query: &str, memories: &[Memory], limit: usize) -> Vec<Memory> {
    if memories.is_empty() {
        return vec![];
    }

    let query_tokens = extract_tokens(query);
    let now = Utc::now();

    let mut scored: Vec<(f64, &Memory)> = memories
        .iter()
        .map(|mem| {
            let mem_tokens = extract_tokens(&mem.summary);

            // Token overlap: fraction of query tokens found in the memory
            let token_overlap = if query_tokens.is_empty() {
                0.0
            } else {
                let overlap = query_tokens.intersection(&mem_tokens).count() as f64;
                overlap / query_tokens.len() as f64
            };

            // Tag overlap: fraction of memory tags found among query tokens
            let tag_overlap = if mem.tags.is_empty() {
                0.0
            } else {
                let tag_hits = mem
                    .tags
                    .iter()
                    .filter(|t| query_tokens.contains(&t.to_lowercase()))
                    .count() as f64;
                tag_hits / mem.tags.len() as f64
            };

            // Recency bonus
            let age_days = (now - mem.ts).num_seconds().max(0) as f64 / 86400.0;
            let recency_bonus = (0.3 - (age_days / 365.0).min(0.3)).max(0.0);

            let score = token_overlap * 1.6 + tag_overlap * 1.2 + mem.importance + recency_bonus;

            (score, mem)
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    scored.into_iter().map(|(_, m)| m.clone()).collect()
}

/// Format a list of memories into a prompt section for the LLM.
pub fn format_memory_prompt(memories: &[Memory]) -> String {
    if memories.is_empty() {
        return String::new();
    }

    let mut out = String::from("You have relevant long-term memories about this user:\n");
    for mem in memories {
        out.push_str(&format!("- [{}] {}\n", mem.memory_type, mem.summary));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn make_memory(summary: &str, memory_type: &str, importance: f64, tags: Vec<&str>) -> Memory {
        Memory {
            id: uuid::Uuid::new_v4().to_string(),
            ts: Utc::now(),
            memory_type: memory_type.to_string(),
            summary: summary.to_string(),
            importance,
            tags: tags.into_iter().map(String::from).collect(),
            metadata: serde_json::Value::Object(serde_json::Map::new()),
        }
    }

    #[test]
    fn test_retrieve_relevant() {
        let memories = vec![
            make_memory(
                "User likes Rust programming",
                "semantic",
                0.8,
                vec!["preferences"],
            ),
            make_memory(
                "User deployed the API server",
                "episodic",
                0.68,
                vec!["project_context"],
            ),
            make_memory("User's name is Alice", "semantic", 1.0, vec!["identity"]),
        ];

        let results = retrieve_relevant("Rust programming language", &memories, 2);
        assert_eq!(results.len(), 2);
        // The Rust memory should rank highest due to token overlap
        assert!(results[0].summary.contains("Rust"));
    }

    #[test]
    fn test_retrieve_empty() {
        let results = retrieve_relevant("anything", &[], 10);
        assert!(results.is_empty());
    }

    #[test]
    fn test_format_memory_prompt() {
        let memories = vec![
            make_memory("User likes Rust", "semantic", 0.8, vec![]),
            make_memory("Discussed deploy", "episodic", 0.7, vec![]),
        ];

        let prompt = format_memory_prompt(&memories);
        assert!(prompt.contains("long-term memories"));
        assert!(prompt.contains("[semantic] User likes Rust"));
        assert!(prompt.contains("[episodic] Discussed deploy"));

        // Empty list returns empty string
        assert!(format_memory_prompt(&[]).is_empty());
    }
}
