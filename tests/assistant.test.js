import test from "node:test";
import assert from "node:assert/strict";
import { parseReply, repairJson, runAgentTurn, buildSystemPrompt } from "../sim/assistant/protocol.js";

test("parseReply handles clean JSON, markdown fences, thinking tags, and truncated small-model JSON", () => {
  const clean = parseReply('{"say":"Added LED.","actions":[{"tool":"add_part","args":{"type":"wokwi-led"}}],"done":true}');
  assert.equal(clean.say, "Added LED.");
  assert.equal(clean.actions.length, 1);
  assert.equal(clean.done, true);

  const thinking = parseReply('<think>Plan circuit first</think>\n```json\n{"say":"Wired.","actions":[{"tool":"connect_wire","args":{"from":"board:13","to":"led1:A"}}],"done":true}\n```');
  assert.equal(thinking.say, "Wired.");
  assert.equal(thinking.actions[0].tool, "connect_wire");

  // Truncated JSON missing closing brackets (common with small local models like LFM3)
  const truncated = parseReply('{"say":"Building crank","actions":[{"tool":"add_mechanism","args":{"preset":"crank-slider"}}');
  assert.equal(truncated.say, "Building crank");
  assert.equal(truncated.actions[0].tool, "add_mechanism");
  assert.equal(truncated.repaired, true);

  assert.equal(repairJson("no braces"), null);
});

test("runAgentTurn executes multi-step Pi-agent tool loops and returns tool results", async () => {
  const log = [];
  const tools = {
    specs: () => [
      { name: "add_part", params: "type", description: "Add part" },
      { name: "run_simulation", params: "action", description: "Run" },
    ],
    run: async (tool, args) => {
      log.push({ tool, args });
      if (tool === "add_part") return { added: "servo1" };
      if (tool === "run_simulation") return { status: "running" };
      throw new Error("bad tool");
    },
  };

  let calls = 0;
  const complete = async (messages) => {
    calls++;
    if (calls === 1) {
      return JSON.stringify({
        say: "Adding a servo first.",
        actions: [{ tool: "add_part", args: { type: "wokwi-servo" } }],
        done: false,
      });
    }
    assert.ok(messages.at(-1).content.includes("servo1"), "tool result fed back into next turn");
    return JSON.stringify({
      say: "Servo added and simulation started.",
      actions: [{ tool: "run_simulation", args: { action: "run" } }],
      done: true,
    });
  };

  const result = await runAgentTurn({
    complete,
    tools,
    getStateSummary: () => "Parts (1): board:wokwi-arduino-uno",
    userMessage: "Add a servo and run",
  });

  assert.equal(calls, 2);
  assert.equal(result.say, "Servo added and simulation started.");
  assert.equal(result.executed.length, 2);
  assert.equal(result.executed[0].ok, true);
  assert.equal(result.executed[1].ok, true);
  assert.equal(log[0].tool, "add_part");
  assert.equal(log[1].tool, "run_simulation");

  const prompt = buildSystemPrompt("Parts: none", tools.specs());
  assert.ok(prompt.includes("add_part"));
  assert.ok(prompt.includes("wokwi-servo"));
});
