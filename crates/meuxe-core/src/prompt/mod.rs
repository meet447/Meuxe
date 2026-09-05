use crate::character::{self, CharacterLoader};
use crate::error::Result;
use crate::expressions::{ExpressionManager, GLOBAL_EXPRESSIONS};
use crate::llm::types::ChatMessage;
use crate::memory::{format_memory_context, CompanionMemory, MemorySnapshot};
use crate::session::SessionStore;

pub const DEFAULT_HISTORY_LIMIT: usize = 20;

pub struct ChatPromptResult {
    pub messages: Vec<ChatMessage>,
    pub system_prompt: String,
    pub memory_context: String,
    pub snapshot: MemorySnapshot,
}

/// Inputs for [`build_chat_prompt`] (keeps the public API readable for Clippy).
pub struct ChatPromptParams<'a> {
    pub character_loader: &'a CharacterLoader,
    pub session_store: &'a SessionStore,
    pub memory: &'a CompanionMemory,
    pub _expression_manager: &'a ExpressionManager,
    pub character_id: &'a str,
    pub user_id: &'a str,
    pub user_name: &'a str,
    pub user_message: &'a str,
    pub history_limit: Option<usize>,
}

pub fn build_chat_prompt(p: ChatPromptParams<'_>) -> Result<ChatPromptResult> {
    let history_limit = p.history_limit.unwrap_or(DEFAULT_HISTORY_LIMIT);

    let char_data = p.character_loader.load_character(p.character_id)?;

    let global_exprs: Vec<&str> = GLOBAL_EXPRESSIONS.to_vec();
    let system_prompt = character::build_system_prompt(&char_data, &global_exprs);

    let snapshot = p.memory.snapshot(p.character_id, p.user_id)?;
    let memory_context = format_memory_context(&snapshot, p.user_name, p.user_message);

    let history = p
        .session_store
        .load_history(p.character_id, p.user_id, Some(history_limit))?;

    let mut messages = Vec::new();
    messages.push(ChatMessage::text("system", &system_prompt));

    if !memory_context.is_empty() {
        messages.push(ChatMessage::text("system", &memory_context));
    }

    for msg in &history {
        messages.push(ChatMessage::text(&msg.role, &msg.content));
    }

    messages.push(ChatMessage::text("user", p.user_message));

    Ok(ChatPromptResult {
        messages,
        system_prompt,
        memory_context,
        snapshot,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_build_chat_prompt() {
        let tmp = TempDir::new().unwrap();
        let char_loader = CharacterLoader::new(tmp.path());
        let session_store = SessionStore::new(tmp.path());
        let memory = CompanionMemory::new(tmp.path());
        let expr_mgr = ExpressionManager::new(tmp.path());

        char_loader
            .create_character(
                "Test",
                "A helpful companion",
                "model1",
                "jp_001",
                "friendly",
                "casual",
                "natural",
                "User",
                "A dev",
            )
            .unwrap();

        let result = build_chat_prompt(ChatPromptParams {
            character_loader: &char_loader,
            session_store: &session_store,
            memory: &memory,
            _expression_manager: &expr_mgr,
            character_id: "test",
            user_id: "default-user",
            user_name: "User",
            user_message: "Hello there!",
            history_limit: None,
        })
        .unwrap();

        assert!(result.messages.len() >= 2);
        assert_eq!(result.messages[0].role, "system");
        assert_eq!(result.messages.last().unwrap().role, "user");
        assert_eq!(
            result.messages.last().unwrap().content_str(),
            "Hello there!"
        );
        assert!(result.system_prompt.contains("EXPRESSION RULES"));
        assert!(result.memory_context.contains("How you feel right now"));
    }
}
