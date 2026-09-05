# Companion memory

How Meuxe remembers you and how your companion feels about you. This document is the source of truth for the memory system; the code lives in `crates/meuxe-core/src/memory/`.

## Why the old system was replaced

The previous implementation grew three overlapping stores (`memory/` JSONL, `memory_vault/` SQLite plus a Markdown projection, and an unused `state/` store), each with its own copy of the same keyword heuristics. Every chat turn ran two extraction pipelines and two relationship updaters. The problems were structural, not tuning:

- **Memories were sentences, not knowledge.** A regex matched "I am ..." and stored the raw sentence. "I'm exhausted" became an identity fact. Any sentence containing "backend" became an episodic memory. The store filled with noise, and retrieval over noise is still noise.
- **Feelings did not persist.** Mood was one of three strings ("warm", "concerned", "neutral") overwritten on every message by a word list. Say "thanks" and any hurt evaporated. There was no cause, no intensity, no memory of what would make it better.
- **No sense of time.** The companion did not know you had been gone for a week, or that the last thing you talked about was a job interview.
- **Product surface was a database admin panel.** Five tabs, source ingestion, transcripts, folder import, zip export, dream runs, topic summaries, FTS. `DIRECTION.md` asks for a companion, not a vault UI.
- **The mind was not involved.** Meuxe's architecture puts the reasoning in the user's CLI agent over ACP, but memory was decided by regexes in Rust that never see meaning.

## What a companion actually needs to remember

Grok's Companions (Ani, Mika, Valentine) set the bar the user cares about: a visible affection level that rises with real conversation and cools with low effort or absence, and a character that stays in mood. Their weak point, widely reported, was memory: Ani would forget a dog's name in two weeks. Meuxe should match the emotional progression and beat the recall.

A companion needs four things, and only four:

| Layer | Question it answers | Shape | Who writes it |
|---|---|---|---|
| **Facts** | Who are you? | Small set of durable statements about the user (name, people, pets, work, preferences, boundaries). Deduplicated, editable, whole set fits in the prompt. | The agent (end of turn), the user (Settings) |
| **Moments** | What have we been through? | One dated sentence per meaningful exchange, with how the companion felt. Used for "remember when" and for noticing patterns. | The agent (end of turn) |
| **Bond** | How do I feel about you right now? | Closeness (long run), current mood with cause and what would help, open threads, last time we talked. Persists across sessions; decays with real time; does not reset because you said "thanks". | The agent proposes, Meuxe applies guardrails |
| **Session** | What did we just say? | Recent transcript. Already exists (`session/`). Not long term memory. | Meuxe |

Everything else from the old system (sources, transcripts, topics, dreams, FTS, zip import/export) is out. Memory that matters is small enough to read whole.

## Design

### The agent writes memory, Meuxe keeps it honest

Since the agent already emits `[expression:happy]` tags for the avatar, memory uses the same trick: a hidden block at the very end of each reply. Meuxe strips it from the transcript, display, and TTS, parses it, and applies it under rules the agent cannot override.

```
<<<meuxe
{"remember":["Their dog is named Rex"],
 "moment":"They told me the interview went badly; I tried to lift them up.",
 "mood":{"name":"worried","intensity":0.4,"cause":"they sounded really down","wants":"to hear how tomorrow goes"},
 "closeness":1,
 "open_threads":["Ask how the second interview went"],
 "closed_threads":[]}
>>>
```

Every key is optional. `{}` means nothing changed. If the agent omits the block, nothing is written for that turn except the session log and `last_talked_at`; no junk is guessed. Meuxe still does not infer memory from user text, but if the agent emits a trailing turn-notes JSON object without the `<<<meuxe` wrapper (or wraps it only in code fences), Meuxe will recover and apply it when the marker path finds nothing.

Meuxe holds back streaming text that could be the start of the marker so the block never leaks into subtitles or speech.

### Bond rules (the part that makes it feel real)

These are deterministic and live in Rust so every agent behaves the same.

- **Closeness** is `0.0..1.0`. The agent nudges it by an integer `-2..2` per turn (each step 0.015). Every turn adds a small baseline (`0.002`) for simply showing up. After 14 days of silence it drifts down `0.005` per day, never below `0.1`.
- **Stages** are derived from closeness and shown in the UI and prompt: just met (<0.15), getting to know each other (<0.35), friends (<0.6), close (<0.85), inseparable.
- **Mood** has a name, intensity `0.0..1.0`, a cause, what would help, and when it started. Negative moods: hurt, annoyed, angry, upset, jealous, disappointed, worried, sad, lonely, frustrated, cold.
- **No instant forgiveness.** If the current mood is negative with intensity above `0.45` and the agent proposes a non-negative mood, the mood stays but intensity drops by `0.35`. A real apology thaws things over two or three turns rather than one line. Below `0.45` the agent's call is accepted.
- **Moods fade with wall clock time.** Negative moods halve every 48 hours, positive ones every 12 hours. Under `0.15` the mood becomes neutral. If a negative mood fades without being addressed, its cause is kept as an open thread ("Never got closure on: ...").
- **Absence is noticed.** If the user is gone 5+ days, closeness is at least `0.35`, and mood is neutral, the mood becomes "missed you" at `0.3` (+0.1 per extra week, max 0.6) with the absence as its cause. The prompt always states how long it has been.
- **Open threads** are things left hanging. The agent opens and closes them by text; Meuxe caps them at 8, oldest dropped.

The agent is told all of this in plain language in its prompt: how it feels, why, what would help, and that it should not pretend the feeling away until the user genuinely addresses it.

### Facts

- Deduplicated on normalised text (lowercase, punctuation stripped). A near duplicate (token Jaccard >= 0.8) refreshes the existing fact's `confirmed_at` and `mentions` and adopts the newer wording.
- Kind is inferred from keywords (identity, people, preference, life, work, boundary, other) and only used for grouping in the UI.
- Cap 300. When full, the least mentioned, least recently confirmed fact is dropped.
- The user can add, edit, and forget facts in Settings. That is how corrections work ("her dog is Rex, not Max").

### Moments

- Appended, one per turn when the agent provides one. Weight defaults to `0.5`, raised to `0.8` when the same turn changed mood or closeness by 2.
- Prompt selection: the 4 most recent plus up to 3 older ones whose words overlap the user's message, within a character budget. No index needed.

### Storage

Plain files, one directory per user and companion, readable by humans and agents:

```
data_dir/data/users/{user_id}/companions/{character_id}/
  profile.json     { "facts": [Fact] }
  moments.jsonl    one Moment per line
  bond.json        Bond
```

The first time a companion directory is created, legacy `data/{character_id}/{user_id}/memory/*.jsonl` memories (if any) are imported: `semantic` rows become facts, `episodic` rows become moments, `reflections` are dropped. The old SQLite vault is not read; its contents were the same heuristic output.

`companion-home/relationship/{character_id}.md` and `companion-home/memory/brief.md` are rewritten before each ACP turn from the same data so the agent can also read them as files.

### Prompt injection

`memory::prompt::format_memory_context` produces, in order:

1. `## How you feel right now` - stage, closeness, turns, time since last talk, last moment, current mood with cause and what would help, open threads.
2. `## What you know about {user}` - all facts (most recently confirmed first, capped by budget).
3. `## Moments you remember together` - selected moments with relative dates.

`memory::prompt::TURN_NOTES_INSTRUCTIONS` is the agent-facing explanation of the `<<<meuxe` block and is appended to the persona.

## Public contract

### Rust (`meuxe_core::memory`)

```rust
pub struct Fact { id, text, kind: FactKind, created_at, confirmed_at, mentions: u32, source: FactSource }
pub enum FactKind { Identity, People, Preference, Life, Work, Boundary, Other }
pub enum FactSource { Agent, User, Legacy }
pub struct Moment { id, at, summary, feeling: Option<String>, weight: f64 }
pub struct Mood { name, intensity, cause: Option<String>, wants: Option<String>, since }
pub struct Thread { id, text, opened_at }
pub struct Bond { closeness, mood, threads: Vec<Thread>, last_talked_at: Option<DateTime<Utc>>, turns: u64, updated_at }
pub struct BondView { #[serde(flatten)] bond, stage: &'static str, seconds_since_last_talk: Option<i64> }
pub struct MemorySnapshot { bond: BondView, facts: Vec<Fact>, moments: Vec<Moment>, memory_dir: String }

pub struct TurnNotes { remember: Vec<String>, moment: Option<String>, mood: Option<MoodNote>, closeness: Option<i32>, open_threads: Vec<String>, closed_threads: Vec<String> }
pub struct MoodNote { name, intensity: Option<f64>, cause: Option<String>, wants: Option<String> }

pub struct CompanionMemory;            // store rooted at data_dir
impl CompanionMemory {
    pub fn new(data_dir: &Path) -> Self;
    pub fn snapshot(&self, character_id, user_id) -> Result<MemorySnapshot>;   // applies time decay, persists if changed
    pub fn apply_turn(&self, character_id, user_id, user_message, notes: Option<TurnNotes>) -> Result<MemorySnapshot>;
    pub fn add_fact(&self, character_id, user_id, text) -> Result<Fact>;
    pub fn update_fact(&self, character_id, user_id, fact_id, text) -> Result<Fact>;
    pub fn forget_fact(&self, character_id, user_id, fact_id) -> Result<()>;
    pub fn forget_moment(&self, character_id, user_id, moment_id) -> Result<()>;
    pub fn reset(&self, character_id, user_id) -> Result<()>;               // forget everything, fresh bond
}

pub struct TrailerSplitter;             // streaming: feed(chunk) -> visible text; finish() -> (visible rest, Option<trailer>)
pub fn parse_turn_notes(trailer: &str) -> Option<TurnNotes>;   // lenient: fences, prose around JSON, missing >>>
pub fn format_memory_context(snapshot: &MemorySnapshot, user_name: &str, user_message: &str) -> String;
pub const TURN_NOTES_INSTRUCTIONS: &str;
```

### Tauri commands

| Command | Args | Returns |
|---|---|---|
| `memory_snapshot` | `characterId` | `MemorySnapshot` |
| `memory_add_fact` | `characterId, text` | `Fact` |
| `memory_update_fact` | `characterId, factId, text` | `Fact` |
| `memory_forget_fact` | `characterId, factId` | `null` |
| `memory_forget_moment` | `characterId, momentId` | `null` |
| `memory_reset` | `characterId` | `null` |

`chat:done` carries `state_update: MemorySnapshot` so the UI can react to a mood change without refetching.

### JSON shapes (as seen by the frontend)

```jsonc
// MemorySnapshot
{
  "bond": {
    "closeness": 0.42, "stage": "friends",
    "mood": { "name": "hurt", "intensity": 0.6, "cause": "...", "wants": "...", "since": "2026-09-01T10:00:00Z" },
    "threads": [{ "id": "…", "text": "…", "opened_at": "…" }],
    "last_talked_at": "…", "seconds_since_last_talk": 259200, "turns": 118, "updated_at": "…"
  },
  "facts": [{ "id": "…", "text": "…", "kind": "people", "created_at": "…", "confirmed_at": "…", "mentions": 3, "source": "agent" }],
  "moments": [{ "id": "…", "at": "…", "summary": "…", "feeling": "worried", "weight": 0.8 }],
  "memory_dir": "/…/companions/rika"
}
```

Enums serialise as lowercase strings (`"people"`, `"agent"`).

## Settings > Memory

One page, three cards, no tabs:

1. **How {name} feels about you** - stage, closeness bar, mood sentence with cause and what would help, time since last talk, open threads. There is deliberately no button to reset a mood: you talk to them.
2. **What {name} knows about you** - facts grouped by kind with inline edit and forget, plus a field to tell them something directly.
3. **Moments** - dated timeline with forget.

Housekeeping at the bottom: clear conversation (keeps memory) and start over (forgets everything, confirm first), with the on-disk folder shown for the curious.

## Later

- `forget` key in turn notes so the agent can retract a fact the user corrected in chat.
- Meuxe MCP server exposing `remember`, `recall`, `how_do_you_feel` for agents that prefer tools to trailers (roadmap Phase 4).
- Nightly consolidation: merge moments older than 90 days into a short summary moment.
