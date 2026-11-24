/**
 * Unified Assistant & Pi-Agent Tool Registry for p5comp.
 * - Exposes ALL canonical MCP / WebMCP tools (`shared/automation/tools.js`) through
 *   `window.p5comp.callTool(...)` when running in the workbench.
 * - Preserves friendly high-level convenience aliases (`add_part`, `connect_wire`,
 *   `add_mechanism`, `set_arduino_code`, etc.) for small local models and `!tool` commands.
 */

import { ELEMENTS } from "../elements.js";
import { validateDiagram } from "../circuit.js";
import { MECHANISM_PRESETS } from "../physics/mechanisms.js";
import { MATERIAL_DEFAULTS, MATERIAL_PRESETS, nextPhysicsId } from "../physics/model.js";
import { listActuators } from "../physics/actuators.js";
import { basePath } from "../../shared/basePath.js";
import { TOOLS as CANONICAL_TOOLS, TOOL_MAP } from "../../shared/automation/tools.js";

/** Compact core subset of canonical tools suited for 1.7B local models (like LFM3-1.7B). */
export const PI_SMALL_TOOL_NAMES = [
  "p5comp_build",
  "p5comp_state",
  "p5comp_catalog",
  "p5comp_part_put",
  "p5comp_part_remove",
  "p5comp_wire_put",
  "p5comp_wire_remove",
  "p5comp_code_get",
  "p5comp_code_set",
  "p5comp_control_set",
  "p5comp_runtime",
  "p5comp_physics",
  "p5comp_media_put",
  "p5comp_drawing",
  "p5comp_diagram",
  "p5comp_console",
  "p5comp_export",
  "p5comp_examples",
];

const SHORT_TOOL_SPECS = [
  { name: "get_project_state", params: "", description: "Read current circuit parts, wires, actuators, physics bodies, and code sizes." },
  { name: "list_components", params: "query?", description: "Search available circuit components by name or type." },
  { name: "clear_circuit", params: "keepBoard?", description: "Clear circuit parts, wires, and physics layer (keeps Arduino Uno by default)." },
  { name: "add_part", params: "id?, type, left?, top?, rotate?, attrs?", description: "Add an electronic component to the circuit canvas." },
  { name: "remove_part", params: "id", description: "Remove a component and its connected wires." },
  { name: "connect_wire", params: "from, to, color?", description: "Wire two terminals (e.g. from:'board:9', to:'servo1:PWM')." },
  { name: "set_arduino_code", params: "code", description: "Set the Arduino sketch (.ino) source code." },
  { name: "set_p5_code", params: "code", description: "Set the p5.js sketch (sketch.js) source code." },
  { name: "add_mechanism", params: "preset, actuatorId?", description: "Attach a physics mechanism preset (crank-slider, four-bar, gear-pair, rack-pinion, cam-follower, scotch-yoke, ratchet-pawl, ball-launcher, curve-track) to an actuator." },
  { name: "add_physics_body", params: "shape, x, y, type?, w?, h?, r?, length?, teeth?, material?, color?, trace?", description: "Add a rigid body (box, circle, link, gear, ramp) to the Physics layer." },
  { name: "add_physics_joint", params: "kind, a?, b?, anchor?, actuatorId?, motorSpeed?", description: "Add a hinge, weld, spring, slider, or curve joint to the Physics layer." },
  { name: "load_example", params: "query", description: "Load a shipped example project matching query (e.g. 'servo crank', 'four bar', 'one led', 'servo garden')." },
  { name: "run_simulation", params: "action", description: "Control simulation: action is 'run', 'pause', 'stop', or 'rewind'." },
];

/**
 * OpenAI/Pi function-calling tool specs derived directly from the canonical MCP/WebMCP TOOLS.
 * @param {"small" | "full"} set
 */
export function piToolSpecs(set = "full") {
  const allowed = set === "small" ? new Set(PI_SMALL_TOOL_NAMES) : null;
  return CANONICAL_TOOLS.filter((t) => !allowed || allowed.has(t.name)).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

export function createAssistantTools(wb) {
  const ctx = wb.ctx;

  const getDiagram = () => ctx.diagram?.() || { parts: [], connections: [] };
  const applyProject = async (proj) => {
    if (ctx.applyProject) await ctx.applyProject(proj);
    else await ctx.openProject(proj);
  };
  const applyDiagram = async (next) => {
    validateDiagram(next);
    const proj = structuredClone(ctx.project());
    proj.diagram = next;
    await applyProject(proj);
  };

  function summary() {
    const d = getDiagram();
    const parts = (d.parts || []).map((p) => `${p.id}:${p.type}@(${Math.round(p.left)},${Math.round(p.top)})`);
    const wires = (d.connections || []).map((c) => `${c[0]}->${c[1]}`);
    const acts = listActuators(d.parts || [], ctx.partElements?.()).map((a) => a.id);
    const phys = wb.physics?.scene;
    const bodyList = (phys?.bodies || [])
      .slice(0, 12)
      .map((b) => `${b.id}:${b.shape}${b.label ? `(${b.label})` : ""}`)
      .join(", ");
    const jointList = (phys?.joints || [])
      .slice(0, 12)
      .map((j) => `${j.id}:${j.kind}(${j.a || "ground"}↔${j.b || "ground"}${j.actuatorId ? `,act:${j.actuatorId}` : ""})`)
      .join(", ");
    return [
      `Project: ${wb.name}`,
      `Files: Arduino=${wb.arduinoName || "sketch.ino"}, p5=${wb.p5Name || "sketch.js"}`,
      `Parts (${parts.length}): ${parts.join(", ") || "none"}`,
      `Wires (${wires.length}): ${wires.slice(0, 14).join(", ") || "none"}${wires.length > 14 ? " …" : ""}`,
      `Actuators: ${acts.join(", ") || "none"}`,
      `Physics: ${phys?.bodies?.length || 0} bodies${bodyList ? ` [${bodyList}]` : ""}, ${phys?.joints?.length || 0} joints${jointList ? ` [${jointList}]` : ""}`,
    ].join("\n");
  }

  /**
   * Forgiving argument normalizer so small/medium LLMs don't burn rounds on AJV wrapper mismatches.
   */
  async function normalizeCanonicalArgs(tool, rawArgs = {}) {
    const a = rawArgs && typeof rawArgs === "object" ? structuredClone(rawArgs) : {};
    if (tool === "p5comp_part_put") {
      if (!a.part && a.type) {
        const { expectedRevision, ...rest } = a;
        return {
          part: rest,
          ...(expectedRevision != null ? { expectedRevision } : {}),
        };
      }
      if (a.part && typeof a.part === "object") {
        const d = getDiagram();
        const idx = (d.parts || []).length;
        if (!a.part.id && a.part.type) {
          a.part.id =
            a.part.type.replace(/^(wokwi|p5comp)-/, "").replace(/[^a-z0-9]/gi, "") + (idx + 1);
        }
        if (!Number.isFinite(Number(a.part.left))) a.part.left = 340 + (idx % 3) * 140;
        if (!Number.isFinite(Number(a.part.top))) a.part.top = 80 + Math.floor(idx / 3) * 120;
        if (!a.part.attrs || typeof a.part.attrs !== "object") a.part.attrs = {};
      }
      return a;
    }
    if (tool === "p5comp_wire_put") {
      if (!a.connection && a.from && a.to) {
        const autoColor = (ep) =>
          /:(gnd|neg|minus|-)/i.test(ep)
            ? "#242625"
            : /:(5v|3\.3v|vcc|vin|v\+|pos|\+)/i.test(ep)
              ? "#c45b4a"
              : null;
        const color = a.color || autoColor(a.from) || autoColor(a.to) || "#4e8da6";
        return {
          connection: [String(a.from), String(a.to), color, []],
          ...(a.index != null ? { index: a.index } : {}),
        };
      }
      return a;
    }
    if (tool === "p5comp_code_set") {
      if (a.source == null && typeof a.code === "string") {
        a.source = a.code;
        delete a.code;
      }
      if (!a.language) {
        a.language = /\.js$/i.test(String(a.name || "")) ? "p5" : "arduino";
      }
      return a;
    }
    if (tool === "p5comp_runtime") {
      if (a.action === "run") a.action = "start";
      if (a.action === "reset") a.action = "rewind";
      return a;
    }
    if (tool === "p5comp_physics") {
      if (a.action === "body_put" && !a.body && a.shape) {
        const { action, ...rest } = a;
        return { action, body: rest };
      }
      if (a.action === "joint_put" && !a.joint && a.kind) {
        const { action, ...rest } = a;
        return { action, joint: rest };
      }
      if (a.action === "settings" && !a.settings) {
        const { action, ...rest } = a;
        return { action, settings: rest };
      }
      if (a.action === "mechanism") {
        const reserved = new Set(["action", "preset", "actuatorId", "origin", "clear", "params"]);
        const extra = {};
        for (const [k, v] of Object.entries(a)) {
          if (!reserved.has(k)) {
            extra[k] = v;
            delete a[k];
          }
        }
        if (Object.keys(extra).length) {
          a.params = { ...(a.params || {}), ...extra };
        }
        return a;
      }
      return a;
    }
    if (tool === "p5comp_media_put" && !a.media && (a.source || a.text || a.content)) {
      const text = String(a.source || a.text || a.content);
      const source = a.title ? `## ${a.title}\n\n${text}` : text;
      return {
        media: {
          id: a.id || `note-${Date.now().toString(36)}`,
          kind: "note",
          x: Number.isFinite(Number(a.x)) ? Number(a.x) : 40,
          y: Number.isFinite(Number(a.y)) ? Number(a.y) : -140,
          width: Number.isFinite(Number(a.width)) ? Number(a.width) : 320,
          height: Number.isFinite(Number(a.height)) ? Number(a.height) : 160,
          source,
          format: "markdown",
        },
      };
    }
    if (tool === "p5comp_examples" && !a.path && a.query) {
      try {
        const q = String(a.query).toLowerCase();
        const index = await (await fetch(basePath("examples/index.json"))).json();
        const match =
          index.find((e) => e.name.toLowerCase().includes(q) || e.project.toLowerCase().includes(q)) ||
          index.find((e) => (e.folder || "").toLowerCase().includes(q));
        if (match) return { path: match.project };
      } catch {}
      return {};
    }
    if (tool === "p5comp_diagram" && !a.code && (a.mermaid || a.source)) {
      a.code = a.mermaid || a.source;
      delete a.mermaid;
      delete a.source;
      return a;
    }
    return a;
  }

  async function run(tool, args = {}) {
    // 1. Canonical MCP / WebMCP tools route straight through window.p5comp.callTool when present.
    if (TOOL_MAP.has(tool)) {
      const api = typeof window !== "undefined" ? window.p5comp : null;
      if (api?.callTool) {
        const normalized = await normalizeCanonicalArgs(tool, args);
        const res = await api.callTool(tool, normalized, { source: "agent" });
        const value = res?.result ?? res;
        // Keep agent-facing payloads compact so small models don't get truncated mid-object.
        if (tool === "p5comp_catalog" && Array.isArray(value)) {
          const items = value.slice(0, 24).map((e) => ({
            type: e.type,
            name: e.name,
            group: e.group,
            pins: e.pins,
          }));
          const q = String(args?.query || "").toLowerCase();
          const mechMatches = q
            ? MECHANISM_PRESETS.filter(
                (m) =>
                  m.id.includes(q) ||
                  m.name.toLowerCase().includes(q) ||
                  m.tagline.toLowerCase().includes(q) ||
                  /linkage|mechanism|ball|ramp|crank|yoke|cam|ratchet|gear|rack|pinion|piston|slider|spring|hinge/.test(q),
              ).map((m) => ({ preset: m.id, name: m.name, tagline: m.tagline }))
            : [];
          if (mechMatches.length) {
            return {
              electronicParts: items,
              physicsMechanisms: mechMatches,
              hint: "Physics mechanisms, balls, and ramps are built with p5comp_physics({ action:'demo'|'mechanism'|'batch' }), not p5comp_catalog.",
            };
          }
          return items;
        }
        if (tool === "p5comp_state" && value && typeof value === "object") {
          const d = getDiagram();
          return {
            running: value.running,
            paused: value.paused,
            p5Running: value.p5Running,
            parts: (d.parts || []).map((p) => ({ id: p.id, type: p.type, left: Math.round(p.left), top: Math.round(p.top), attrs: p.attrs })),
            connections: d.connections || [],
            physics: value.physics,
            selection: value.selection,
            recentConsole: (value.console || []).slice(-12),
          };
        }
        return value;
      }
      throw new Error(`Canonical tool ${tool} requires the live p5comp agent surface.`);
    }

    // 2. Friendly short aliases (used by lightweight JSON loop, !tool commands, and unit tests).
    if (tool === "get_project_state") {
      const d = getDiagram();
      return {
        name: wb.name,
        parts: d.parts,
        connections: d.connections,
        actuators: listActuators(d.parts || [], ctx.partElements?.()).map((a) => ({ id: a.id, type: a.type, x: Math.round(a.x), y: Math.round(a.y) })),
        physics: {
          bodies: wb.physics?.scene?.bodies?.length || 0,
          joints: wb.physics?.scene?.joints?.length || 0,
        },
        arduinoLines: (ctx.project()?.arduino || "").split("\n").length,
        p5Lines: (wb.p5Source?.() || "").split("\n").length,
      };
    }

    if (tool === "list_components") {
      const q = String(args.query || "").trim().toLowerCase();
      return ELEMENTS.filter(
        (e) =>
          !q ||
          e.type.toLowerCase().includes(q) ||
          (e.name || "").toLowerCase().includes(q) ||
          (e.group || "").toLowerCase().includes(q),
      )
        .slice(0, 20)
        .map((e) => ({ type: e.type, name: e.name, group: e.group, pins: e.pins }));
    }

    if (tool === "clear_circuit") {
      const keepBoard = args.keepBoard !== false;
      const d = getDiagram();
      const board = keepBoard
        ? d.parts.find((p) => p.type.startsWith("wokwi-arduino-")) || {
            id: "board",
            type: "wokwi-arduino-uno",
            left: 0,
            top: 80,
            attrs: {},
          }
        : null;
      await applyDiagram({
        version: 1,
        parts: board ? [board] : [],
        connections: [],
      });
      wb.physics?.load(null);
      return { cleared: true, keptBoard: board?.id || null };
    }

    if (tool === "add_part") {
      const type = String(args.type || "").trim();
      const spec = ELEMENTS.find((e) => e.type === type);
      if (!spec) throw new Error(`Unknown component type: ${type}`);
      const d = structuredClone(getDiagram());
      const used = new Set(d.parts.map((p) => p.id));
      let id = String(args.id || type.replace(/^(wokwi|p5comp)-/, "").replace(/[^a-z0-9]/gi, "") + "1");
      let n = 2;
      while (used.has(id)) id = id.replace(/\d+$/, "") + n++;
      const idx = d.parts.length;
      const left = Number.isFinite(Number(args.left)) ? Number(args.left) : 340 + (idx % 3) * 140;
      const top = Number.isFinite(Number(args.top)) ? Number(args.top) : 80 + Math.floor(idx / 3) * 120;
      const part = {
        id,
        type,
        left,
        top,
        ...(Number.isFinite(Number(args.rotate)) ? { rotate: Number(args.rotate) } : {}),
        attrs: { ...(spec.attrs || {}), ...(args.attrs || {}) },
      };
      d.parts.push(part);
      await applyDiagram(d);
      return { added: part.id, type: part.type, left: part.left, top: part.top };
    }

    if (tool === "remove_part") {
      const id = String(args.id || "");
      const d = structuredClone(getDiagram());
      const before = d.parts.length;
      d.parts = d.parts.filter((p) => p.id !== id);
      d.connections = d.connections.filter(
        (c) => !String(c[0]).startsWith(`${id}:`) && !String(c[1]).startsWith(`${id}:`),
      );
      if (d.parts.length === before) throw new Error(`Part not found: ${id}`);
      await applyDiagram(d);
      return { removed: id };
    }

    if (tool === "connect_wire") {
      const from = String(args.from || "").trim();
      const to = String(args.to || "").trim();
      const color = String(args.color || "#4e8da6");
      if (!from.includes(":") || !to.includes(":")) {
        throw new Error("Wire endpoints must use 'partId:pin' format.");
      }
      const d = structuredClone(getDiagram());
      d.connections.push([from, to, color, []]);
      await applyDiagram(d);
      return { connected: [from, to], color };
    }

    if (tool === "set_arduino_code") {
      const code = String(args.code || "");
      if (!code.trim()) throw new Error("Arduino code is empty.");
      ctx.setCode(ctx.arduinoEditor, code);
      wb.files[wb.arduinoName] = code;
      ctx.persist();
      return { updated: wb.arduinoName, lines: code.split("\n").length };
    }

    if (tool === "set_p5_code") {
      const code = String(args.code || "");
      if (!code.trim()) throw new Error("p5.js code is empty.");
      ctx.setCode(ctx.p5Editor, code);
      wb.files[wb.p5Name] = code;
      ctx.persist();
      wb.scheduleP5?.();
      return { updated: wb.p5Name, lines: code.split("\n").length };
    }

    if (tool === "add_mechanism") {
      const presetName = String(args.preset || "crank-slider").toLowerCase();
      const preset =
        MECHANISM_PRESETS.find((m) => m.id === presetName || m.name.toLowerCase().includes(presetName)) ||
        MECHANISM_PRESETS[0];
      const acts = wb.physics.actuators();
      const target =
        (args.actuatorId && acts.find((a) => a.id === args.actuatorId)) || acts[0] || null;
      const origin = target ? [target.x, target.y] : [480, 200];
      wb.physics.pushUndo();
      const { bodies, joints } = preset.build({
        origin,
        actuatorId: target?.id || null,
        actuatorType: target?.type || null,
        hornTip: target?.hornTip ? [target.hornTip.x, target.hornTip.y] : null,
        existingBodies: wb.physics.scene.bodies,
        existingJoints: wb.physics.scene.joints,
      });
      wb.physics.scene.bodies.push(...bodies);
      wb.physics.scene.joints.push(...joints);
      wb.physics.visible = true;
      wb.physics.persistChange();
      wb.physics.updateToolbarState();
      return {
        mechanism: preset.id,
        attachedTo: target?.id || null,
        bodies: bodies.map((b) => b.id),
      };
    }

    if (tool === "add_physics_body") {
      const shape = String(args.shape || "circle");
      const mat = MATERIAL_PRESETS[args.material] || {};
      const id = nextPhysicsId("b", wb.physics.scene.bodies);
      const body = {
        id,
        label: args.label || shape,
        type: args.type || (shape === "ramp" || shape === "chain" ? "static" : "dynamic"),
        shape: shape === "ramp" ? "chain" : shape,
        x: Number(args.x) || 420,
        y: Number(args.y) || 220,
        angle: Number(args.angle) || 0,
        ...(shape === "circle" ? { r: Number(args.r) || 16 } : {}),
        ...(shape === "box" ? { w: Number(args.w) || 48, h: Number(args.h) || 28 } : {}),
        ...(shape === "link" ? { length: Number(args.length) || 80, width: Number(args.width) || 14 } : {}),
        ...(shape === "gear" ? { teeth: Number(args.teeth) || 12, module: Number(args.module) || 6 } : {}),
        ...(shape === "ramp" || shape === "chain"
          ? { pts: Array.isArray(args.pts) ? args.pts : [[-60, -10], [60, 15]], thickness: 8 }
          : {}),
        ...MATERIAL_DEFAULTS,
        ...mat,
        ...(args.color ? { color: args.color } : {}),
        trace: Boolean(args.trace),
      };
      wb.physics.pushUndo();
      wb.physics.scene.bodies.push(body);
      wb.physics.visible = true;
      wb.physics.persistChange();
      wb.physics.updateToolbarState();
      return { addedBody: body.id, shape: body.shape };
    }

    if (tool === "add_physics_joint") {
      const kind = String(args.kind || "hinge");
      const id = nextPhysicsId("j", wb.physics.scene.joints);
      const acts = wb.physics.actuators();
      const target = args.actuatorId ? acts.find((a) => a.id === args.actuatorId) : null;
      const joint = {
        id,
        kind,
        a: args.a ?? null,
        b: args.b ?? null,
        anchor: args.anchor || (target ? [target.x, target.y] : [420, 220]),
        ...(target ? { actuatorId: target.id } : {}),
        ...(Number.isFinite(Number(args.motorSpeed)) && !target
          ? { motor: { on: true, speed: Number(args.motorSpeed), torque: 220 } }
          : {}),
      };
      wb.physics.pushUndo();
      wb.physics.scene.joints.push(joint);
      wb.physics.persistChange();
      wb.physics.updateToolbarState();
      return { addedJoint: joint.id, kind };
    }

    if (tool === "load_example") {
      const q = String(args.query || "").toLowerCase();
      const index = await (await fetch(basePath("examples/index.json"))).json();
      const match =
        index.find((e) => e.name.toLowerCase().includes(q) || e.project.toLowerCase().includes(q)) ||
        index.find((e) => (e.folder || "").toLowerCase().includes(q));
      if (!match) throw new Error(`No example matching "${args.query}".`);
      const proj = await (await fetch(basePath(match.project))).json();
      await applyProject(proj);
      return { loaded: match.name };
    }

    if (tool === "run_simulation") {
      const action = String(args.action || "run").toLowerCase();
      if (action === "run") {
        ctx.runArduino?.();
        return { status: "running" };
      }
      if (action === "stop") {
        ctx.stop?.();
        return { status: "stopped" };
      }
      if (action === "rewind") {
        ctx.stop?.();
        wb.physics?.rewind?.();
        return { status: "rewound" };
      }
      if (action === "pause") {
        document.getElementById("pause")?.click();
        return { status: "paused" };
      }
      throw new Error(`Unknown run_simulation action: ${action}`);
    }

    throw new Error(`Unknown tool: ${tool}`);
  }

  return {
    specs: () => [
      ...SHORT_TOOL_SPECS,
      ...CANONICAL_TOOLS.map((t) => ({
        name: t.name,
        params: Object.keys(t.inputSchema?.properties || {}).join(", "),
        description: t.description,
      })),
    ],
    piSpecs: (set = "full") => piToolSpecs(set),
    summary,
    run,
  };
}
