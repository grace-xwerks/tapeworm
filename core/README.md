# Tapeworm core

Cross-platform CNC RS-232 transfer logic, in Rust.

This is the shared wire layer intended to power Tapeworm's Node surfaces — the [MCP server](../packages/mcp-server) and the [transfer agent](../apps/agent) (via [`napi-rs`](https://napi.rs/)) — and, eventually, a Tauri desktop app for shop-floor PCs. Keeping the protocol logic in one Rust crate avoids the Node native-module ABI dance and reuses a single tested implementation everywhere. No consumer imports it yet — the napi bridge is still to be built (see [Future bindings](#future-bindings)).

**Status:** protocol logic implemented and unit-tested. Framing (`Framing::encode` / `Framing::decode`) and the hardware-agnostic transport pump (`send_over` / `receive_over`) are covered by tests against in-memory transports. The one remaining piece is `open_port` — the serial-open seam that needs a physical control (or a serial loopback) to verify. `send_program` / `receive_program` open the port and delegate to the tested core, so wiring `open_port` to `serialport::new` is the only step left.

## Layout

```
core/
├── Cargo.toml             # workspace
└── tapeworm-core/         # the crate
    ├── Cargo.toml
    └── src/lib.rs         # PortSettings, Framing (encode/decode), MachineProfile, profiles,
                           # send_over/receive_over (generic core), send_program/receive_program
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

When we need to call this from Node (the MCP server and transfer agent), add a sibling `tapeworm-core-napi` crate using [`napi-rs`](https://napi.rs/) (3.8+). When the Tauri app lands, depend on `tapeworm-core` directly.

## Why a separate Rust crate

Three reasons, in order of importance:

1. **Avoid the native-module nightmare.** The Node `serialport` package needs native rebuilds and hits ABI mismatches across Node/Electron versions. A Rust crate built once per platform is far simpler to ship.
2. **Reuse across surfaces.** Same logic powers every consumer via napi-rs — the MCP server, the transfer agent, and eventually Tauri. One bug fix, every product.
3. **Performance for drip feed.** Serial pacing is timing-sensitive; Rust's predictable runtime helps when an old Fanuc's 4800-baud buffer needs careful babying.

## License

MIT. See [LICENSE](../LICENSE) at the repo root.
