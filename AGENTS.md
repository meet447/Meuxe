# Meuxe — Agent Development Guide

See [`docs/DIRECTION.md`](docs/DIRECTION.md) for product north star, [`docs/ROADMAP.md`](docs/ROADMAP.md) for phased work, [`docs/DESIGN.md`](docs/DESIGN.md) for the UI design language (tokens, primitives in `src/components/ui/`, and rules for new screens), and [`docs/MEMORY.md`](docs/MEMORY.md) for how companion memory and mood work.

## Cursor Cloud specific instructions

### Overview

Meuxe is a local-first AI companion desktop app built with **Tauri 2** (Rust backend + React/Vite frontend). There are no databases, Docker containers, or microservices — it is a single self-contained desktop application.

### Project layout

| Path | Language | Purpose |
|---|---|---|
| `src/` | TypeScript/React | Vite frontend (React 19, Tailwind, Three.js, PixiJS/Live2D) |
| `src-tauri/` | Rust | Tauri 2 shell — desktop window, system tray, Whisper voice, commands |
| `crates/meuxe-core/` | Rust | Core logic — persona, memory, sessions, characters, TTS |

### Running in headless Cloud VM

The full desktop app (`npm run tauri dev`) requires a display. In a headless Cloud VM:

- **Frontend only:** `npm run dev` starts the Vite dev server on `http://localhost:1420`. The UI renders in a browser but Tauri backend calls (file I/O, Whisper, etc.) will fail gracefully.
- **Rust compilation and tests work normally** without a display.

### Lint, test, and build commands

See `package.json` scripts and the CI workflow at `.github/workflows/ci.yml`.

- **Frontend tests:** `npm test` (Vitest, 84 tests)
- **Frontend build:** `npm run build` (tsc + vite build)
- **Rust format check:** `cargo fmt --all -- --check`
- **Rust lint:** `cargo clippy --workspace --all-targets -- -D warnings`
- **Rust tests:** `cargo test --workspace` (118 tests across meuxe-core and tauri crate)

### Rust build environment (whisper-rs-sys / libstdc++)

The `whisper-rs-sys` crate builds whisper.cpp with CMake. On Ubuntu images where `cc`/`c++` point at Clang, the build can fail with `ld: cannot find -lstdc++` while CMake checks the C++ compiler. Cause: Clang selects the newest GCC directory under `/usr/lib/gcc/x86_64-linux-gnu/` (e.g. `14`), but only the older one (`13`) has `libstdc++.so`, because the matching `libstdc++-N-dev` package is missing. Check with `clang++ -v /dev/null 2>&1 | grep 'Selected GCC'`.

Durable fix — install the dev package for the GCC version Clang selected, then plain `cargo` works:

```bash
sudo apt-get install -y libstdc++-14-dev
```

Alternative (what CI does) — force GCC and point the Rust linker at its `libstdc++`:

```bash
export CC=gcc CXX=g++
gcc_dir=$(dirname "$(gcc -print-file-name=libstdc++.so)")
export RUSTFLAGS="-C link-arg=-L${gcc_dir}"
```

### External APIs (optional)

Chat uses **ACP** (user-installed CLI agents such as Claude Code, Codex, or OpenCode). TTS providers are configured at runtime in Settings. Neither is required to build, test, or run the Vite frontend. Without a configured agent, the app launches but companion chat will not respond.
