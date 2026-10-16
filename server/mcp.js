#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "../shared/automation/tools.js";
const base = process.env.P5COMP_URL || "http://127.0.0.1:3001";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base))
  throw Error("P5COMP_URL must be a loopback URL.");
let token;
async function request(path, body, retry = true) {
  token ??= (await (await fetch(base + "/api/agent/config")).json()).token;
  const r = await fetch(base + "/api/agent" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && retry) {
    token = null;
    return request(path, body, false);
  }
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Agent API request failed.");
  return data;
}
const server = new Server(
  { name: "p5comp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "p5comp_sessions",
      description:
        "List live p5comp browser workspaces. Choose an explicit sessionId for every subsequent tool call.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    ...TOOLS.map((t) => ({
      ...t,
      inputSchema: {
        ...t.inputSchema,
        properties: {
          ...t.inputSchema.properties,
          sessionId: {
            type: "string",
            description: "Live browser session ID from p5comp_sessions",
          },
          requestId: {
            type: "string",
            description: "Optional idempotency key for safe retries",
          },
        },
        required: [...(t.inputSchema.required || []), "sessionId"],
      },
    })),
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    if (params.name === "p5comp_sessions")
      return {
        content: [
          { type: "text", text: JSON.stringify(await request("/sessions")) },
        ],
      };
    const { sessionId, requestId, ...args } = params.arguments || {};
    if (!sessionId) throw Error("sessionId is required.");
    const value = await request(
      "/sessions/" + encodeURIComponent(sessionId) + "/call",
      { name: params.name, arguments: args, requestId },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(value.result) }],
      isError: !!value.error,
    };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});
await server.connect(new StdioServerTransport());
