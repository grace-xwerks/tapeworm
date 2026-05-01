# Tapeworm

> Stream G-code from VS Code to your CNC over RS-232. Drip feed, send, receive — Haas, Fanuc, Mazak, Mitsubishi.

A VS Code extension for moving CNC programs between your editor and a machine tool control over a serial port. Edit G-code in VS Code, hit a command, and it goes out the wire with the right baud, parity, stop bits, and handshake. Programs come back the same way and land in a fresh editor tab.

The name is a nod to the paper-tape ancestry of all this — same protocol, fewer moving parts.

Beyond the wire, Tapeworm is designed to close the loop between **Autodesk Fusion → Git → the machine → back to Fusion Team**. Pull NC programs from a Fusion Hub via the Manufacturing Data Model GraphQL API, send them to the control over RS-232, capture what comes back, and push the diff to the Hub with full provenance. A companion MCP server lets Claude, Copilot, or any MCP-aware client drive the whole flow in natural language. See [TODO.md](TODO.md) Phases 9–11.

## Status

Pre-implementation. This repo is currently planning docs only. See [TODO.md](TODO.md) for the build plan.

## What it'll do

- **Send active file** — push the file you're editing out to the configured COM port.
- **Receive into a new tab** — listen on the port and capture an incoming program.
- **Drip feed** — for programs too big for the control's memory, stream paced by XON/XOFF or RTS/CTS.
- **Per-machine profiles** — pick `Haas-VF2` or `Fanuc-0i` and skip the bit-twiddling.
- **Status bar + log channel** — see the port, baud, and bytes flowing; transmission log for when something looks wrong.
- **Framing knobs** — leading/trailing `%`, null padding, EOL choice. The old controls are picky.

## RS-232 settings, briefly

The settings on **both ends must match exactly** — mismatched parity is silent garbage, mismatched stop bits is a hang. Tapeworm exposes everything; it doesn't guess. Common starting points:

| Control          | Baud      | Data | Parity | Stop | Handshake |
|------------------|----------:|-----:|--------|-----:|-----------|
| Haas             | 9600      | 7    | Even   | 1    | XON/XOFF  |
| Fanuc 0/0i       | 4800–9600 | 7    | Even   | 2    | XON/XOFF  |
| Mazak (Mazatrol) | 4800      | 8    | None   | 1    | RTS/CTS   |
| Mitsubishi       | 9600      | 8    | None   | 1    | XON/XOFF  |

Sources at the bottom of this file.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (5.9.x stable; 6.0 GA, 7.0 in beta as of May 2026) | Pin to 5.9 — ecosystem is mid-migration to 6.0. |
| Runtime | Whatever Electron Node ships in the user's VS Code | We don't control this; native modules need to match. |
| Serial I/O | [`serialport`](https://www.npmjs.com/package/serialport) (13.x) | De-facto Node serial library, all three OSes, flow control included. |
| `engines.vscode` | `^1.95` (latest `@types/vscode` is 1.110) | Set the floor a few months back so corporate stable channels can install. |
| Bundler | esbuild | What the VS Code team recommends. See native-module caveat below. |
| Scaffold | `yo code` | Canonical extension layout. |
| Packaging | `@vscode/vsce` | Builds the `.vsix`, publishes to Marketplace. |
| Tests | `@vscode/test-electron` + Mocha; `@serialport/binding-mock` for unit tests without hardware | Standard. |

> Don't trust those version numbers blindly — `npm view <pkg> version` before pinning. The TODO has the checklist.

### The native-module thing

`serialport` ships a native binding (`.node`). That means:

1. **esbuild won't bundle it.** Mark `serialport` and `@serialport/bindings-cpp` as `external` in the esbuild config and ship `node_modules/serialport/**` inside the `.vsix`. Make sure `.vscodeignore` doesn't exclude it.
2. **Electron Node ABI ≠ npm Node ABI.** `serialport` 12+ ships Electron prebuilds, so this usually Just Works. When it doesn't, the user sees a `NODE_MODULE_VERSION` error and needs an `electron-rebuild`-style step.

Both pitfalls are documented in `~/.claude/projects/.../memory/vscode_native_modules.md` so future-me doesn't re-learn them.

## Project layout (planned)

```
tapeworm/
├── package.json          # manifest: commands, settings schema, activation
├── esbuild.js            # serialport marked external
├── src/
│   ├── extension.ts      # activate / deactivate
│   ├── serial/
│   │   ├── port.ts       # SerialPort wrapper
│   │   └── profiles.ts   # built-in machine profiles
│   ├── commands/
│   │   ├── send.ts
│   │   ├── receive.ts
│   │   └── listPorts.ts
│   └── ui/
│       ├── statusBar.ts
│       └── output.ts
└── test/
```

## Configuration (planned)

Contributed via `contributes.configuration`:

- `tapeworm.port` — `"COM3"`, `"/dev/tty.usbserial-A1"`, etc.
- `tapeworm.baudRate` — 300 / 600 / 1200 / 2400 / 4800 / 9600 / 19200 / 38400 / 57600 / 115200
- `tapeworm.dataBits` — 5 | 6 | 7 | 8
- `tapeworm.parity` — `none` | `even` | `odd` | `mark` | `space`
- `tapeworm.stopBits` — 1 | 2
- `tapeworm.flowControl` — `none` | `xonxoff` | `rtscts`
- `tapeworm.endOfLine` — `crlf` | `lf` | `cr`
- `tapeworm.startCharacter` / `endCharacter` — usually `%`
- `tapeworm.nullPadding` — leading nulls for paper-tape-era controls
- `tapeworm.profiles` — array of named overrides

## Commands (planned)

- `Tapeworm: Send Active File`
- `Tapeworm: Receive Program`
- `Tapeworm: List Serial Ports`
- `Tapeworm: Pick Profile`
- `Tapeworm: Show Transmission Log`

## Building (will fill in once scaffolded)

```bash
npm install
npm run watch       # auto-rebuild
# F5 in VS Code → Extension Development Host
npm run package     # builds the .vsix
```

## Notes & caveats

- **Native module.** `serialport` ships a native binding. We mark it `external` to esbuild and bundle it unmodified inside the `.vsix`. If you see a `NODE_MODULE_VERSION` mismatch on activation, your VS Code's Electron Node ABI doesn't match the prebuilt — rebuild the bindings against your installed VS Code. (`serialport` 12+ ships Electron prebuilds, so this is rare in practice.)
- **APS subscription required for Hub features.** The Phase 10 Autodesk integrations (Manufacturing Data Model GraphQL, Fusion Automation API, etc.) hit Autodesk Platform Services. As of May 2026, APS introduced paid tiers for several APIs; included usage now ships with qualifying Autodesk subscriptions, and a free tier remains for experimentation. The core RS-232 transfer (Phases 1–8) does **not** depend on APS — Tapeworm works fully offline against a serial cable. Hub sync is opt-in.
- **The shop floor is not the programming desk.** Often the PC with the serial cable isn't the same one a programmer edits on. We support both: full extension on the programming desk; a smaller CLI / companion mode for the floor.

## References

**RS-232 / serial:**
- [serialport on npm](https://www.npmjs.com/package/serialport) · [serialport.io docs](https://serialport.io/)
- [machinetoolhelp: per-control RS-232 settings](https://www.machinetoolhelp.com/Applications/RS232Communications.html)
- [Fanuc 0i configuration (factorywiz KB)](https://kb.factorywiz.com/portal/en/kb/articles/fanuc-0i-configuration-document)

**VS Code extensions:**
- [VS Code Extension API](https://code.visualstudio.com/api) · [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) · [Manifest reference](https://code.visualstudio.com/api/references/extension-manifest)

**Autodesk Platform Services (Phase 10 territory):**
- [Fusion Automation API](https://aps.autodesk.com/apis-and-services/fusion-automation-api) — GA, ~7000 endpoints, hub I/O, NC programs, manufacturing setups
- [Manufacturing Data Model API (GraphQL)](https://aps.autodesk.com/manufacturing-data-model-api) · [About GraphQL](https://aps.autodesk.com/en/docs/mfgdataapi/v1/developers_guide/about-graphql)
- [APS MCP server (Node.js, official)](https://github.com/autodesk-platform-services/aps-mcp-server-nodejs) · [DevCon 2026 MCP workshop](https://autodesk-platform-services.github.io/mcp-devcon2026/)
- [Bringing Fusion onto Claude (APS blog)](https://aps.autodesk.com/blog/bringing-fusion-claude-creative-work)
- [Autodesk Fusion Post Processor Utility (VS Code)](https://marketplace.visualstudio.com/items?itemName=Autodesk.hsm-post-processor) · [source](https://github.com/Autodesk/cam-posteditor)

## License

MIT (planned). See [LICENSE](LICENSE) once added.
