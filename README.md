# Meuxe

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **desktop companion**—a character on your screen who remembers you, speaks, and grows with you over time. Built with [**Tauri 2**](https://v2.tauri.app/) (Rust + React). Chat runs through your **ACP CLI agent** (Claude Code, Codex, OpenCode, or custom); memories, persona, and relationship state stay on your machine. Optional cloud **TTS** only if you enable it.

Product direction: [`docs/DIRECTION.md`](docs/DIRECTION.md) · Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md) · ACP presets: [`docs/acp-agents.md`](docs/acp-agents.md)

![Meuxe demo](assets/demo.png)

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [ACP agents (chat)](#acp-agents-chat)
- [Providers (optional)](#providers-optional)
- [Development](#development)
- [Releases](#releases)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

### Companion core

- **ACP-backed chat** — Meuxe is the [Agent Client Protocol](https://agentclientprotocol.com) client; reasoning runs in the CLI agent you install and select
- **Layered characters** — written as `.yaml` and `.md` files (`soul.md`, `style.md`, `rules.md`, etc.)
- **Session history** — local persistence of chats
- **Local long-term memory** — semantic, episodic, and reflection-style memories (local storage)
- **Relationship state** — trust, affection, mood, and energy evolve over time
- **Expression-aware streaming** — parses agent replies for emotion tags in real time (`<<expression>>`)

### Interaction

- **Streaming chat** — real-time text over ACP agent sessions
- **Speech subtitles** — per-sentence captions on the main stage and in mini mode while TTS plays
- **Parallel TTS** — synthesizes speech segments in parallel for lower latency
- **Voice input** — microphone capture, VAD, and optional Whisper-based transcription
- **Light companion stage** — flat, readable UI with history drawer and floating chat input
- **Global shortcuts** — toggle mini mode, focus chat, and mic from the keyboard

### Avatars

- **Live2D** — Cubism models with lip sync and expression mapping
- **VRM** — 3D avatars with custom animations
- **Mini mode** — transparent desktop widget with hover-to-reveal chat, size presets, and expand to full app
- **Avatar framing** — zoom and background in Settings (full / half-body on stage toolbar)

## Quick start

### Prerequisites

- **Node.js** 22 recommended (see [`.nvmrc`](.nvmrc))
- **Rust** 1.88.0 with **Cargo** (pinned in [`rust-toolchain.toml`](rust-toolchain.toml); see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for OS-specific packages)
- **Linux:** WebKitGTK and related dev packages (the same set [used in CI](.github/workflows/release.yml) is a good reference)
- **An ACP agent** for chat — pick one during onboarding or in Settings → Agent (see [ACP agents (chat)](#acp-agents-chat))

### Install and run (development)

```bash
git clone https://github.com/meet447/Meuxe.git
cd Meuxe
npm ci
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

## ACP agents (chat)

Meuxe does **not** embed an OpenAI-compatible LLM client for chat. Every message goes to a subprocess speaking **ACP**:

| Preset | Typical install |
|--------|-------------------|
| **OpenCode** | `opencode` CLI (`npm i -g opencode-ai`), launched as `opencode acp` |
| **Claude Code** | `npx -y @agentclientprotocol/claude-agent-acp@latest` |
| **Codex** | `npx -y @agentclientprotocol/codex-acp@latest` |
| **Custom** | Any ACP agent — command and args in Settings |

Before each turn, Meuxe writes persona, memory, and relationship context under `companion-home/` in your app data directory and uses that tree as the agent working directory. Details: [`docs/companion-home.md`](docs/companion-home.md) and [`docs/acp-agents.md`](docs/acp-agents.md).

## Providers (optional)

You choose which optional services to use:

- **Chat** — always via your **ACP CLI agent** (see above). No separate “LLM API” setting in Meuxe.
- **TTS** — built-in Meuxe TTS (no key), plus ElevenLabs and OpenAI TTS when configured in Settings → Voice.

## Project structure

```text
Meuxe/
├── src/                 # React (Vite) frontend
├── src-tauri/           # Tauri shell, ACP client, Rust commands
├── crates/meuxe-core/   # Shared Rust logic (persona, memory, sessions, TTS, …)
├── characters/          # Local companion profiles
├── models/              # Live2D and VRM assets
└── data/                # Local session and memory data (created at runtime)
```

### Upgrading from MeuxCompanion

The desktop app identifier is now `com.meuxe.app` (product name **Meuxe**). Local data no longer lives under `com.meuxcompanion.app`. To keep existing sessions, memory, and config, copy your old app data directory into the new path (for example macOS `~/Library/Application Support/com.meuxe.app`).

## Development

```bash
npm run tauri dev    # desktop app + hot reload
npm run dev          # Vite frontend only (without Tauri shell)
npm test             # Vitest unit tests
npm run build        # Typecheck + production frontend build
```

### Rust (Linux / CI parity)

`whisper-rs-sys` needs CMake and g++. On Linux CI images, link against GCC’s `libstdc++`:

```bash
export CC=gcc CXX=g++
gcc_dir=$(dirname "$(gcc -print-file-name=libstdc++.so)")
export RUSTFLAGS="-C link-arg=-L${gcc_dir}"
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how we handle issues, pull requests, and code review.

## Releases

Tagged releases are built with [GitHub Actions](.github/workflows/release.yml). Maintainers publish draft GitHub Releases from CI artifacts when ready.

## Contributing

We welcome issues and pull requests. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.

## Security

If you discover a security vulnerability in **this repository**, please follow [SECURITY.md](SECURITY.md) so we can address it responsibly.

## License

This project is licensed under the [MIT License](LICENSE).
