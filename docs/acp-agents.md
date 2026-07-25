# ACP CLI agents (Meuxe presets)

Chat runs only through the [Agent Client Protocol](https://agentclientprotocol.com). Meuxe is the ACP **client**; the preset picks which **agent** subprocess to spawn.

| Preset | Launch command | Notes |
|--------|----------------|--------|
| `opencode` | `opencode acp` | [OpenCode](https://opencode.ai) — install the `opencode` CLI (e.g. `npm i -g opencode-ai`). Registry: [agentclientprotocol/registry/opencode](https://github.com/agentclientprotocol/registry/tree/main/opencode). |
| `claude` | `npx -y @agentclientprotocol/claude-agent-acp@latest` | Claude Code via official ACP adapter. |
| `codex` | `npx -y @agentclientprotocol/codex-acp@latest` | OpenAI Codex via official ACP adapter. |
| `custom` | User-defined command + args | For other registry agents or local builds. |

Persona and memory context are written under `data_dir/companion-home/` before each turn; the session working directory is that tree.
