# Contributing

Thank you for helping improve Meuxe. This document explains how to get set up and what we look for in contributions.

## Before you start

- **Issues first (for non-trivial work):** open or comment on an [issue](https://github.com/meet447/Meuxe/issues) so maintainers can agree on direction and avoid duplicate effort.
- **Code of conduct:** everyone participating is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Prerequisites:

- **Node.js** 18 or newer
- **Rust** stable (with Cargo), as required by [Tauri 2](https://v2.tauri.app/start/prerequisites/)
- On **Linux**, install WebKitGTK and related packages (see the [release workflow](.github/workflows/release.yml) for the list used in CI).

Clone and run in development mode:

```bash
git clone https://github.com/meet447/Meuxe.git
cd Meuxe
npm install
npm run tauri dev
```

Build a production bundle locally:

```bash
npm run tauri build
```

## Pull requests

- **One logical change per PR** when possible (easier to review and revert).
- **Describe the change** in the PR body: what problem it solves, how you tested it, and any user-visible impact.
- **Match existing style:** formatting, naming, and patterns used in nearby code.
- **Keep commits readable:** clear messages; squash fixup commits before merge if asked.

## Areas of the repo

- `src/` — React (Vite) frontend
- `src-tauri/` — Tauri shell and Rust commands
- `crates/meuxe-core/` — shared Rust logic (LLM, memory, state, and related services)

## Questions

Use [GitHub Discussions](https://github.com/meet447/Meuxe/discussions) or an issue if something in this guide is unclear or outdated.
