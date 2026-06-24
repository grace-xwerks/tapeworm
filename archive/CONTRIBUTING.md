# Contributing to Tapeworm

Thanks for the interest. A few things to know before you spend time on a change.

## Repo layout

```
tapeworm/
├── README.md           # user-facing intro
├── PLATFORM.md         # internal architecture sketch (open-core, Hub integration)
├── TODO.md             # build plan, phased
├── mcp-server/         # tapeworm-mcp — MCP server (Apache-2.0)
├── core/               # tapeworm-core — Rust serial logic crate (Apache-2.0)
└── (extension code)    # the VS Code extension (Apache-2.0)
```

## Licensing

All code in this repository is licensed **Apache-2.0**.

This is an **open-core** project. The pieces in this repo (the VS Code extension, the MCP server, the Rust core, the CLI when it lands, and the machine profile registry) are open and will stay open. A separate hosted gateway and the AI inference layer that consumes this code are closed source. See [PLATFORM.md](PLATFORM.md) for the broader picture.

We chose Apache-2.0 over MIT for the patent grant and over AGPL because AGPL scares the user base we want.

## Contributor License Agreement

By submitting a pull request you agree to the project's CLA. The CLA grants the project the right to dual-license your contribution if a future need arises (for example, distributing a Marketplace build under proprietary terms while keeping the source open). It does **not** transfer copyright; you keep that.

The CLA bot will prompt you on your first PR. The full text will be linked from that prompt. If we move tooling later we'll keep the CLA history intact.

If you can't sign the CLA — for example, an employer policy blocks it — open an issue first and we'll figure out an alternative (often: you describe the change, we implement it).

## What good contributions look like

**Yes:**
- New machine profiles in [`tapeworm-profiles`](#) (when that repo exists). Cite the source for the settings (control manual page, CNCzone thread, vendor doc).
- Bug fixes with a reproduction case — even a written one is fine if hardware is needed.
- Test coverage for code paths that don't have any.
- Documentation fixes, especially in the per-control settings tables.
- Performance work in the Rust core, with before/after numbers.

**Probably no, ask first:**
- New top-level features. Open an issue describing the use case before writing code; the roadmap is opinionated and you may be duplicating Phase N work.
- Refactors that don't tie to a specific bug or feature.
- New dependencies, especially native ones — the [native module gotcha](README.md#the-native-module-thing) means we are conservative about adding anything that compiles C/C++.
- Anything that calls Autodesk APIs without a clear authentication story.

**No:**
- Removing the Apache-2.0 license headers.
- Adding telemetry without an explicit opt-in flow and clear documentation of what is collected.
- Bundling AGPL or GPL dependencies — we can't ship them under Apache-2.0.
- Vendor lock-in (e.g., a refactor that only works against a specific CAM vendor).

## How to propose a change

1. Open an issue describing the problem or feature. Tag with the relevant `phase:*` and `area:*` labels.
2. Wait for a thumbs-up before writing significant code. For trivial fixes, skip this.
3. Branch from `main`. Branch names like `feat/diff-against-machine` or `fix/parity-garbage-on-fanuc` are great.
4. Keep PRs focused. One concern per PR.
5. Run lint and tests locally before pushing. Hardware-dependent tests can be skipped; document what you couldn't verify.
6. Sign the CLA when prompted on your first PR.

## Code style

- **TypeScript:** Prettier defaults, ESLint as configured in the repo. Don't reformat files unrelated to your change.
- **Rust:** `cargo fmt` and `cargo clippy -- -D warnings`. Use `thiserror` for library errors, `anyhow` only at binary edges.
- **Comments:** explain *why*, not *what*. The code already says what.
- **Tests:** prefer integration tests against `@serialport/binding-mock` (Node) or a virtual serial pair (Rust) over heavily mocked unit tests.
- **Commits:** present-tense imperative ("Add Mazak-M70 profile", not "Added"). Body when the why isn't obvious.

## Security

If you find something security-sensitive (auth bypass, credential leak, ability to send arbitrary code to a control without consent), please **don't** open a public issue. Use GitHub Security Advisories on the repo, or email the maintainers directly. We'll respond within 72 hours.

Things that are not security issues even if they look like them:
- The serial port can be sent arbitrary bytes by anyone who can run the extension. That's the entire purpose; it's by design.
- Native module rebuild errors. Annoying, not a vulnerability.

## Code of conduct

Be decent. We'll add a formal CoC if the contributor base grows enough to need one. Until then, the rule is: machinists and software engineers are equally welcome, and neither group condescends to the other.

## Questions

Open a discussion, or comment on the most relevant tracking issue. Phase issues ([#1–14](https://github.com/grace-xwerks/tapeworm/issues)) are good landing spots for "I want to help with X" questions.
