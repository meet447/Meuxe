# Cloud Agent Environment

Use this baseline for Cursor Cloud agents working on Meuxe.

## Node

- Use Node.js 22.
- Install frontend dependencies from the lockfile:

```bash
npm ci
```

`npm install` also works for local iteration, but `npm ci` is preferred for
repeatable cloud-agent startup.

## Rust

The repository includes `rust-toolchain.toml` pinned to Rust 1.88.0 with
`rustfmt` and `clippy`.

This is required because the Tauri dependency graph includes crates using Rust
2024 edition metadata and transitive crates whose minimum supported Rust version
is newer than the cloud image default. Older toolchains such as Rust/Cargo 1.83
fail while parsing or resolving those crates before compilation starts.

Install or prewarm the toolchain:

```bash
rustup toolchain install 1.88.0 --profile default --component rustfmt --component clippy
rustup default 1.88.0
```

When `rust-toolchain.toml` is present, `cargo`, `rustc`, `rustfmt`, and `clippy`
automatically use the pinned toolchain from the repository root.

## Useful validation commands

```bash
cargo check -p meuxe-core
cargo test -p meuxe-core memory_vault
npm test
npm run build
```

For full desktop/Tauri validation on Linux, the agent image also needs the
standard Tauri system packages:

```bash
sudo apt-get update
sudo apt-get install -y \
  pkg-config \
  build-essential \
  g++ \
  libstdc++-14-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libayatana-appindicator3-dev \
  libxdo-dev
```
