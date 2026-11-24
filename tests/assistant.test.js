import test from "node:test";
import assert from "node:assert/strict";
import { parseReply, repairJson, runAgentTurn, buildSystemPrompt } from "../sim/assistant/protocol.js";
import { PiAgent, buildPiApiRequest, readPiApiResponse } from "../sim/assistant/piAgent.js";
import { TOOLS } from "../shared/automation/tools.js";
import { physicsCommand } from "../sim/automation/physics.js";
import { createEmptyPhysicsScene } from "../sim/physics/model.js";
import {
  LFM3_PI_MODEL_ID,
  LFM3_VL_PI_MODEL_ID,
  LFM3_VL_BASE_MODEL_ID,
  LFM3_BASE_MODEL_ID,
  LFM3_DEFAULT_MODEL_ID,
  LFM3_QAD_MODEL_ID,
  LFM3_MODELS,
  isOnnxVlModelId,
  parseLfm3ModelSpec,
  loadAssistantSettings,
} from "../sim/assistant/providers.js";
import { parseLfm3ToolOutput, formatVlMessages } from "../sim/assistant/lfm3VlClient.js";

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

test("canonical MCP/WebMCP TOOLS include physics, rewind, and assistant view, and LFM3-1.7B-pi is registered", () => {
  const names = new Set(TOOLS.map((t) => t.name));
  assert.ok(names.has("p5comp_physics"));
  assert.ok(names.has("p5comp_drawing"));
  assert.ok(names.has("p5comp_diagram"));
  assert.ok(names.has("p5comp_console"));
  assert.ok(names.has("p5comp_assistant"));
  assert.ok(names.has("p5comp_build"));
  assert.ok(names.has("p5comp_runtime"));
  const exp = TOOLS.find((t) => t.name === "p5comp_export");
  assert.ok(exp.inputSchema.properties.format.enum.includes("stage_png"));
  const runtime = TOOLS.find((t) => t.name === "p5comp_runtime");
  assert.ok(runtime.inputSchema.properties.action.enum.includes("rewind"));
  const view = TOOLS.find((t) => t.name === "p5comp_view");
  assert.ok(view.inputSchema.properties.inspector.enum.includes("assistant"));
  assert.equal(LFM3_DEFAULT_MODEL_ID, LFM3_VL_PI_MODEL_ID);
  assert.equal(LFM3_DEFAULT_MODEL_ID, "languel/LFM3-VL-2B-pi-ONNX");
  assert.ok(LFM3_MODELS.some((m) => m.id === LFM3_DEFAULT_MODEL_ID));
  assert.ok(LFM3_MODELS.some((m) => m.id === LFM3_PI_MODEL_ID));
  assert.ok(LFM3_MODELS.some((m) => m.id === LFM3_BASE_MODEL_ID));
  assert.ok(LFM3_MODELS.some((m) => m.id === LFM3_QAD_MODEL_ID));
  assert.deepEqual(parseLfm3ModelSpec(LFM3_PI_MODEL_ID), {
    repo: "languel/LFM3-1.7B-pi-GGUF",
    file: "LFM3-1.7B-pi-Q4_K_M.gguf",
  });
  assert.deepEqual(parseLfm3ModelSpec(LFM3_QAD_MODEL_ID), {
    repo: "LiquidAI/LFM3-1.7B-GGUF",
    file: "LFM3-1.7B-QAD-Q4_0.gguf",
  });

  // Fresh student setup defaults to HF-hosted LFM3-1.7B-pi on WebGPU + Pi Agent with tools enabled.
  const defaults = loadAssistantSettings();
  assert.equal(defaults.provider, "lfm3");
  assert.equal(defaults.model, LFM3_DEFAULT_MODEL_ID);
  assert.equal(defaults.agentMode, "pi");
  assert.equal(defaults.toolsEnabled, true);
  assert.ok(LFM3_MODELS.some((m) => m.id === LFM3_VL_PI_MODEL_ID));
  assert.ok(LFM3_MODELS.some((m) => m.id === LFM3_VL_BASE_MODEL_ID));
  assert.equal(isOnnxVlModelId(LFM3_VL_PI_MODEL_ID), true);
  assert.equal(isOnnxVlModelId(LFM3_VL_BASE_MODEL_ID), true);
  assert.equal(isOnnxVlModelId(LFM3_PI_MODEL_ID), false);
});

test("Lfm3VlClient parses LFM3-VL XML tool calls, reasoning, and multimodal image messages", () => {
  const parsed = parseLfm3ToolOutput(
    'Plan circuit first</think>\nAdding an LED now.\n<tool_call>\n<function=p5comp_build>\n<parameter=clear>\ntrue\n</parameter>\n<parameter=parts>\n[{"type":"wokwi-led","id":"led1"}]\n</parameter>\n</function>\n</tool_call><|im_end|>',
    { startedInThink: true },
  );
  assert.equal(parsed.thinking, "Plan circuit first");
  assert.equal(parsed.content, "Adding an LED now.");
  assert.equal(parsed.tool_calls.length, 1);
  assert.equal(parsed.tool_calls[0].function.name, "p5comp_build");
  assert.equal(parsed.tool_calls[0].function.arguments.clear, true);
  assert.deepEqual(parsed.tool_calls[0].function.arguments.parts, [{ type: "wokwi-led", id: "led1" }]);

  const { messages, imageUrls } = formatVlMessages([
    { role: "user", content: "What is wired to pin 13?", images: [{ dataUrl: "data:image/png;base64,AAA", label: "canvas.png" }] },
  ]);
  assert.deepEqual(imageUrls, ["data:image/png;base64,AAA"]);
  assert.deepEqual(messages[0].content, [{ type: "image" }, { type: "text", text: "What is wired to pin 13?" }]);
});

test("physicsCommand creates bodies, joints, mechanisms, and reads physics state", async () => {
  const scene = createEmptyPhysicsScene();
  const mockPhysics = {
    scene,
    running: false,
    simTime: 0,
    visible: true,
    active: false,
    selectedBodies: new Set(),
    selectedJoints: new Set(),
    actuators: () => [{ id: "servo1", type: "wokwi-servo", x: 300, y: 180 }],
    pushUndo() {},
    persistChange() {},
    updateToolbarState() {},
    renderInspector() {},
    draw() {},
  };

  const b = await physicsCommand(mockPhysics, {
    action: "body_put",
    body: { shape: "circle", x: 120, y: 80, r: 18, color: "#4e8da6" },
  });
  assert.ok(b.addedBody);
  assert.equal(scene.bodies.length, 1);

  const j = await physicsCommand(mockPhysics, {
    action: "joint_put",
    joint: { kind: "spring", a: b.addedBody, b: null, anchor: [120, 40], stiffness: 8, color: "#5ca688" },
  });
  assert.ok(j.addedJoint);
  assert.equal(scene.joints.length, 1);

  const m = await physicsCommand(mockPhysics, {
    action: "mechanism",
    preset: "crank-slider",
    actuatorId: "servo1",
  });
  assert.equal(m.mechanism, "crank-slider");
  assert.equal(m.attachedTo, "servo1");
  assert.ok(m.bodies.length >= 2);

  const st = await physicsCommand(mockPhysics, { action: "get" });
  assert.equal(st.bodies.length, scene.bodies.length);
  assert.ok(st.presets.some((p) => p.id === "curve-track"));
});

test("PiAgent executes native tool calls, streams events, and formats OpenAI/Anthropic/Gemini requests", async () => {
  const events = [];
  let turn = 0;
  const fakeModel = {
    label: "fake-pi",
    async complete(messages, tools, opts) {
      turn++;
      if (turn === 1) {
        opts.onActivity?.({ kind: "thinking", delta: "planning mechanism" });
        return {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "c1", type: "function", function: { name: "p5comp_physics", arguments: { action: "mechanism", preset: "four-bar" } } },
            ],
          },
          finish: "tool_calls",
        };
      }
      assert.equal(messages.at(-1).role, "tool");
      opts.onText?.("Built a four-bar linkage.");
      return {
        message: { role: "assistant", content: "Built a four-bar linkage." },
        finish: "stop",
      };
    },
  };

  const agent = new PiAgent({
    model: fakeModel,
    tools: [{ type: "function", function: { name: "p5comp_physics", description: "Physics", parameters: { type: "object", properties: {} } } }],
    runTool: async (name, args) => ({ ok: true, name, preset: args.preset }),
  });

  await agent.send("Build a four-bar linkage", (e) => events.push(e));
  assert.ok(events.some((e) => e.type === "tool_execution_start"));
  assert.ok(events.some((e) => e.type === "tool_execution_end" && e.ok));
  assert.ok(events.some((e) => e.type === "agent_end" && e.reason === "done"));

  const sampleTools = [{ type: "function", function: { name: "p5comp_state", description: "State", parameters: { type: "object", properties: {} } } }];
  const oa = buildPiApiRequest({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "k" }, [{ role: "user", content: "hi" }], sampleTools);
  assert.equal(oa.kind, "openai");
  assert.equal(oa.body.tools.length, 1);
  const oaResp = readPiApiResponse("openai", { choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "1", function: { name: "p5comp_state", arguments: "{}" } }] } }] });
  assert.equal(oaResp.finish, "tool_calls");

  const ant = buildPiApiRequest({ provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-0", apiKey: "k" }, [{ role: "user", content: "hi" }], sampleTools);
  assert.equal(ant.kind, "anthropic");
  assert.equal(ant.body.tools[0].input_schema.type, "object");

  const gem = buildPiApiRequest({ provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", apiKey: "k" }, [{ role: "user", content: "hi" }], sampleTools);
  assert.equal(gem.kind, "gemini");
  assert.equal(gem.body.tools[0].functionDeclarations[0].name, "p5comp_state");
  const gemResp = readPiApiResponse("gemini", { candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: { name: "p5comp_state", args: {} } }] } }] });
  assert.equal(gemResp.finish, "tool_calls");

  // Multimodal image payloads across OpenAI, Anthropic, and Gemini
  const imgMsg = [{ role: "user", content: "check wiring", images: [{ label: "canvas.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" }] }];
  const oaImg = buildPiApiRequest({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o", apiKey: "k" }, imgMsg, []);
  assert.equal(oaImg.body.messages[0].content[1].type, "image_url");
  const antImg = buildPiApiRequest({ provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-0", apiKey: "k" }, imgMsg, []);
  assert.equal(antImg.body.messages[0].content[0].type, "image");
  assert.equal(antImg.body.messages[0].content[0].source.data, "AAAA");
  const gemImg = buildPiApiRequest({ provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", apiKey: "k" }, imgMsg, []);
  assert.equal(gemImg.body.contents[0].parts[0].inlineData.data, "AAAA");
});
