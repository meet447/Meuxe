# Companion home workspace

Meuxe keeps **canonical app data** under the Tauri `app_data_dir()` (referred to here as `data_dir`). For **ACP-backed sessions** (see [DIRECTION.md](./DIRECTION.md) and [ROADMAP.md](./ROADMAP.md)), the shell also maintains a **companion home** directory: a human-readable workspace the user’s CLI agent can use as its working directory without touching Meuxe's own data files directly.

**Path:** `data_dir/companion-home/`

Meuxe creates and refreshes this tree for ACP-backed sessions (`ensure_companion_home` in `src-tauri/src/acp/run.rs`). The layout below is the convention for persona injection and agent scratch space.

## Relationship to canonical storage

| Canonical (Meuxe-owned) | Role |
|-------------------------|------|
| `data_dir/config.json` | User profile, provider keys, onboarding flags |
| `data_dir/characters/{character_id}/` | Persona files (`character.yaml`, `soul.md`, `style.md`, `rules.md`, `context.md`, `examples/`) |
| `data_dir/data/users/{user_id}/sessions/{character_id}.jsonl` | Chat timeline source of truth |
| `data_dir/data/users/{user_id}/companions/{character_id}/bond.json` | How the companion feels about you: closeness, current mood with cause, open threads, last talked (see [MEMORY.md](./MEMORY.md)) |
| `data_dir/data/users/{user_id}/companions/{character_id}/profile.json` | Facts the companion knows about you |
| `data_dir/data/users/{user_id}/companions/{character_id}/moments.jsonl` | Dated moments you have shared |

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
│   ├── brief.md              # Facts and recent moments (what the prompt receives)
│   └── exports/              # Reserved for future exports
├── journal/
│   └── YYYY-MM-DD.md         # Companion-facing daily notes (agent-written)
└── workspace/                # ACP working directory (agent scratch, tool I/O)
    └── .gitkeep
```

### `persona/`

Read-oriented mirrors of `characters/{character_id}/`. Updated when the character is edited or when an ACP session starts so the agent always sees the same layered persona Meuxe uses in prompts.

### `relationship/`

One markdown file per companion, rendered from `bond.json` before each turn: stage, closeness, current mood with its cause and what would help, open threads, and time since you last talked. Used for the **companion context bundle** at session start.

### `memory/`

- **`brief.md`** — The facts and recent moments the companion knows, rendered from `profile.json` and `moments.jsonl` before each turn. Same content the prompt receives; readable by the agent as a file.
- **`exports/`** — Reserved for future user-initiated exports.

### `journal/`

Optional daily markdown the companion maintains or agents write during a session. Distinct from moments; journals are file-first and easy for agents to append.

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
