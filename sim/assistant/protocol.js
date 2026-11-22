/**
 * Pi-style multi-step tool-calling agent protocol for p5comp.
 * Uses a compact plain-JSON envelope `{ say, actions, done }` (adapted from artistmodelstudio)
 * so both small local models (LFM3 WebGPU, Ollama 1B-7B) and frontier API models work reliably
 * without vendor-specific function-calling schemas.
 */

export function repairJson(text) {
  const t = String(text || "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  const stack = [];
  let out = "";
  let str = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (str) {
      out += c;
      if (c === "\\") out += t[++i] ?? "";
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"') {
      str = true;
      out += c;
      continue;
    }
    if (c === "{" || c === "[") {
      stack.push(c === "{" ? "}" : "]");
      out += c;
      continue;
    }
    if (c === "}" || c === "]") {
      if (!stack.includes(c)) continue;
      while (stack.length && stack[stack.length - 1] !== c) out += stack.pop();
      stack.pop();
      out += c;
      if (!stack.length) return out;
      continue;
    }
    out += c;
  }
  if (str) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}

function objectsIn(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let str = false;
    for (let k = i; k < text.length; k++) {
      const c = text[k];
      if (str) {
        if (c === "\\") k++;
        else if (c === '"') str = false;
        continue;
      }
      if (c === '"') str = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        out.push(text.slice(i, k + 1));
        i = k;
        break;
      }
    }
  }
  return out;
}

/**
 * Parse a model reply into `{ say, actions, done }`.
 * Strips thinking tags, extracts the first valid action envelope, and repairs truncated JSON.
 */
export function parseReply(text) {
  const cleaned = String(text || "")
    .replace(/<(think|thinking|antThinking)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(think|thinking|antThinking)>/gi, "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  for (const src of objectsIn(cleaned)) {
    try {
      const j = JSON.parse(src);
      if (j && typeof j === "object" && ("say" in j || "actions" in j)) {
        return {
          say: String(j.say || ""),
          actions: Array.isArray(j.actions) ? j.actions : [],
          done: j.done !== false,
        };
      }
    } catch {
      /* try next object */
    }
  }

  const fixed = repairJson(cleaned);
  if (fixed) {
    try {
      const j = JSON.parse(fixed);
      if (j && typeof j === "object" && ("say" in j || "actions" in j)) {
        return {
          say: String(j.say || ""),
          actions: Array.isArray(j.actions) ? j.actions : [],
          done: j.done !== false,
          repaired: true,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const said = /"say"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cleaned);
  if (said) {
    try {
      return { say: JSON.parse(`"${said[1]}"`), actions: [], done: true, salvaged: true };
    } catch {
      return { say: said[1], actions: [], done: true, salvaged: true };
    }
  }

  return { say: cleaned || "Done.", actions: [], done: true };
}

export function buildSystemPrompt(stateSummary, toolSpecs) {
  const toolLines = toolSpecs
    .map((t) => `- ${t.name}(${t.params}): ${t.description}`)
    .join("\n");

  return `You are the intelligent engineering assistant inside p5comp, an interactive Arduino + p5.js + 2D Physics/Mechanisms simulator.
You build circuits, wire components, write Arduino (.ino) and p5.js sketches, attach mechanical linkages/gears to actuators, and run the simulation using tools.

Tools:
${toolLines}

Current workspace state:
${stateSummary}

Common component types & pins:
- wokwi-arduino-uno: 0..13, A0..A5, 5V, GND.1, GND.2, GND.3
- wokwi-led: A (anode), C (cathode) · attrs: { color: "red"|"green"|"blue"|"yellow" }
- wokwi-resistor: 1, 2 · attrs: { value: "220"|"10000" }
- wokwi-pushbutton: 1.l, 2.l, 1.r, 2.r
- wokwi-potentiometer / p5comp-potentiometer: GND, SIG, VCC
- wokwi-servo: GND, V+, PWM · attrs: { servoModel: "SG90"|"MG90S" }
- p5comp-dc-motor / p5comp-gear-motor: +, - (drive through p5comp-hbridge: VCC, GND, VMOT, ENA, IN1, IN2, OUT1, OUT2)
- wokwi-buzzer: 1, 2

Reply with ONE JSON object and nothing else:
{"say":"short friendly explanation","actions":[{"tool":"tool_name","args":{...}}],"done":true}
Set "done":false only if you need to inspect tool output before taking more steps.

Example ("build a servo crank-slider controlled by a pot"):
{"say":"Building an Uno + potentiometer + SG90 servo with a crank-slider mechanism and Arduino sketch.","actions":[{"tool":"clear_circuit","args":{"keepBoard":true}},{"tool":"add_part","args":{"id":"pot1","type":"p5comp-potentiometer","left":320,"top":260}},{"tool":"add_part","args":{"id":"servo1","type":"wokwi-servo","left":420,"top":90,"attrs":{"servoModel":"SG90"}}},{"tool":"connect_wire","args":{"from":"board:5V","to":"pot1:VCC","color":"#c45b4a"}},{"tool":"connect_wire","args":{"from":"board:GND.1","to":"pot1:GND","color":"#333333"}},{"tool":"connect_wire","args":{"from":"board:A0","to":"pot1:SIG","color":"#4e8da6"}},{"tool":"connect_wire","args":{"from":"board:5V","to":"servo1:V+","color":"#c45b4a"}},{"tool":"connect_wire","args":{"from":"board:GND.2","to":"servo1:GND","color":"#333333"}},{"tool":"connect_wire","args":{"from":"board:9","to":"servo1:PWM","color":"#d97742"}},{"tool":"add_mechanism","args":{"preset":"crank-slider","actuatorId":"servo1"}},{"tool":"set_arduino_code","args":{"code":"#include <Servo.h>\\nServo s;\\nvoid setup(){ s.attach(9); }\\nvoid loop(){ s.write(map(analogRead(A0),0,1023,0,180)); delay(15); }"}},{"tool":"run_simulation","args":{"action":"run"}}],"done":true}`;
}

/**
 * Execute a Pi-style iterative agent turn (up to maxSteps tool-use rounds).
 */
export async function runAgentTurn({
  complete,
  tools,
  getStateSummary,
  history = [],
  userMessage,
  maxSteps = 4,
  onStep = () => {},
  signal,
}) {
  const toolSpecs = tools.specs();
  const messages = [
    { role: "system", content: buildSystemPrompt(getStateSummary(), toolSpecs) },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const executed = [];
  let finalSay = "";

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) throw new Error("Aborted");
    const raw = await complete(messages, { signal });
    const parsed = parseReply(raw);
    if (parsed.say) finalSay = parsed.say;

    const results = [];
    for (const act of parsed.actions || []) {
      if (!act?.tool) continue;
      let res;
      try {
        res = { ok: true, result: await tools.run(act.tool, act.args || {}) };
      } catch (err) {
        res = { ok: false, error: err?.message || String(err) };
      }
      const record = { tool: act.tool, args: act.args || {}, ...res };
      executed.push(record);
      results.push(record);
      onStep(record);
    }

    messages.push({ role: "assistant", content: raw });
    if (parsed.done || !results.length) break;

    messages.push({
      role: "user",
      content: `Tool results:\n${JSON.stringify(results)}\nUpdated state:\n${getStateSummary()}\nContinue or finish with "done":true.`,
    });
  }

  return {
    say: finalSay || (executed.length ? "Updated the project." : "Ready."),
    executed,
  };
}
