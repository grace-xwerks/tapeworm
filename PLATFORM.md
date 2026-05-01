# Tapeworm Platform — Architecture Sketch

> Internal-facing strategy doc. Not user-facing. Not committed publicly until intentional.

This document captures the broader vision behind Tapeworm. The VS Code extension shipping in v1 is one client of a manufacturing data platform that closes the loop **Fusion → Git → Machine → Hub**, with AI-assisted setup, validation, and discovery.

The goal of this doc is to make the architecture concrete enough to socialize internally and review before any of it is built. Nothing here is a commitment.

## What we're really building

Three surfaces, one product:

1. **The wire** — RS-232 / Ethernet / USB to CNC controls. Where Tapeworm started.
2. **The cloud** — Autodesk Platform Services (Fusion Automation API, Manufacturing Data Model GraphQL) plus our own subgraphs for fleet telemetry, audit trail, and AI suggestions.
3. **The intelligence** — LLM-assisted settings discovery, NC validation, semantic search across program history, and (eventually) operator voice UI.

VS Code is one frontend. The platform supports many.

## Open-core split

```
┌─────────────────────────────────────────────────────────────────┐
│                          OPEN SOURCE                            │
│                                                                 │
│  tapeworm-mcp        tapeworm-cli        tapeworm-vscode        │
│  (MCP server)        (headless)          (extension)            │
│                                                                 │
│  tapeworm-profiles                tapeworm-graphql-schema       │
│  (community machine               (subgraph SDLs without        │
│   profile registry)               resolvers)                    │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │ GraphQL (HTTPS) or local stdio
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                          CLOSED SOURCE                          │
│                                                                 │
│  GraphQL Gateway (Apollo Federation)                            │
│  ├─ APS subgraphs (Manufacturing Data Model, Fusion Automation) │
│  ├─ Fleet subgraph (machine telemetry, audit trail)             │
│  └─ AI subgraph (settings discovery, NC validation, search)     │
│                                                                 │
│  Multi-tenant Hub sync · Auth · Billing · Org management        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Open

| Package | Purpose | License |
|---|---|---|
| `tapeworm-mcp` | MCP server exposing wire + Hub tools | Apache-2.0 + CLA |
| `tapeworm-cli` | Headless `tapeworm send`/`receive` | Apache-2.0 + CLA |
| `tapeworm-vscode` | Reference VS Code client | Apache-2.0 + CLA |
| `tapeworm-profiles` | Community machine profile registry (JSON/YAML) | CC0 or Apache-2.0 |
| `tapeworm-graphql-schema` | Subgraph SDLs (no resolvers) | Apache-2.0 |

Why Apache-2.0 + CLA over MIT: enterprise-friendly, allows dual-licensing later, patent grant. Avoid AGPL on open parts — it scares the user base we want.

### Closed

- **GraphQL gateway** — Apollo Federation composing APS subgraphs with our own. One contract, many clients.
- **AI inference** — settings discovery, G-code validation, semantic search, voice UI. The prompts and machine-tuning data are the moat.
- **Hub sync engine** — handles OT-style merging when collaborative editing on Hubs lands; throttles, retries, audits.
- **Identity / billing / org management** — standard SaaS plumbing.

## Frontend lineup

All consume the same gateway. Build as audiences justify.

| Frontend | Audience | Stack | Priority |
|---|---|---|---|
| **VS Code extension** | Programmer's desk | TS + esbuild + GraphQL | v1 (now) |
| **`tapeworm-mcp` server** | Any AI client (Claude, Cursor, Copilot) | Node + MCP SDK | v1.5 |
| **CLI** | CI, scripts, headless transfers | Node or Rust | v1.5 |
| **Tauri desktop app** | Shop-floor PC, fleet view | Rust + React/Svelte | v2 |
| **Web app at tapeworm.dev** | Marketing, collab view, Hub explorer | Next.js + Apollo | v2 |
| **Mobile (operator)** | Tablet at the machine | Tauri 2.x mobile | speculative |

### Why Tauri (not Electron) for the desktop frontend

Shop-floor PCs are often locked-down Windows boxes with limited specs and sometimes Windows 7. Numbers from 2026 benchmarks:

- **Bundle size:** Tauri ~3 MB vs Electron 150 MB+
- **Startup:** Tauri <500 ms vs Electron 1–2 s on mid-range
- **Memory:** ~30% lower
- **Mobile:** Tauri 2.x supports it; Electron does not

Bonus: native serial in Rust (`serialport` Rust crate, `tokio-serial`) avoids the Electron Node ABI rebuild dance entirely.

## Auth model

- **Individual users** → 3-legged OAuth (PKCE) inside VS Code / Tauri / web. Tokens cached in OS keychain via `SecretStorage`.
- **CI / shop-floor headless** → Secure Service Accounts (SSA) provisioned via `ssa-manager.autodesk.io`.
- **AI gateway calls** → server-side service tokens; never expose APS keys to clients.
- **MCP server (local mode)** → user provides their own APS credentials in env vars. We never see them.
- **MCP server (gateway mode)** → talks to our gateway with the user's Tapeworm token; we mediate APS calls server-side.

## GraphQL strategy

APS is going GraphQL across the board (AEC mutations in public beta, Manufacturing Data Model, Data Exchange). Build our data layer once around GraphQL and we're aligned with the platform direction.

- **Client:** `urql` or `graphql-request` for the VS Code extension; Apollo Client for web/Tauri (cache, devtools, dedup).
- **Codegen:** `graphql-codegen` from APS schema introspection + our own SDLs. Types, hooks, mock helpers all generated.
- **Subscriptions:** when an APS endpoint exposes them, surface as live updates in the UI. Wire ourselves up early so collaborative editing on Hubs slots in cleanly.
- **Federation:** Apollo Federation v2 for the gateway — APS subgraphs + our subgraphs compose into one supergraph. Single endpoint, many sources.

## AI surface — concrete features

In rough order of "useful first / risky last":

1. **Settings discovery** — "Mitsubishi M70, getting garbage at 9600/8N1" → walks a structured troubleshoot tree, proposes adjustments, reads result. Each successful handshake is training data.
2. **G-code static validation** — feed-rate sanity, tool-table consistency, bounds vs stock. Structured rules + LLM explanations.
3. **Semantic search over Hub history** — "find every program that machined a 1/4-20 thread on 304 stainless." Vector embeddings over NC + setup metadata. Cheap, very hard for incumbents to replicate without our data.
4. **Post-processor diff explainer** — pair with the Autodesk extension; "what does Fusion 2026.3 post change vs 2026.2 for our shop?"
5. **Operator voice UI** — hands-free at the machine. "Send the latest revision of part 47B." Highest risk, highest wow.

## Data we accumulate (the moat)

Every shop using Tapeworm contributes:

- **Successful handshakes** — control + cable + adapter + settings combinations that worked. Training set for #1 above. Anonymizable.
- **Profile fingerprints** — small variations from the canonical Haas/Fanuc profiles. Improves the registry.
- **NC corpora (opt-in)** — for shops that opt in, anonymized G-code teaches the validator and search.
- **Operator edits** — diff-against-machine catches them; corpus shows what programmers commonly miss.

Without this data, a competitor cloning the OSS pieces still has nothing useful for the AI features.

## Build order

1. **Tapeworm v1** — Phases 1–8.5 of [TODO.md](TODO.md). Single repo, VS Code only. Get real users on real RS-232.
2. **Extract `tapeworm-core`** — pure serial logic into a Rust crate, callable from Node via `napi-rs` for now, reusable in Tauri later.
3. **`tapeworm-mcp`** — separate package in this repo. Open source. Composes with the official APS MCP.
4. **Minimal gateway** — Apollo Federation, one AI tool (settings discovery), closed source.
5. **Tauri desktop app** — pointed at the gateway, talks to `tapeworm-core` for the wire.
6. **`tapeworm.dev` web app** — marketing + Hub explorer + profile registry browser.

Resist building the gateway before the extension has users. Each step earns the next.

## Risks

- **Scope explosion.** This document describes a 2–3 year build. The discipline is shipping v1 first and letting demand pull each next piece forward. Anything we build before someone asks is speculative.
- **APS API drift.** Manufacturing Data Model is GraphQL; AEC mutations are public beta; Fusion Automation is GA but the schema will evolve. Codegen + integration tests against APS staging mitigate but don't eliminate.
- **Pricing.** APS introduced paid tiers in May 2026. Hub features cost the user (or us, if we proxy). Keep the offline RS-232 path always free; gate cloud features behind a subscription.
- **Brand naming.** "Tapeworm" is great for one extension, weird for an enterprise platform. Plan now: keep Tapeworm as the wire-protocol component name; pick a parent brand for the platform.
- **Insider info.** Designing for collaborative editing on Hubs is fine; marketing against it before Autodesk announces is not. Keep it in the architecture, out of the README.
- **Competition catching up.** Chatter NC + the various Fusion MCPs already exist. Defensible position is the *combination*: only Tapeworm goes Hub → wire → Hub with AI in the loop.

## What "noticed by Autodesk" actually requires

- A working demo that closes the manufacturing loop end-to-end. One video.
- The MCP server composing cleanly with `autodesk-platform-services/aps-mcp-server-nodejs` in a single Claude Desktop config.
- Showing up at DevCon 2027 (or earlier if a relevant track opens) with a session pitch.
- Open-sourcing the MCP server so it travels in conference talks and blog posts that aren't ours.
- Not over-claiming. Autodesk insiders are technical; weak demos lose credibility fast.
