# Meuxe roadmap

Phases are ordered; later work assumes earlier product polish unless noted.

## Phase 0 — Product clarity

- [x] `docs/DIRECTION.md` — north star and boundaries
- [x] Consumer-first onboarding (you → companion → voice → CLI agent)
- [x] README vision aligned with companion product
- [x] ACP client wired for chat

## Phase 1 — Feel like a shipped app

- [ ] One default character + avatar demo path polished (pick primary: VRM or Live2D)
- [ ] Empty states and copy audit (no “vault” or harness jargon in first-run UI)
- [ ] Chat empty state: invitation to talk, not feature list
- [ ] Mini widget as hero demo asset (recording script + README GIF)
- [x] Ordered TTS merge + expression tags on ACP chat path
- [x] Light flat stage UI, speech subtitles, mini hover chat bar, settings avatar framing

## Phase 2 — ACP companion session

- [x] Spawn configured ACP agent subprocess
- [x] Map ACP stream → chat UI + avatar expressions
- [x] Companion context bundle (persona + memory + relationship in prompt / `companion-home`)
- [x] Companion home directory layout + `AGENTS.md` for agents
- [x] Onboarding agent install (OpenCode, Claude, Codex presets)
- [x] Companion memory v2: agent-written facts and moments, persistent mood with cause, no instant forgiveness, absence awareness (`docs/MEMORY.md`)
- [ ] `forget` key in turn notes so the agent can retract a corrected fact
- [ ] Consolidate moments older than 90 days into summary moments

## Phase 3 — Consolidate backend

- [x] Chat runs only through ACP (no in-app LLM agent loop)
- [x] Removed Meuxe tool registry, web search settings, and Composio integrations
- [x] Removed dead LLM streaming client and config test/list API commands
- [ ] Trim `config.json` on save (drop legacy `search` / `composio` keys from old installs)

## Phase 4 — Ecosystem

- [x] Agent picker with validated presets (OpenCode, Claude Code, Codex, custom)
- [ ] Optional Meuxe MCP server (`remember`, `recall`, `how_do_you_feel`) for agents that prefer tools to turn notes
- [ ] Character packs (file-only distribution)

## Tracking

Update checkboxes in PRs that complete roadmap items. Do not add roadmap phases without updating `DIRECTION.md` if scope changes.
