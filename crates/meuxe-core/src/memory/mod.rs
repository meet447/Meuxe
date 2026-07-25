pub mod extractor;
pub mod retriever;
pub mod store;

use crate::Result;
use store::{Memory, MemoryStore};

/// Process a user/assistant exchange: extract memories from the user message,
/// deduplicate against existing ones, and optionally add a reflection if the
/// user expressed gratitude.
pub fn remember_exchange(
    store: &MemoryStore,
    character_id: &str,
    user_id: &str,
    user_message: &str,
    assistant_message: &str,
) -> Result<Vec<Memory>> {
    store.ensure_store(character_id, user_id)?;

    let extracted = extractor::extract_memories(user_message);
    let existing = store.list(character_id, user_id, None, 1000)?;

    let mut saved: Vec<Memory> = Vec::new();

    for candidate in &extracted {
        // Deduplicate: skip if an existing memory has the same normalised summary
        let normalised = candidate.summary.to_lowercase();
        let is_duplicate = existing
            .iter()
            .any(|m| m.summary.to_lowercase() == normalised);
        if is_duplicate {
            continue;
        }

        let mem = store.append(
            character_id,
            user_id,
            &candidate.memory_type,
            &candidate.summary,
            candidate.importance,
            candidate.tags.clone(),
        )?;
        saved.push(mem);
    }

    // If the user expressed gratitude, store a reflection about the interaction
    if extractor::check_positive_response(user_message) {
        let summary = format!(
            "User found the response helpful: \"{}\"",
            truncate(assistant_message, 120)
        );
        let mem = store.append(
            character_id,
            user_id,
            "reflections",
            &summary,
            0.6,
            vec!["positive_feedback".into()],
        )?;
        saved.push(mem);
    }

    Ok(saved)
}

/// Truncate a string to at most `max_len` characters, appending "..." if cut.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}
