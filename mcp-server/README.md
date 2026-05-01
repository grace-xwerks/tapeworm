# tapeworm-mcp

Model Context Protocol server exposing Tapeworm's CNC RS-232 transfer and Hub-sync tools to AI clients (Claude Desktop, Cursor, VS Code Copilot, etc.).

**Status:** skeleton. Tools return stubs. Wire-up against the real serial layer lands once `tapeworm-core` is extracted from the VS Code extension.

## Tools (planned)

| Tool | Purpose |
|---|---|
| `list_serial_ports` | Enumerate available COM ports on the host. |
| `send_program` | Send a `.nc` file to a configured machine. |
| `receive_program` | Capture an incoming program from a machine. |
| `diff_against_machine` | Diff the live program on a control against the repo file. |
| `pull_from_hub` | Pull the latest NC for a manufacturing setup via APS Manufacturing Data Model GraphQL. |

## Composes with the official APS MCP

Designed to coexist with [`autodesk-platform-services/aps-mcp-server-nodejs`](https://github.com/autodesk-platform-services/aps-mcp-server-nodejs) in a single MCP client config. The combination lets an agent walk the entire manufacturing loop:

```
Hub (APS MCP) -> NC pull (tapeworm-mcp) -> machine send (tapeworm-mcp)
   -> receive (tapeworm-mcp) -> diff (tapeworm-mcp) -> Hub push (APS MCP)
```

## Develop

```bash
npm install
npm run watch
```

## Run

```bash
npm run build
npm start
```

## Wire into Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tapeworm": {
      "command": "node",
      "args": ["/absolute/path/to/tapeworm/mcp-server/dist/server.js"]
    }
  }
}
```

## Wire into VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "tapeworm": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/mcp-server/dist/server.js"]
    }
  }
}
```

## License

Apache-2.0 (planned). CLA required for contributions to enable future dual-licensing.
