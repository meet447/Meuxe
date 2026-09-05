mod notes;
mod prompt;
mod store;
mod types;

pub use notes::{parse_turn_notes, TrailerSplitter};
pub use prompt::{format_memory_context, TURN_NOTES_INSTRUCTIONS};
pub use store::CompanionMemory;
pub use types::{
    is_negative_mood, stage_for, Bond, BondView, Fact, FactKind, FactSource, MemorySnapshot,
    Moment, Mood, MoodNote, Thread, TurnNotes,
};
