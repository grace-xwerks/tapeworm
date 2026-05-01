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

## Open questions

- [ ] Do we need a webview for live transmission monitoring, or is the OutputChannel enough? (Start with OutputChannel.)
- [ ] G-code language support — bundle a grammar, or just rely on existing community extensions? (Rely on existing.)
- [ ] How to test without hardware in CI? `serialport` has a mock binding (`@serialport/binding-mock`) — use it for unit tests.
- [ ] Bluetooth-serial / USB-over-IP adapters — assume they enumerate as a normal COM port and don't special-case (yet).

## Things to NOT do (yet)

- No protocol-specific stuff (Heidenhain LSV/2, Mazak's bidirectional file mode, etc.) — RS-232 streaming first, fancy protocols later if anyone asks.
- No "auto-detect machine" magic — let the user pick a profile.
- No telemetry.
