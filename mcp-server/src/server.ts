#!/usr/bin/env node
/**
 * tapeworm-mcp — Model Context Protocol server exposing CNC RS-232 transfer tools.
 *
 * Skeleton only. Tools currently return stubs; real serial I/O lands once the
 * core tapeworm extension's serial layer is extracted to a shared module.
 *
 * Composes alongside autodesk-platform-services/aps-mcp-server-nodejs in a
 * single MCP client config so an AI agent can drive the whole loop:
 * Hub -> NC pull -> machine send -> receive -> diff -> Hub push.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "tapeworm-mcp",
  version: "0.0.1",
});

server.registerTool(
  "list_serial_ports",
  {
    title: "List serial ports",
    description: "Enumerate serial ports visible to the host.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ stub: true, ports: [] }, null, 2),
      },
    ],
  }),
);

server.registerTool(
  "send_program",
  {
    title: "Send program to machine",
    description:
      "Send a G-code file to the configured CNC control over RS-232. Honors the named machine profile.",
    inputSchema: {
      file: z.string().describe("Absolute path to the .nc/.cnc file"),
      machine: z
        .string()
        .describe("Profile name (e.g. 'haas-vf2', 'fanuc-0i')"),
    },
  },
  async ({ file, machine }) => ({
    content: [
      {
        type: "text",
        text: `[stub] would send ${file} to ${machine}`,
      },
    ],
  }),
);

server.registerTool(
  "receive_program",
  {
    title: "Receive program from machine",
    description:
      "Listen on the configured port and capture an incoming program until end-of-transmission or idle timeout.",
    inputSchema: {
      machine: z.string(),
      timeoutSec: z.number().int().positive().default(10),
    },
  },
  async ({ machine, timeoutSec }) => ({
    content: [
      {
        type: "text",
        text: `[stub] would receive from ${machine} (timeout=${timeoutSec}s)`,
      },
    ],
  }),
);

server.registerTool(
  "diff_against_machine",
  {
    title: "Diff repo file against current machine program",
    description:
      "Receive the program currently on the control and diff it against the local file. Catches operator edits at the panel.",
    inputSchema: {
      file: z.string(),
      machine: z.string(),
    },
  },
  async ({ file, machine }) => ({
    content: [
      {
        type: "text",
        text: `[stub] would diff ${file} against live program on ${machine}`,
      },
    ],
  }),
);

server.registerTool(
  "pull_from_hub",
  {
    title: "Pull NC from Fusion Team Hub",
    description:
      "Query Manufacturing Data Model GraphQL for the latest NC program of a setup and return the contents. Requires APS auth.",
    inputSchema: {
      setupId: z.string().describe("Manufacturing setup ID in the Hub"),
    },
  },
  async ({ setupId }) => ({
    content: [
      {
        type: "text",
        text: `[stub] would pull NC for setup ${setupId} via APS Manufacturing Data Model API`,
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
