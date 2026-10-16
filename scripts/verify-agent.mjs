// Run against a disposable browser workspace only. No user workspace fallback.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "p5comp-verification", version: "1.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../server/mcp.js", import.meta.url).pathname],
  }),
);
const unpack = (r) => {
  if (r.isError) throw Error(r.content[0].text);
  return JSON.parse(r.content[0].text);
};
try {
  const listed = await client.listTools();
  assert.ok(listed.tools.some((t) => t.name === "p5comp_recording"));
  const { sessions } = unpack(
    await client.callTool({ name: "p5comp_sessions", arguments: {} }),
  );
  const session = sessions.find((s) =>
    s.workspace.endsWith(":agent-protocol-qa"),
  );
  assert.ok(
    session,
    "Open the disposable ?workspace=agent-protocol-qa browser tab first",
  );
  const call = async (name, args = {}) =>
    unpack(
      await client.callTool(
        {
          name: "p5comp_" + name,
          arguments: { ...args, sessionId: session.id },
        },
        undefined,
        { timeout: 120000 },
      ),
    ).result;
  await call("examples", { path: "examples/four-signals.json" });
  const before = await call("project_get");
  await call("recording", {
    action: "start",
    title: "Four signals · agent lesson",
  });
  const pot = before.diagram.parts.find((p) =>
    p.type.includes("potentiometer"),
  );
  assert.ok(pot);
  await call("control_set", { id: pot.id, value: 800 });
  await call("part_put", {
    part: {
      id: "lessonLED",
      type: "wokwi-led",
      left: 100,
      top: 100,
      attrs: { color: "blue" },
      label: "Added by MCP",
    },
  });
  await call("wire_put", {
    connection: ["lessonLED:C", "uno:GND.1", "#111111", []],
  });
  await call("media_put", {
    media: {
      id: "agent-note",
      kind: "note",
      x: 80,
      y: -100,
      width: 280,
      height: 110,
      source: "# Four signals\nChange the input, then observe the output.",
      format: "markdown",
      background: "#fff7df",
      foreground: "#252525",
      fontSize: 16,
    },
  });
  await call("recording", {
    action: "mark",
    title: "Observe",
    note: "Input value is 800. Explain analog input versus PWM output.",
  });
  const take = await call("recording", { action: "stop" });
  assert.ok(take.entries.length >= 5);
  await writeFile(
    "/tmp/p5comp-verified-process.json",
    JSON.stringify(take, null, 2),
  );
  await call("replay", { action: "load", recording: take });
  assert.deepEqual((await call("project_get")).diagram, before.diagram);
  await call("replay", { action: "step" });
  assert.equal((await call("project_get")).controls[pot.id], 800);
  await call("replay", { action: "play" });
  const after = await call("project_get");
  assert.deepEqual(after.diagram, take.final.diagram);
  assert.deepEqual(after.controls, take.final.controls);
  assert.deepEqual(after.workbench.references, take.final.workbench.references);
  await call("canvas", { action: "fit" });
  await call("view", { inspector: "settings" });
  console.log(
    JSON.stringify({
      tools: listed.tools.length,
      session: session.workspace,
      steps: take.entries.length,
      replayed: true,
      recording: "/tmp/p5comp-verified-process.json",
    }),
  );
} finally {
  await client.close();
}
