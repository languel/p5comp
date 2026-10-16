import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentController,
  validateTake,
} from "../shared/automation/Controller.js";
import { diff, applyPatch } from "../shared/automation/patch.js";
function harness() {
  let project = {
    diagram: { parts: [], connections: [] },
    controls: { pot: 0 },
    arduino: "void loop() {}",
  };
  let clock = 0;
  const actions = [];
  const saved = new Map();
  const controller = new AgentController(
    {
      project: () => project,
      state: () => ({}),
      applyProject: async (p) => {
        project = structuredClone(p);
      },
      command: async (n, a) => {
        actions.push([n, a]);
      },
    },
    {
      storage: {
        getItem: (k) => saved.get(k),
        setItem: (k, v) => saved.set(k, v),
      },
      now: () => ++clock,
    },
  );
  return {
    controller,
    actions,
    saved,
    get: () => project,
    edit: (fn) => {
      fn(project);
      controller.observe();
    },
  };
}
test("patch round trip preserves escaped keys and rejects unsafe/invalid paths atomically", () => {
  const a = { items: [1, 2], "a/b": { "~": 4 }, keep: true };
  const b = { items: [2, 3], "a/b": { "~": 5 }, added: 0 };
  assert.deepEqual(applyPatch(a, diff(a, b)), b);
  assert.throws(() =>
    applyPatch(a, [
      { op: "replace", path: "/keep", value: false },
      { op: "test", path: "/items/0", value: 99 },
    ]),
  );
  assert.equal(a.keep, true);
  for (const path of ["/__proto__/x", "/constructor/prototype/x", "/items/99"])
    assert.throws(() => applyPatch(a, [{ op: "add", path, value: 1 }]));
  assert.equal({}.x, undefined);
});
test("records human and agent changes in order, baseline and final survive step replay", async () => {
  const h = harness(),
    c = h.controller;
  const baseline = structuredClone(h.get());
  await c.call("p5comp_recording", { action: "start", title: "Lesson" });
  h.edit((p) => (p.controls.pot = 700));
  await c.call("p5comp_project_patch", {
    patches: [{ op: "replace", path: "/arduino", value: "// edited" }],
  });
  c.action("runtime", { action: "start" });
  await c.call("p5comp_recording", { action: "mark", title: "Explain input" });
  const take = (await c.call("p5comp_recording", { action: "stop" })).result;
  assert.deepEqual(take.baseline, baseline);
  assert.equal(take.entries.length, 4);
  assert.deepEqual(
    take.entries.map((e) => e.kind),
    ["change", "change", "command", "mark"],
  );
  assert.equal(take.entries[0].source, "human");
  assert.equal(take.entries[1].source, "agent");
  await c.call("p5comp_replay", { action: "load", recording: take });
  assert.deepEqual(h.get(), baseline);
  for (let i = 0; i < take.entries.length; i++)
    await c.call("p5comp_replay", { action: "step" });
  assert.deepEqual(h.get(), take.final);
  assert.deepEqual(h.actions, [["runtime", { action: "start" }]]);
  assert.equal(JSON.parse(h.saved.get("p5comp.recordings.v1")).length, 1);
});
test("schema, revision conflicts and idempotency prevent duplicate edits", async () => {
  const h = harness(),
    c = h.controller;
  const args = {
    expectedRevision: 0,
    patches: [{ op: "add", path: "/diagram/parts/-", value: { id: "led" } }],
  };
  const first = c.call("p5comp_project_patch", args, { requestId: "one" });
  assert.equal(
    c.call("p5comp_project_patch", args, { requestId: "one" }),
    first,
  );
  await first;
  assert.equal(h.get().diagram.parts.length, 1);
  await assert.rejects(
    c.call("p5comp_project_patch", args),
    /Revision conflict/,
  );
  await assert.rejects(
    c.call("p5comp_runtime", { action: "upload" }),
    /Invalid arguments/,
  );
  await assert.rejects(c.call("p5comp_unknown", {}), /Unknown tool/);
});
test("timed replay can be cancelled while its play call is pending", async () => {
  const h = harness(),
    c = h.controller;
  const take = {
    format: "p5comp.process",
    version: 1,
    baseline: h.get(),
    entries: [{ kind: "mark", at: 60000, title: "later" }],
  };
  await c.call("p5comp_replay", { action: "load", recording: take });
  const playing = c.call("p5comp_replay", { action: "play", timed: true });
  await new Promise((r) => setImmediate(r));
  await c.call("p5comp_replay", { action: "cancel" });
  await playing;
  assert.equal(c.replayState().index, 0);
  assert.equal(c.replayState().playing, false);
});
test("recording imports reject arbitrary executable commands", () => {
  assert.throws(
    () =>
      validateTake({
        format: "p5comp.process",
        version: 1,
        baseline: {},
        entries: [
          { kind: "command", at: 0, name: "eval", args: { source: "oops" } },
        ],
      }),
    /Unsupported replay command/,
  );
});

test("replay restores the recorded runtime baseline before the first step", async () => {
  let project = { diagram: { parts: [], connections: [] } };
  const calls = [];
  const c = new AgentController({
    project: () => project,
    state: () => ({ running: true, paused: true, p5Running: true }),
    applyProject: async (p) => {
      project = p;
    },
    command: async (n, a) => calls.push([n, a]),
  });
  await c.call("p5comp_recording", { action: "start" });
  const take = (await c.call("p5comp_recording", { action: "stop" })).result;
  await c.call("p5comp_replay", { action: "load", recording: take });
  assert.deepEqual(calls, [
    ["runtime", { action: "start" }],
    ["runtime", { action: "pause" }],
  ]);
});
