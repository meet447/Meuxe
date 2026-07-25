use crate::character::{self, CharacterLoader};
use crate::error::Result;
use crate::expressions::{ExpressionManager, GLOBAL_EXPRESSIONS};
use crate::llm::types::ChatMessage;
use crate::memory::retriever;
use crate::memory::store::MemoryStore;
use crate::memory_vault::MemoryVault;
use crate::session::SessionStore;

pub const DEFAULT_HISTORY_LIMIT: usize = 20;
pub const DEFAULT_MEMORY_LIMIT: usize = 4;

pub struct ChatPromptResult {
    pub messages: Vec<ChatMessage>,
    pub system_prompt: String,
    pub memory_prompt: String,
    pub relationship_prompt: String,
}

/// Inputs for [`build_chat_prompt`] (keeps the public API readable for Clippy).
pub struct ChatPromptParams<'a> {
    pub character_loader: &'a CharacterLoader,
    pub session_store: &'a SessionStore,
    pub memory_store: &'a MemoryStore,
    pub memory_vault: Option<&'a MemoryVault>,
    pub _expression_manager: &'a ExpressionManager,
    pub character_id: &'a str,
    pub user_id: &'a str,
    pub user_message: &'a str,
    pub history_limit: Option<usize>,
    pub memory_limit: Option<usize>,
}

pub fn build_chat_prompt(p: ChatPromptParams<'_>) -> Result<ChatPromptResult> {
    let history_limit = p.history_limit.unwrap_or(DEFAULT_HISTORY_LIMIT);
    let memory_limit = p.memory_limit.unwrap_or(DEFAULT_MEMORY_LIMIT);

    // 1. Load character
    let char_data = p.character_loader.load_character(p.character_id)?;

    // 2. Build system prompt with global expressions
    let global_exprs: Vec<&str> = GLOBAL_EXPRESSIONS.to_vec();
    let system_prompt = character::build_system_prompt(&char_data, &global_exprs);

    // 3. Ensure memory store exists, list all memories, retrieve relevant ones
    let _ = p.memory_store.ensure_store(p.character_id, p.user_id);
    let relationship_prompt = p
        .memory_vault
        .and_then(|vault| {
            vault
                .format_relationship_prompt(p.character_id, p.user_id)
                .ok()
        })
        .unwrap_or_default();
    let memory_prompt = if let Some(vault) = p.memory_vault {
        let vault_prompt = vault
            .format_memory_prompt(p.character_id, p.user_id, p.user_message, memory_limit)
            .unwrap_or_default();
        if vault_prompt.is_empty() {
            let all_memories = p.memory_store.list(p.character_id, p.user_id, None, 100)?;
            let relevant =
                retriever::retrieve_relevant(p.user_message, &all_memories, memory_limit);
            retriever::format_memory_prompt(&relevant)
        } else {
            vault_prompt
        }
    } else {
        let all_memories = p.memory_store.list(p.character_id, p.user_id, None, 100)?;
        let relevant = retriever::retrieve_relevant(p.user_message, &all_memories, memory_limit);
        retriever::format_memory_prompt(&relevant)
    };

    // 5. Load session history
    let history = p
        .session_store
        .load_history(p.character_id, p.user_id, Some(history_limit))?;

    // 6. Assemble messages array
    let mut messages = Vec::new();

    // System message (system_prompt + tools context)
    let tools_context = "\n\n## TOOL CAPABILITIES\n\nYou have access to tools that let you interact with the user's computer. You can read files, write files, search the web, run commands, organize the desktop, and more. Use tools when the user asks you to do something on their machine, or when you need information to answer their question.\n\nIMPORTANT RULES:\n- ALWAYS use the provided tool functions to perform actions. NEVER write out function calls as text.\n- When you need to perform an action, call the appropriate tool directly — do not describe what you would call.\n- You can call multiple tools in a single response if needed.\n- When using tools, maintain your personality and expressions. Briefly explain what you're about to do before calling a tool.\n- For multi-step tasks, call one tool at a time and use the result to decide the next step.\n- After completing a task, briefly suggest 1-2 related follow-up actions the user might want. For example: after organizing the desktop, suggest cleaning Downloads too. After reading a file, suggest summarizing or editing it. Keep suggestions short and natural — one sentence max.";
    let full_system = format!("{system_prompt}{tools_context}");
    messages.push(ChatMessage::text("system", &full_system));

    // System message (relationship state) — the vault owns this once enabled.
    if !relationship_prompt.is_empty() {
        messages.push(ChatMessage::text("system", &relationship_prompt));
    }

    // System message (memory_prompt) — only if non-empty
    if !memory_prompt.is_empty() {
        messages.push(ChatMessage::text("system", &memory_prompt));
    }

    // All history messages
    for msg in &history {
        messages.push(ChatMessage::text(&msg.role, &msg.content));
    }

    // Current user message
    messages.push(ChatMessage::text("user", p.user_message));

    Ok(ChatPromptResult {
        messages,
        system_prompt,
        memory_prompt,
        relationship_prompt,
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
        let memory_store = MemoryStore::new(tmp.path().to_path_buf());
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
            memory_store: &memory_store,
            memory_vault: None,
            _expression_manager: &expr_mgr,
            character_id: "test",
            user_id: "default-user",
            user_message: "Hello there!",
            history_limit: None,
            memory_limit: None,
        })
        .unwrap();

        assert!(result.messages.len() >= 2); // system + user at minimum
        assert_eq!(result.messages[0].role, "system");
        assert_eq!(result.messages.last().unwrap().role, "user");
        assert_eq!(
            result.messages.last().unwrap().content_str(),
            "Hello there!"
        );
        assert!(result.system_prompt.contains("EXPRESSION RULES"));
    }
}
