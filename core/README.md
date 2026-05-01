# Tapeworm core

Cross-platform CNC RS-232 transfer logic, in Rust.

This is the wire layer behind the [Tapeworm VS Code extension](../README.md), the [MCP server](../mcp-server), and (eventually) a Tauri desktop app for shop-floor PCs. By keeping the protocol logic in a Rust crate we avoid the Node native-module ABI dance and reuse a single tested implementation everywhere.

**Status:** skeleton. Public types are stable enough for downstream packages to start integrating; the `send_program` and `receive_program` functions are stubs until Phases 2 and 5 of the [roadmap](../TODO.md).

## Layout

```
core/
├── Cargo.toml             # workspace
└── tapeworm-core/         # the crate
    ├── Cargo.toml
    └── src/lib.rs         # PortSettings, Framing, MachineProfile, profiles, send_program, receive_program
```

## Build

```bash
cd core
cargo build
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```

## Future bindings

When we need to call this from Node (the VS Code extension and MCP server), add a sibling `tapeworm-core-napi` crate using [`napi-rs`](https://napi.rs/) (3.8+). When the Tauri app lands, depend on `tapeworm-core` directly.

## Why a separate Rust crate

Three reasons, in order of importance:

1. **Avoid the native-module nightmare.** The Node `serialport` package has Electron ABI mismatches on every VS Code update. A Rust crate built once per platform is far simpler to ship.
2. **Reuse across surfaces.** Same logic powers the Node side (via napi-rs), the MCP server, the CLI, and Tauri. One bug fix, four products.
3. **Performance for drip feed.** Serial pacing is timing-sensitive; Rust's predictable runtime helps when an old Fanuc's 4800-baud buffer needs careful babying.

## License

Apache-2.0. See [LICENSE](../LICENSE) once added at the repo root.
