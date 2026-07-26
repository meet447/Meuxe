# ACP CLI agents (Meuxe presets)

Chat runs only through the [Agent Client Protocol](https://agentclientprotocol.com). Meuxe is the ACP **client**; the preset picks which **agent** subprocess to spawn.

## Resolution order (global-first)

For each preset, Meuxe picks the first match:

1. **System / global** — executable on `PATH` or common locations (`~/.local/bin`, npm global `bin`, `$NPM_CONFIG_PREFIX/bin`, etc.)
2. **Meuxe local fallback** — `{app_data}/agents/npm/bin/` (in-app “Install local fallback”)
3. **npx** — Claude and Codex only, when Node/npx is available and no binary was found

| Preset | System binary name | Global install example |
|--------|-------------------|-------------------------|
| `opencode` | `opencode` | `npm i -g opencode-ai` |
| `claude` | `claude-agent-acp` | `npm i -g @agentclientprotocol/claude-agent-acp` |
| `codex` | `codex-acp` | `npm i -g @agentclientprotocol/codex-acp` |
| `custom` | User-defined command + args | Your PATH or full path |

OpenCode is launched as `{binary} acp`. Claude/Codex adapters are launched as a single executable when found globally.

Persona and memory context are written under `data_dir/companion-home/` before each turn; the session working directory is that tree.
