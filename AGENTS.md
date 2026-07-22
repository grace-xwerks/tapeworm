# AGENTS.md

See [`CLAUDE.md`](CLAUDE.md) for the authoritative architecture overview, hard
rules, and quick commands. This file adds environment/run guidance for agents.

## Cursor Cloud specific instructions

The update script (`pnpm install`) runs on VM startup, so dependencies are
already installed. Node, pnpm, the Rust toolchain, and `libudev-dev`/`pkg-config`
are baked into the VM snapshot. Notes below are the non-obvious gotchas.

### Services

- **`apps/web`** (React + Vite dashboard) is the only service that actually
  runs/demos the product. `pnpm dev` (root) starts it on
  http://localhost:3000 via `turbo dev`.
- **`apps/agent`** starts alongside web under `pnpm dev`. Without
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` it logs
  `"...run in mock idle mode"` and sleeps — this is expected, not an error.
- Supabase local (`npx supabase start` / `db reset`) needs Docker, which is
  **not** installed on the VM. It is optional: the web app defaults to
  **Local Sandbox** mode (built-in mock data) when `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` are unset, and is fully demoable that way (ingest a
  program, approve it, then Send to see the O-number remap + status).

### Build ordering (important)

- `turbo dev` does **not** build first, and `apps/web` imports the compiled
  `@tapeworm/shared` (`workspace:*` -> `dist/`). Run `pnpm build` at least once
  before `pnpm dev` (the update script does not build). Rebuild after editing
  `packages/shared`. `apps/agent`'s dev script runs `node --watch dist/index.js`,
  so it also needs a prior `pnpm build`.
- Ignore the README's `pnpm approve-builds` step: native builds
  (`esbuild`, `@serialport/bindings-cpp`) are already allow-listed in
  `pnpm-workspace.yaml` and compile automatically during `pnpm install`.
  `approve-builds` is interactive and unnecessary.

### Rust core (`core/`, optional)

- `cargo test` and `cargo fmt --check` pass. `cargo clippy` passes with one
  pre-existing pedantic warning (`missing_errors_doc` on `list_ports`), so
  `cargo clippy -- -D warnings` exits non-zero on that unrelated lint.
- Requires a Rust toolchain with `edition2024` support (>= 1.85; the VM has
  stable installed) because a transitive dependency needs it, plus the system
  `libudev-dev` + `pkg-config` for the `serialport` crate (both preinstalled).

### Lint / type-check

- Per `CLAUDE.md`: `pnpm lint` and `pnpm type-check` are effectively no-ops
  (no package implements those scripts). Rust is the only real lint tooling.
