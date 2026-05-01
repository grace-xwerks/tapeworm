# TODO

Build plan for the `tapeworm` extension. Tackle top-to-bottom; each phase ends in something runnable.

## Phase 0 — Verify versions before scaffolding

Don't blindly copy versions from this file. Run these before `npm install`:

- [ ] `npm view @types/vscode version` — was 1.110.0 at planning time (May 2026)
- [ ] `npm view serialport version` — was 13.0.0
- [ ] `npm view typescript version` — was 5.9.x stable; 6.0 GA; 7.0 in beta
- [ ] `npm view @vscode/vsce version`
- [ ] `npm view esbuild version`
- [ ] Decide `engines.vscode` floor — pick a version ~3–6 months old so corporate users on stable channels can install

## Phase 1 — Scaffold

- [ ] `npm install -g yo generator-code` and run `yo code` → "New Extension (TypeScript)"
- [ ] Commit the bare scaffold as its own commit so future diffs are clean
- [ ] Switch bundler to esbuild if the generator picks webpack
- [ ] Add `.editorconfig`, hook up Prettier
- [ ] Confirm F5 launches the Extension Development Host and the "Hello World" command fires

## Phase 2 — Serial plumbing (no UI yet)

- [ ] `npm install serialport`
- [ ] Mark `serialport` (and `@serialport/bindings-cpp`) as **external** in `esbuild.js`
- [ ] Update `.vscodeignore` so `node_modules/serialport/**` and bindings ship inside the .vsix
- [ ] Write `src/serial/port.ts`: thin wrapper around `SerialPort` exposing `open(opts)`, `write(buf)`, `onData(cb)`, `close()`
- [ ] Manual test: list ports, open a loopback (jumper TX↔RX on a USB-serial dongle), write "TEST", confirm echo
- [ ] Verify the extension still loads after packaging into a `.vsix` and installing in a clean VS Code (this is where native-module ABI bugs surface)

## Phase 3 — First command: list ports

- [ ] Register `rs232.listPorts` command — shows a quick-pick of `SerialPort.list()` results
- [ ] Add an OutputChannel "RS-232" for logging
- [ ] Add status bar item showing the currently selected port

## Phase 4 — Send active file

- [ ] Configuration schema in `package.json` (port, baud, data, parity, stop, flow control, EOL, start/end chars, null padding)
- [ ] `rs232.sendActiveFile` command:
  - read the editor's current document
  - normalize line endings per setting
  - prepend/append framing chars and null padding
  - open port with configured options
  - write in chunks, respecting XON/XOFF if `flowControl: xonxoff`
  - progress notification (`vscode.window.withProgress`) showing bytes sent
  - close port on completion or cancel
- [ ] Test against a serial terminal (PuTTY / `screen`) on the other end before risking a real machine

## Phase 5 — Receive

- [ ] `rs232.receiveProgram` command:
  - open port, accumulate incoming bytes
  - end on either: trailing `%`, configurable idle timeout (default 3s), or user cancel
  - strip framing, open result in a new untitled editor tab with language=`gcode` (or plaintext if no G-code grammar)
- [ ] Decide behavior on overrun / parity errors — log and continue vs. abort

## Phase 6 — Profiles

- [ ] Built-in profiles: Haas, Fanuc-0i, Mazak-Mazatrol, Mitsubishi-M70 (settings cribbed from machinetoolhelp + factorywiz)
- [ ] `rs232.pickProfile` command — quick-pick that writes the chosen profile into workspace settings
- [ ] User-defined profiles in `rs232.profiles` array

## Phase 7 — Drip feed

- [ ] Long-file mode: chunked send paced by XON/XOFF or RTS/CTS
- [ ] Cancel button in the progress notification actually halts mid-transfer
- [ ] Pause/resume? (defer unless someone asks)

## Phase 8 — Polish & ship

- [ ] README: install, configure, troubleshoot (NODE_MODULE_VERSION, "port in use", parity garbage, etc.)
- [ ] CHANGELOG.md
- [ ] Icon + gallery banner (Marketplace requirement)
- [ ] LICENSE (MIT unless reason otherwise)
- [ ] `vsce package` → install the .vsix locally on a fresh VS Code → smoke test
- [ ] Marketplace publish (`vsce publish`) — needs a publisher account + PAT

## Phase 9 — Differentiation (post v1)

The wire protocol isn't where this product wins. The seam between Fusion → VS Code/Git → machine is. Land these only after Phases 1–8 are stable; treat them as v1.5.

- [ ] **Cooperate with the Autodesk Post Processor Utility extension** (`Autodesk.hsm-post-processor`)
  - Detect when it's installed (`vscode.extensions.getExtension`).
  - When the user runs the post processor and produces NC output, surface a `Tapeworm: Send to Machine` code lens / button on the resulting file.
  - No fork, no replacement — we ride alongside. Their extension does CAM-side post dev; we do the wire.
- [ ] **Git-native shop workflow**
  - On send: option to auto-commit (or auto-tag) the file with the active machine profile, baud, and timestamp in the trailer.
  - On receive: write incoming program to a configurable `machine/<name>` branch (or `received/<machine>/<timestamp>.nc`). Operator edits at the panel become a real commit, signed by the machine.
- [ ] **Diff-against-machine** command
  - Receive current program from the control, diff against the working-tree file. Highlight operator edits.
  - This is the killer demo. Nobody in this space has it.
- [ ] **Multi-machine fleet**: workspace can declare N machines; status bar shows which is "armed"; `Tapeworm: Arm <machine>` switches the active target.

## Phase 10 — Deep Autodesk integration (v2)

This is the credibility play. Goal: be the obvious answer when an Autodesk insider asks "how does the manufacturing-data-model loop close at the machine?"

- [ ] **Hub-aware NC pulls** (read path)
  - Use the Manufacturing Data Model API (GraphQL) to query the latest NC program for a manufacturing setup in a Fusion Team hub.
  - Command: `Tapeworm: Pull NC from Hub` → quick-pick of recent setups → drops the NC into the editor.
  - Schema: queries components/setups/operations/relationships. Codegen the GraphQL types from the schema (`graphql-codegen`) so we don't hand-roll them.
- [ ] **Hub-aware NC pushes** (write path)
  - Programs received from the machine (or edited in VS Code) can be pushed back to a Hub folder via the Fusion Automation API or Data Management API. Versioned, with metadata: source machine, baud, parity, timestamp.
  - Honors the same `machine/<name>` branching idea but in Autodesk-native terms.
- [ ] **Authentication**
  - 3-legged OAuth (PKCE) for normal user flow — interactive sign-in inside VS Code.
  - Secure Service Account (SSA) flow for headless / CI scenarios. Configure via [ssa-manager.autodesk.io](https://ssa-manager.autodesk.io).
  - Cache tokens via VS Code's `SecretStorage` API. Never to disk.
- [ ] **GraphQL across the board**
  - APS is GraphQL-first now: AEC Data Model (mutations in public beta), Manufacturing Data Model, Data Exchange. Build the data layer once around `graphql-request` or `urql`, not per-endpoint REST clients.
  - Subscriptions (when supported on a given API) for live hub updates — sets us up for collaborative editing landing soon.
- [ ] **Tapeworm MCP server** (the headline feature)
  - Ship `tapeworm-mcp` as a sibling Node package. Exposes MCP tools: `list_ports`, `send_program(file, machine)`, `receive_program(machine, timeout)`, `diff_against_machine(file, machine)`, `pull_from_hub(setup_id)`.
  - Integrates with Claude Desktop, VS Code Copilot, Cursor, anything MCP-aware.
  - Reuse the official `autodesk-platform-services/aps-mcp-server-nodejs` patterns for SSA-based auth so it composes cleanly with Autodesk's own MCPs in a single client.
  - Pitch: "natural-language CNC over RS-232, with full provenance back to the Hub."
- [ ] **Be ready for Hubs collaborative editing**
  - When NC programs become live-editable in a Hub, build a "the Hub copy changed under you" notification with optional auto-pull. Avoid stomping a programmer who's actively editing the same file in VS Code.
  - Use OT-aware merging if the API exposes it; otherwise fall back to last-writer-wins with a visible warning.

## Phase 11 — Outreach (when Phase 10 is real, not before)

- [ ] Public blog post: "RS-232 to Hub: closing the manufacturing data loop in VS Code." Tag relevant APS folks.
- [ ] Submit a session pitch to next Autodesk DevCon if the timing lines up.
- [ ] Open-source the MCP server even if the main extension stays closed; MCP servers travel further than VS Code extensions.

## Open questions

- [ ] Do we need a webview for live transmission monitoring, or is the OutputChannel enough? (Start with OutputChannel.)
- [ ] G-code language support — bundle a grammar, or just rely on existing community extensions? (Rely on existing.)
- [ ] How to test without hardware in CI? `serialport` has a mock binding (`@serialport/binding-mock`) — use it for unit tests.
- [ ] Which APS API is the right NC fetch path? Manufacturing Data Model (GraphQL, cleaner) vs. Data Management API (REST, broader). Probably MDM for query, Data Mgmt or Fusion Automation API for write-back. Confirm with a spike.
- [ ] Codegen GraphQL types — `graphql-codegen` config; how to keep schemas in sync when APS evolves them.
- [ ] Should the MCP server live in this repo (monorepo) or a separate `tapeworm-mcp` repo? Probably monorepo with two `package.json`s — easier to keep auth code in sync.
- [ ] Bluetooth-serial / USB-over-IP adapters — assume they enumerate as a normal COM port and don't special-case (yet).

## Things to NOT do (yet)

- No protocol-specific stuff (Heidenhain LSV/2, Mazak's bidirectional file mode, etc.) — RS-232 streaming first, fancy protocols later if anyone asks.
- No "auto-detect machine" magic — let the user pick a profile.
- No telemetry.
