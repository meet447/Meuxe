# Meuxe roadmap

Phases are ordered; later work assumes earlier product polish unless noted.

## Phase 0 — Product clarity (this branch)

- [x] `docs/DIRECTION.md` — north star and boundaries
- [x] Consumer-first onboarding order (you → companion → voice → AI)
- [x] Remove Composio from first-run path
- [x] README vision aligned with companion product
- [x] ACP module scaffold in Rust (runtime wired behind `agent.backend`)
- [x] Settings: group “Advanced” (integrations, agent tools, web search)

## Phase 1 — Feel like a shipped app

- [ ] One default character + avatar demo path polished (pick primary: VRM or Live2D)
- [ ] Empty states and copy audit (no “vault”, “Composio”, “harness” in first-run UI)
- [ ] Chat empty state: invitation to talk, not feature list
- [ ] Mini widget as hero demo asset (recording script + README GIF)
- [ ] Ordered TTS merge + expression polish on single chat path

## Phase 2 — ACP companion session (spike → replace)

- [x] `meuxe-desktop`: spawn configured ACP agent subprocess
- [x] Map ACP stream events → existing chat UI + avatar states
- [x] Companion context bundle: persona files + memory brief + relationship snapshot per session
- [x] Companion home directory layout documented and created on first run
- [x] Feature flag: `agent.backend = legacy | acp` for dogfooding

## Phase 3 — Consolidate backend

- [x] Route default chat through ACP when configured
- [ ] Deprecate in-app tool registry for default users (Settings advanced only)
- [ ] Composio optional plugin, not onboarding
- [x] Delete dead code paths in `chat.rs` / built-in LLM agent loop

## Phase 4 — Ecosystem

- [x] Agent picker (command + args) with validated presets (Claude, Codex, Gemini ACP)
- [ ] Optional Meuxe MCP server for memory/relationship tools
- [ ] Character packs (file-only distribution)

## Tracking

Update checkboxes in PRs that complete roadmap items. Do not add roadmap phases without updating `DIRECTION.md` if scope changes.
