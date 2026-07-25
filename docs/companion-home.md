# Companion home workspace

Meuxe keeps **canonical app data** under the Tauri `app_data_dir()` (referred to here as `data_dir`). For **ACP-backed sessions** (see [DIRECTION.md](./DIRECTION.md) and [ROADMAP.md](./ROADMAP.md)), the shell also maintains a **companion home** directory: a human-readable workspace the user’s CLI agent can use as its working directory without touching internal SQLite paths directly.

**Path:** `data_dir/companion-home/`

Meuxe creates and refreshes this tree for ACP-backed sessions (`ensure_companion_home` in `src-tauri/src/acp/run.rs`). The layout below is the convention for persona injection and agent scratch space.

## Relationship to canonical storage

| Canonical (Meuxe-owned) | Role |
|-------------------------|------|
| `data_dir/config.json` | User profile, provider keys, onboarding flags |
| `data_dir/characters/{character_id}/` | Persona files (`character.yaml`, `soul.md`, `style.md`, `rules.md`, `context.md`, `examples/`) |
| `data_dir/data/users/{user_id}/sessions/{character_id}.jsonl` | Chat timeline source of truth |
| `data_dir/data/users/{user_id}/memories/{character_id}/state.json` | Live relationship state (mood, trust, affection, energy) |
| `data_dir/data/users/{user_id}/memory/memory.db` | Memory vault database (canonical memories) |
| `data_dir/data/users/{user_id}/memory/vault/` | Markdown projection of the vault (rebuilt from the DB) |

Companion home **does not replace** those stores. It aggregates **snapshots and scratch space** for the agent: persona excerpts, a relationship brief, a memory brief, optional exports, and journals the companion (or agent) may write during a session.

## Directory layout

```
data_dir/companion-home/
├── README.md                 # Index for humans and agents (purpose + folder map)
├── persona/
│   └── {character_id}/
│       ├── soul.md           # Snapshot from characters/{id}/soul.md
│       ├── style.md
│       ├── rules.md
│       ├── context.md
│       └── character.yaml    # Metadata (name, model, voice)
├── relationship/
│   └── {character_id}.md     # Mood, trust, affection, energy + short summary
├── memory/
│   ├── brief.md              # Session memory brief (retrieved snippets for injection)
│   └── exports/              # User-triggered zip/markdown exports (optional)
├── journal/
│   └── YYYY-MM-DD.md         # Companion-facing daily notes (agent or dream runs)
└── workspace/                # ACP working directory (agent scratch, tool I/O)
    └── .gitkeep
```

### `persona/`

Read-oriented mirrors of `characters/{character_id}/`. Updated when the character is edited or when an ACP session starts so the agent always sees the same layered persona Meuxe uses in prompts.

### `relationship/`

One markdown file per companion, derived from `state.json` and vault relationship projection (`vault/characters/{character_id}/relationship.md` when built). Used for **companion context bundle** at session start.

### `memory/`

- **`brief.md`** — Short, curated recall for the current session (not the full DB).
- **`exports/`** — Optional copies of user-initiated exports from Settings → Memory.

### `journal/`

Optional daily markdown the companion maintains (reflections, “dream” summaries, or agent-written notes). Distinct from episodic rows in `memory.db`; journals are file-first and easy for agents to append.

### `workspace/`

Default **working directory** when spawning an ACP agent session (`companion_home_dir` / `ensure_companion_home` in `src-tauri/src/acp/run.rs`). Agents may create files here; Meuxe does not treat this tree as canonical memory unless ingested through normal memory pipelines.

## Session context bundle

Each ACP session receives:

1. `persona/{character_id}/*.md` (or a single merged brief)
2. `relationship/{character_id}.md`
3. `memory/brief.md`
4. Pointer to `workspace/` as cwd

The React chat UI and avatar layer remain Meuxe-owned; only the **reasoning backend** runs in the user’s CLI agent.

## Privacy

Everything under `companion-home/` stays on disk with the rest of `data_dir`. Full app data reset removes companion home along with other app data.
