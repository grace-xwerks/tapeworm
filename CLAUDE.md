# Tapeworm — Claude Code instructions

CNC code-base platform for Grace Engineering's shop floor: Fusion → Git →
Supabase → machine, with Git-tracked G-code and a transfer agent that pushes
programs to lathes/mills over RS-232 (via Moxa NPort serial-to-Ethernet
units). Turborepo + pnpm workspace monorepo, plus one standalone Rust crate.

**Read [`README.md`](README.md) and
[`docs/cnc_programmer_workflow.md`](docs/cnc_programmer_workflow.md) first**
— the workflow doc has the real naming conventions (Swiss lathe files:
`customer-partnumber.cnc`; milling: `customer-part-op10.cnc`; storage paths:
`grace/GR-88602-SHAFT.cnc`).

## Layout

| Path | What | Stack |
|---|---|---|
| `apps/agent` | Supabase Realtime subscriber, pushes transfers to machines | Node + TS |
| `apps/web` | Dashboard (single `App.tsx`, ~930 lines) | React 18 + Vite 5 + TS |
| `core/tapeworm-core` | Wire-protocol types (ports, framing, machine profiles) | Rust, own Cargo workspace — **not** a pnpm member |
| `packages/mcp-server` | MCP server exposing transfer tools | Node + TS, `@modelcontextprotocol/sdk` |
| `packages/shared` | `@tapeworm/shared` — domain types, consumed via `workspace:*` | TS |
| `supabase/` | Schema (`migrations/`) + seed (44 real Grace Engineering machines) | — |
| `archive/` | **Superseded** pre-pivot vision docs (VS Code extension, Tauri, GraphQL gateway). Not current architecture — don't treat as a spec. | — |

## Hard rules

- **The wire-transfer layer doesn't function anywhere yet.** `apps/agent`
  fakes transfers with a `setTimeout`; `core/tapeworm-core`'s
  `send_program`/`receive_program` are `unimplemented!()`; every
  `packages/mcp-server` tool returns a canned `"[stub] ..."` string. None of
  the three import `serialport`/socket APIs. Don't describe or build on this
  as if it works — it's schema/UI/plumbing around a feature that isn't built.
- **`pnpm lint` and `pnpm type-check` are no-ops today.** `turbo.json`
  defines those tasks but no individual package implements a `lint` or
  `type-check` script — they'll exit 0 having done nothing. There's also no
  `test` task and no package has a `test` script. The only tooling that's
  real: Rust's `cargo clippy -- -D warnings` / `cargo fmt --check` /
  `cargo test` in `core/`. Don't claim you "ran lint" unless it was Rust.
- **`docker-compose.yml` is shop-floor deployment, not local dev.** Local
  Supabase runs via `npx supabase start` separately. The compose file's
  `agent` service uses `network_mode: host` specifically to reach Moxa NPort
  units on the physical shop LAN — don't "fix" that thinking it's a mistake.
- **Real business data lives in this repo**: `supabase/seed.sql` and
  `machine_inventory.xlsx` contain actual Grace Engineering machine serials
  and shop-floor LAN IPs (also hardcoded as "mock data" in
  `apps/web/src/App.tsx`). Treat it as real, not sample data — don't invent
  replacement values or assume it's fabricated.
- **Two docs are stale, don't trust them at face value**: root `README.md`
  links a `CONTRIBUTING.md` that no longer exists at root (moved to
  `archive/`) and says "License: MIT (planned)" while `archive/PLATFORM.md`
  says Apache-2.0+CLA — no `LICENSE` file exists either way, so it's actually
  undecided. `core/README.md` calls itself "the wire layer behind the
  Tapeworm VS Code extension" — that extension doesn't exist in this repo.

## Quick commands

```bash
pnpm install && pnpm approve-builds && pnpm build
npx supabase start
npx supabase db reset      # seeds 44 machines from supabase/seed.sql
pnpm dev                   # http://localhost:3000

# Rust core
cd core && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

## When in doubt

This is a young repo (12 commits: one big scaffold commit, then four
docs-only commits) — most of what exists is schema/UI/plumbing, not working
features. Check `git log --oneline` before assuming something is finished,
and trust the Rust crate's test coverage over the TS packages' (which have
none) as a sanity check on what's real.
