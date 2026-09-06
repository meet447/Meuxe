pub mod agent_setup;
pub mod characters;
pub mod chat;
pub mod config;
pub mod expressions;
pub mod memory;
pub mod tts;
pub mod user;
pub mod voice;

/// Reject ids that are unsafe for filesystem path segments before command work.
pub(crate) fn require_id(id: &str) -> Result<&str, String> {
    meuxe_core::ids::validate_id(id).map_err(|e| e.to_string())
}
