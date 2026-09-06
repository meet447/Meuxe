//! Agent Client Protocol (ACP) integration — companion shell as ACP *client*.
//!
//! See `docs/DIRECTION.md` and `docs/ROADMAP.md`. Phase 2 will spawn the user's
//! CLI agent (Claude Code, Codex, etc.) and bridge session events to the React UI.

mod run;
mod tools;

pub use run::{ensure_companion_home, run_acp_chat_stream, RunAcpChatStreamParams};
