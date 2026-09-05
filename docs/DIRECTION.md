# Meuxe product direction

Meuxe is a **desktop companion**—one continuous relationship with a character who remembers you, speaks, shows emotion on an avatar, and can help with real life (including technical work). It is **not** a demo repo, a settings dashboard for APIs, or a second coding IDE.

## North star

**One companion, one conversation.** The same person on your screen whether you are venting, planning your week, or asking them to help fix something on your computer.

Their **mind** should eventually run on **your chosen agent** (Claude Code, Codex, Gemini CLI, etc.) via the [Agent Client Protocol (ACP)](https://agentclientprotocol.com), while **Meuxe owns presence**: persona, memory, relationship, voice, avatar, and how tool use *feels* in character.

## What Meuxe owns (the product)

| Layer | Responsibility |
|--------|----------------|
| **Persona** | Layered character files (`soul.md`, style, rules)—opinionated defaults, not blank slop |
| **Memory & relationship** | Facts about you, shared moments, and a bond with a persistent mood that has a cause (see `MEMORY.md`) |
| **Presence** | Expressions, lip sync, TTS, mini desktop widget |
| **Companion home** | Local workspace the agent can use (journals, memory exports, character data) |
| **Shell UX** | One chat surface; tool activity as subtle status, not a terminal takeover |

## What Meuxe does not own (delegate to the user’s agent)

- Building a full agent harness (custom tool registry, Composio hub as core story, shell/file tools in-app)
- Competing with Claude Code / Codex on raw capability
- Fifteen half-finished integrations in onboarding

Optional **Meuxe MCP** later: `remember`, `recall`, `relationship_snapshot` so agents update memory in character.

## Architecture (target)

```
┌─────────────────────────────────────────┐
│ Meuxe shell (Tauri + React)             │
│ persona · memory · avatar · voice · UI  │
│ ACP client + companion context injection│
└──────────────────┬──────────────────────┘
                   │ JSON-RPC / stdio (ACP)
                   ▼
┌─────────────────────────────────────────┐
│ User’s CLI agent (claude, codex, …)     │
└─────────────────────────────────────────┘
```

Until ACP landed, chat used an OpenAI-compatible loop in Meuxe; **default chat is now ACP-only**. Migration was **replace the backend session**, not add a second mode.

## Product principles (anti–AI slop)

1. **Default character quality** — ship one companion people fall in love with; customization is depth, not 47 toggles on day one.
2. **Local-first is trust** — memories and relationship live on device; explain outbound data in plain language once, not every screen.
3. **Presence before features** — avatar + voice + pacing beat integration count.
4. **No mode switch** — no “chat vs agent” tabs; one timeline.
5. **Consumer-first onboarding** — meet the companion first; API keys and integrations live in Settings.

## Non-goals

- Another generic “all-in-one AI app” feature matrix
- Mandatory Composio / dev integrations to get started
- Maintaining two avatar stacks as equal first-class forever (pick a primary for the story)

## Success metrics (qualitative)

- Someone non-technical completes onboarding and has a conversation without reading docs
- Demo video is emotional (character + memory), not a settings tour
- Contributors extend persona packs and ACP agents, not another internal tool

See [ROADMAP.md](./ROADMAP.md) for phased engineering work.
