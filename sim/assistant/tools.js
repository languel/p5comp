/**
 * Pi-Agent Tool Registry for p5comp.
 * Gives the assistant direct, validated control over:
 * - Circuit parts & wires (Electronics layer)
 * - Arduino (.ino) and p5.js sketches
 * - Physics & Mechanisms layer (presets, bodies, joints, actuator coupling)
 * - Shipped examples & simulation transport (Run / Pause / Stop)
 */

import { ELEMENTS } from "../elements.js";
import { validateDiagram } from "../circuit.js";
import { MECHANISM_PRESETS } from "../physics/mechanisms.js";
import { MATERIAL_DEFAULTS, MATERIAL_PRESETS, nextPhysicsId } from "../physics/model.js";
import { listActuators } from "../physics/actuators.js";
import { basePath } from "../../shared/basePath.js";

const TOOL_SPECS = [
  { name: "get_project_state", params: "", description: "Read current circuit parts, wires, actuators, physics bodies, and code sizes." },
  { name: "list_components", params: "query?", description: "Search available circuit components by name or type." },
  { name: "clear_circuit", params: "keepBoard?", description: "Clear circuit parts, wires, and physics layer (keeps Arduino Uno by default)." },
  { name: "add_part", params: "id?, type, left?, top?, rotate?, attrs?", description: "Add an electronic component to the circuit canvas." },
  { name: "remove_part", params: "id", description: "Remove a component and its connected wires." },
  { name: "connect_wire", params: "from, to, color?", description: "Wire two terminals (e.g. from:'board:9', to:'servo1:PWM')." },
  { name: "set_arduino_code", params: "code", description: "Set the Arduino sketch (.ino) source code." },
  { name: "set_p5_code", params: "code", description: "Set the p5.js sketch (sketch.js) source code." },
  { name: "add_mechanism", params: "preset, actuatorId?", description: "Attach a physics mechanism preset (crank-slider, four-bar, gear-pair, rack-pinion, cam-follower, ball-launcher) to an actuator." },
  { name: "add_physics_body", params: "shape, x, y, type?, w?, h?, r?, length?, teeth?, material?, color?, trace?", description: "Add a rigid body (box, circle, link, gear, ramp) to the Physics layer." },
  { name: "add_physics_joint", params: "kind, a?, b?, anchor?, actuatorId?, motorSpeed?", description: "Add a hinge, weld, spring, or slider joint to the Physics layer." },
  { name: "load_example", params: "query", description: "Load a shipped example project matching query (e.g. 'servo crank', 'four bar', 'one led', 'servo garden')." },
  { name: "run_simulation", params: "action", description: "Control simulation: action is 'run', 'pause', or 'stop'." },
];

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
    return [
      `Project: ${wb.name}`,
      `Parts (${parts.length}): ${parts.join(", ") || "none"}`,
      `Wires (${wires.length}): ${wires.slice(0, 14).join(", ") || "none"}${wires.length > 14 ? " …" : ""}`,
      `Actuators: ${acts.join(", ") || "none"}`,
      `Physics: ${phys?.bodies?.length || 0} bodies, ${phys?.joints?.length || 0} joints`,
    ].join("\n");
  }

  async function run(tool, args = {}) {
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
      if (action === "pause") {
        document.getElementById("pause")?.click();
        return { status: "paused" };
      }
      throw new Error(`Unknown run_simulation action: ${action}`);
    }

    throw new Error(`Unknown tool: ${tool}`);
  }

  return {
    specs: () => TOOL_SPECS,
    summary,
    run,
  };
}
