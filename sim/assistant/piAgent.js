/**
 * Embedded Pi Agent runtime for p5comp (adapted from ~/dev/seloai/src/agent/piAgent.ts & piModel.ts).
 *
 * Uses the exact same canonical p5comp_* tools exposed over WebMCP and stdio MCP,
 * with native tool-calling across:
 * - Local WebGPU: harness-hub/LFM3-1.7B-pi-GGUF (Pi RL-tuned) and LiquidAI/LFM3-1.7B-GGUF
 * - API providers: Ollama, OpenAI-compatible, OpenRouter, Anthropic, and Gemini
 *
 * Emits Pi-vocabulary events (agent_start, turn_start, activity, message_update,
 * message_end, tool_execution_start, tool_execution_end, agent_end).
 */

import { LFM3_DEFAULT_MODEL_ID } from "./providers.js";
import { parseReply } from "./protocol.js";

export const PI_INSTRUCTIONS = `You are the embedded Pi engineering agent inside p5comp, an interactive Arduino + p5.js + 2D Physics/Mechanisms + Poliplan Drawing workbench.

Rules:
- For questions or "summarize the current project", answer directly from the Current workspace state below (call p5comp_state or p5comp_code_get if you need the source code). Do NOT call p5comp_catalog or edit tools when only asked to explain or summarize.
- Before modifying Arduino (.ino) or p5.js (sketch.js) code, call p5comp_code_get to read the existing code. Then call p5comp_code_set({ language: "arduino"|"p5", source: "..." }) WITHOUT inventing a filename so it updates the active main sketch.
- Keep Arduino C++ (pinMode, digitalWrite, analogWrite, Servo, Serial) ONLY in language:"arduino". In language:"p5", NEVER call Serial.*, analogWrite, or digitalWrite, and use p5's built-in width/height (not canvasHeight).
- Live Arduino ↔ p5 telemetry: print CSV lines from Arduino (Serial.begin(9600) + Serial.println(...)) and define function acceptLine(line) { ... } in p5 (p5comp auto-injects the serial bridge and calls acceptLine on every line).
- After editing code, start it with p5comp_runtime (start / p5_start) and call p5comp_console({ action:"read", errorsOnly:true }) to verify zero errors before replying!
- p5 visual craft: use createCanvas(480, 300), put ALL drawing inside draw() (never setup()), clean dark UI (background("#1a1c1b")), rounded cards (fill("#252827"); rect(x, y, w, h, 8)), generous spacing so text NEVER overlaps bars/gauges, textAlign(LEFT, TOP), animated rotating shaft dials + live PWM/RPM bars, and crisp colors (#e6e8e6, #5ca688, #e8bd53, #4e8da6, #c45b4a).
- When asked to build or modify a circuit, prefer a single p5comp_build call with { clear?, parts, connections, arduino?, p5?, mechanism?, run? }.
- For targeted edits, use p5comp_part_put, p5comp_wire_put, p5comp_code_set, p5comp_physics (body_put, joint_put, mechanism, settings, run/stop/rewind), p5comp_drawing, p5comp_diagram (Mermaid via Pele onto canvas), p5comp_console (read errors), and p5comp_runtime.
- Common pins: Arduino Uno ("board"): 0..13, A0..A5, 5V, GND.1..3 · LED: A, C · Resistor: 1, 2 · Servo: GND, V+, PWM · Potentiometer: GND, SIG, VCC · Button: 1.l, 2.l, 1.r, 2.r · DC/Gear Motor: +, -.
- Never claim you changed something without calling a tool. Keep replies concise and clear (Markdown, KaTeX $...$, or \`\`\`mermaid diagrams when helpful).`;

export function buildPiInstructions(stateSummary = "") {
  if (!stateSummary) return PI_INSTRUCTIONS;
  return `${PI_INSTRUCTIONS}\n\nCurrent workspace state:\n${stateSummary}`;
}

let callCounter = 0;
const newCallId = () => `call_${Date.now().toString(36)}_${(callCounter++).toString(36)}`;

function parseArgs(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function toolCallLabel(call) {
  const a = call?.function?.arguments || {};
  const what = [a.action, a.preset, a.id, a.part?.id, a.language, a.name, a.path, a.query].find(
    (v) => typeof v === "string" && v.trim(),
  );
  const nice = String(call?.function?.name || "tool").replace(/^p5comp_/, "").replace(/_/g, " ");
  return what ? `${nice}: ${String(what).slice(0, 48)}` : nice;
}

export function toolResultText(result, limit = 3500) {
  const clean = JSON.stringify(result, (key, value) =>
    key === "base64" && typeof value === "string" ? `[binary ${value.length} chars]` : value,
  );
  const text = clean ?? "ok";
  return text.length > limit ? `${text.slice(0, limit)}… (truncated)` : text;
}

function splitDataUrl(dataUrl, fallbackMime = "image/png") {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl || ""));
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: fallbackMime, base64: String(dataUrl || "").replace(/^data:[^,]*,/, "") };
}

/** Build a provider-specific native tool-calling HTTP request (exported for unit tests). */
export function buildPiApiRequest(settings, messages, tools = []) {
  const provider = settings.provider || "ollama";
  const base = String(settings.baseUrl || "").trim().replace(/\/+$/, "");
  const key = String(settings.apiKey || "").trim();
  const model = settings.model;

  if (provider === "anthropic") {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const out = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        const block = { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content };
        const last = out[out.length - 1];
        if (last && last.role === "user" && Array.isArray(last.content)) last.content.push(block);
        else out.push({ role: "user", content: [block] });
      } else if (m.role === "assistant") {
        const content = [];
        if (m.content?.trim()) content.push({ type: "text", text: m.content });
        for (const c of m.tool_calls || []) {
          content.push({ type: "tool_use", id: c.id, name: c.function.name, input: c.function.arguments });
        }
        out.push({ role: "assistant", content: content.length ? content : m.content || "" });
      } else if (m.images?.length) {
        const blocks = m.images.map((img) => {
          const { mimeType, base64 } = splitDataUrl(img.dataUrl, img.mimeType);
          return { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };
        });
        if (m.content) blocks.push({ type: "text", text: m.content });
        out.push({ role: "user", content: blocks });
      } else {
        out.push({ role: "user", content: m.content });
      }
    }
    return {
      kind: "anthropic",
      url: `${base}/messages`,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        ...(key ? { "x-api-key": key } : {}),
      },
      body: {
        model,
        max_tokens: 4096,
        system,
        messages: out,
        ...(tools.length
          ? {
              tools: tools.map((t) => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters,
              })),
            }
          : {}),
      },
    };
  }

  if (provider === "gemini") {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        let resp;
        try {
          resp = JSON.parse(m.content);
        } catch {
          resp = { output: m.content };
        }
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name: m.name, response: { result: resp } } }],
        });
      } else if (m.role === "assistant") {
        const parts = [];
        if (m.content?.trim()) parts.push({ text: m.content });
        for (const c of m.tool_calls || []) {
          parts.push({ functionCall: { name: c.function.name, args: c.function.arguments } });
        }
        contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
      } else if (m.images?.length) {
        const parts = m.images.map((img) => {
          const { mimeType, base64 } = splitDataUrl(img.dataUrl, img.mimeType);
          return { inlineData: { mimeType, data: base64 } };
        });
        if (m.content) parts.push({ text: m.content });
        contents.push({ role: "user", parts });
      } else {
        contents.push({ role: "user", parts: [{ text: m.content }] });
      }
    }
    return {
      kind: "gemini",
      url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { "Content-Type": "application/json" },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        ...(tools.length
          ? {
              tools: [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.function.name,
                    description: t.function.description,
                    parameters: sanitizeGeminiSchema(t.function.parameters),
                  })),
                },
              ],
            }
          : {}),
        generationConfig: { temperature: 0.2 },
      },
    };
  }

  // OpenAI-compatible (Ollama /v1, OpenAI, OpenRouter, LM Studio)
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  return {
    kind: "openai",
    url,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(provider === "openrouter" ? { "X-Title": "p5comp" } : {}),
    },
    body: {
      model,
      max_tokens: 4096,
      temperature: 0.25,
      messages: messages.map((m) => {
        if (m.role === "assistant" && m.tool_calls?.length) {
          return {
            role: "assistant",
            content: m.content || null,
            tool_calls: m.tool_calls.map((c) => ({
              id: c.id,
              type: "function",
              function: {
                name: c.function.name,
                arguments: JSON.stringify(c.function.arguments),
              },
            })),
          };
        }
        if (m.role === "user" && m.images?.length) {
          return {
            role: "user",
            content: [
              ...(m.content ? [{ type: "text", text: m.content }] : []),
              ...m.images.map((img) => ({
                type: "image_url",
                image_url: { url: img.dataUrl },
              })),
            ],
          };
        }
        const { images: _drop, ...rest } = m;
        return rest;
      }),
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    },
  };
}

/** Gemini rejects additionalProperties and union type arrays like ['number','boolean']. */
function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return { type: "OBJECT" };
  const out = {};
  if (Array.isArray(schema.type)) out.type = String(schema.type[0] || "string").toUpperCase();
  else if (typeof schema.type === "string") out.type = schema.type.toUpperCase();
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum.map(String);
  if (schema.properties && typeof schema.properties === "object") {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = sanitizeGeminiSchema(v);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
  if (schema.items) out.items = sanitizeGeminiSchema(schema.items);
  return out;
}

/** Parse one turn's answer from OpenAI / Anthropic / Gemini JSON (exported for unit tests). */
export function readPiApiResponse(kind, json) {
  if (kind === "anthropic") {
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("");
    const calls = blocks
      .filter((b) => b?.type === "tool_use")
      .map((b) => ({
        id: String(b.id || newCallId()),
        type: "function",
        function: { name: String(b.name), arguments: parseArgs(b.input) },
      }));
    return {
      message: { role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) },
      finish: calls.length ? "tool_calls" : json?.stop_reason === "max_tokens" ? "length" : "stop",
    };
  }

  if (kind === "gemini") {
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const text = parts.filter((p) => typeof p?.text === "string").map((p) => p.text).join("");
    const calls = parts
      .filter((p) => p?.functionCall)
      .map((p) => ({
        id: newCallId(),
        type: "function",
        function: { name: String(p.functionCall.name), arguments: parseArgs(p.functionCall.args) },
      }));
    const reason = json?.candidates?.[0]?.finishReason;
    return {
      message: { role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) },
      finish: calls.length ? "tool_calls" : reason === "MAX_TOKENS" ? "length" : "stop",
    };
  }

  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  const calls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((c) => ({
    id: String(c.id || newCallId()),
    type: "function",
    function: { name: String(c.function?.name ?? ""), arguments: parseArgs(c.function?.arguments) },
  }));
  return {
    message: {
      role: "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
      ...(calls.length ? { tool_calls: calls } : {}),
    },
    finish: calls.length ? "tool_calls" : choice?.finish_reason === "length" ? "length" : "stop",
  };
}

/** Create a PiModel backed by either local LFM3 WebGPU or any configured API provider. */
export function createPiModel(getSettings, { lfm3 }) {
  return {
    get label() {
      const s = getSettings();
      return `${s.model || s.provider}`;
    },
    async complete(messages, tools, opts = {}) {
      const s = getSettings();
      if (s.provider === "lfm3") {
        return lfm3.completeWithTools(messages, tools, {
          modelId: s.model || LFM3_DEFAULT_MODEL_ID,
          onText: opts.onText,
          onActivity: opts.onActivity,
          signal: opts.signal,
        });
      }
      if (!s.model) throw new Error("No model selected. Open Settings → AI / Model to pick one.");
      const req = buildPiApiRequest(s, messages, tools);
      const res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: opts.signal,
      });
      if (!res.ok) {
        throw new Error(`Model API HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 240)}`);
      }
      const turn = readPiApiResponse(req.kind, await res.json());
      if (turn.message.content) opts.onText?.(turn.message.content);
      return turn;
    },
  };
}

export class PiAgent {
  constructor({ model, tools = [], runTool, instructions = PI_INSTRUCTIONS, maxRounds = 14 }) {
    this.options = { model, tools, runTool, instructions, maxRounds };
    this.messages = [{ role: "system", content: instructions }];
    this.running = false;
  }

  get busy() {
    return this.running;
  }

  configure(patch) {
    this.options = { ...this.options, ...patch };
    if (patch.instructions && this.messages[0]?.role === "system") {
      this.messages[0] = { role: "system", content: patch.instructions };
    }
  }

  clear() {
    this.messages = this.messages.slice(0, 1);
  }

  async send(text, onEvent = () => {}, signal, { images = [] } = {}) {
    if (this.running) throw new Error("Pi agent is still working on the previous message.");
    this.running = true;
    this.messages.push({
      role: "user",
      content: text,
      ...(images?.length ? { images } : {}),
    });
    onEvent({ type: "agent_start" });
    const failed = new Set();
    const maxRounds = this.options.maxRounds ?? 14;
    let usedTools = false;
    let nudged = false;
    try {
      for (let round = 1; round <= maxRounds; round++) {
        if (signal?.aborted) return onEvent({ type: "agent_end", reason: "cancelled" });
        onEvent({ type: "turn_start", round });
        const turn = await this.options.model.complete(this.messages, this.options.tools, {
          signal,
          onText: (delta) => onEvent({ type: "message_update", delta }),
          onActivity: (activity) => onEvent({ type: "activity", activity }),
        });

        // Fallback: some local Ollama models emit JSON tool calls in plain text instead of `tool_calls`.
        let calls = turn.message.tool_calls || [];
        if (!calls.length && turn.message.content?.includes("{") && this.options.tools.length) {
          const parsed = parseReply(turn.message.content);
          if (parsed.actions?.length) {
            calls = parsed.actions
              .filter((a) => a?.tool)
              .map((a) => ({
                id: newCallId(),
                type: "function",
                function: { name: String(a.tool), arguments: parseArgs(a.args) },
              }));
            turn.message.tool_calls = calls;
            turn.message.content = parsed.say || "";
            turn.finish = "tool_calls";
          }
        }

        this.messages.push(turn.message);
        onEvent({ type: "message_end", message: turn.message });
        if (turn.finish === "cancelled") return onEvent({ type: "agent_end", reason: "cancelled" });

        if (turn.finish !== "tool_calls" || !calls.length) {
          if (usedTools && !nudged && !turn.message.content.trim() && round < maxRounds) {
            nudged = true;
            this.messages.pop();
            this.messages.push({
              role: "user",
              content: "(Now summarize in one or two sentences what you changed.)",
            });
            continue;
          }
          if (!turn.message.content.trim()) {
            this.messages.pop();
            return onEvent({ type: "agent_end", reason: turn.finish === "length" ? "too_long" : "silent" });
          }
          return onEvent({ type: "agent_end", reason: turn.finish === "length" ? "too_long" : "done" });
        }

        usedTools = true;
        for (const call of calls) {
          const label = toolCallLabel(call);
          onEvent({ type: "tool_execution_start", call, label });
          const key = `${call.function.name}:${JSON.stringify(call.function.arguments)}`;
          let content;
          let ok = false;
          let result;
          if (call.errors?.length) {
            content = `Error: ${call.errors.join("; ")}`;
          } else if (failed.has(key)) {
            content = "Error: this exact call already failed. Change the arguments or try another step.";
          } else {
            try {
              result = await this.options.runTool(call.function.name, call.function.arguments);
              content = toolResultText(result);
              ok = true;
            } catch (err) {
              failed.add(key);
              content = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
          this.messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content,
          });
          onEvent({ type: "tool_execution_end", call, label, ok, summary: content.slice(0, 200), result });
        }
      }
      onEvent({ type: "agent_end", reason: "max_rounds" });
    } catch (err) {
      if (signal?.aborted) onEvent({ type: "agent_end", reason: "cancelled" });
      else onEvent({ type: "agent_end", reason: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.running = false;
    }
  }
}
