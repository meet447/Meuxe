# Meuxe — Agent Development Guide

## Cursor Cloud specific instructions

### Overview

Meuxe is a local-first AI companion desktop app built with **Tauri 2** (Rust backend + React/Vite frontend). There are no databases, Docker containers, or microservices — it is a single self-contained desktop application.

### Project layout

| Path | Language | Purpose |
|---|---|---|
| `src/` | TypeScript/React | Vite frontend (React 19, Tailwind, Three.js, PixiJS/Live2D) |
| `src-tauri/` | Rust | Tauri 2 shell — desktop window, system tray, Whisper voice, commands |
| `crates/meuxe-core/` | Rust | Core logic — LLM client, memory, sessions, characters, TTS, tools |

### Running in headless Cloud VM

The full desktop app (`npm run tauri dev`) requires a display. In a headless Cloud VM:

- **Frontend only:** `npm run dev` starts the Vite dev server on `http://localhost:1420`. The UI renders in a browser but Tauri backend calls (file I/O, Whisper, etc.) will fail gracefully.
- **Rust compilation and tests work normally** without a display.

### Lint, test, and build commands

See `package.json` scripts and the CI workflow at `.github/workflows/ci.yml`.

- **Frontend tests:** `npm test` (Vitest, 38 tests)
- **Frontend build:** `npm run build` (tsc + vite build)
- **Rust format check:** `cargo fmt --all -- --check`
- **Rust lint:** `cargo clippy --workspace --all-targets -- -D warnings`
- **Rust tests:** `cargo test --workspace` (55 tests across meuxe-core and tauri crate)

### Rust build environment variables

The `whisper-rs-sys` crate requires CMake and g++ for its C++ build. Set these environment variables before any `cargo` command:

```bash
export CC=gcc CXX=g++
gcc_dir=$(dirname "$(gcc -print-file-name=libstdc++.so)")
export RUSTFLAGS="-C link-arg=-L${gcc_dir}"
```

This mirrors the CI configuration and prevents linker errors with `libstdc++`.

### External APIs (optional)

LLM (OpenAI-compatible) and TTS providers are configured at runtime through the app UI. They are not required for building, testing, or running the frontend. Without them, the app launches but AI chat responses won't work.
