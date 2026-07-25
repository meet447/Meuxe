# Meuxe roadmap

Phases are ordered; later work assumes earlier product polish unless noted.

## Phase 0 — Product clarity (this branch)

- [x] `docs/DIRECTION.md` — north star and boundaries
- [x] Consumer-first onboarding order (you → companion → voice → AI)
- [x] Remove Composio from first-run path
- [x] README vision aligned with companion product
- [x] ACP module scaffold in Rust (no runtime yet)
- [x] Settings: group “Advanced” (integrations, agent tools, web search)

## Phase 1 — Feel like a shipped app

- [ ] One default character + avatar demo path polished (pick primary: VRM or Live2D)
- [ ] Empty states and copy audit (no “vault”, “Composio”, “harness” in first-run UI)
- [ ] Chat empty state: invitation to talk, not feature list
- [ ] Mini widget as hero demo asset (recording script + README GIF)
- [ ] Ordered TTS merge + expression polish on single chat path

## Phase 2 — ACP companion session (spike → replace)

- [ ] `meuxe-desktop`: spawn configured ACP agent subprocess
- [ ] Map ACP stream events → existing chat UI + avatar states
- [ ] Companion context bundle: persona files + memory brief + relationship snapshot per session
- [ ] Companion home directory layout documented and created on first run
- [ ] Feature flag: `agent.backend = legacy | acp` for dogfooding

## Phase 3 — Consolidate backend

- [ ] Route default chat through ACP when configured
- [ ] Deprecate in-app tool registry for default users (Settings advanced only)
- [ ] Composio optional plugin, not onboarding
- [ ] Delete dead code paths in `chat.rs` / `meuxe-core` tools after parity

## Phase 4 — Ecosystem

- [ ] Agent picker (command + args) with validated presets (Claude, Codex, Gemini ACP)
- [ ] Optional Meuxe MCP server for memory/relationship tools
- [ ] Character packs (file-only distribution)

## Tracking

Update checkboxes in PRs that complete roadmap items. Do not add roadmap phases without updating `DIRECTION.md` if scope changes.
