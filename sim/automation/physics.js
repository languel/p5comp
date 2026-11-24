/** Physics & Mechanisms automation adapter for window.p5comp, WebMCP, MCP, and Pi Agent. */
import { MECHANISM_PRESETS } from "../physics/mechanisms.js";
import { MATERIAL_DEFAULTS, MATERIAL_PRESETS, nextPhysicsId } from "../physics/model.js";

const MECHANISM_NOTES = {
  "crank-slider": "## Crank & Slider\nConverts rotary motion ($\\theta$) into reciprocating linear motion:\n$$x(\\theta) = r\\cos\\theta + \\sqrt{L^2 - r^2\\sin^2\\theta}$$",
  "four-bar": "## Four-Bar Linkage\nCrank, coupler, and grounded rocker. Satisfies Grashof's law ($s + l \\le p + q$) when the shortest link can rotate $360^\\circ$ while the coupler traces a closed curve.",
  "scotch-yoke": "## Scotch Yoke\nA crank pin sliding in a vertical slot produces pure simple harmonic (sinusoidal) linear motion:\n$$x(t) = r\\cos(\\omega t)$$",
  "gear-pair": "## Spur Gear Pair\nMeshing 12T driving gear and 18T driven gear:\n$$\\frac{\\omega_2}{\\omega_1} = -\\frac{N_1}{N_2} = -\\frac{12}{18} = -\\frac{2}{3}$$",
  "rack-pinion": "## Rack & Pinion\nConverts rotary pinion rotation ($\\theta$) directly into linear displacement ($x = r_p\\,\\theta$).",
  "cam-follower": "## Cam & Follower\nAn eccentric cam lobe lifts a spring-returned linear follower once per revolution, turning rotation into a periodic dwell/lift profile.",
  "ratchet-pawl": "## Ratchet & Pawl\nAn oscillating drive lever advances a toothed wheel in one direction while the pawl prevents reverse rotation.",
  "curve-track": "## Curved Guide Track\nConstrains a sliding carriage pin along a curved arc path for non-linear guided motion.",
  "ball-launcher": "## Catapult & Ramp\nAn actuator-driven paddle transfers angular momentum to launch a bouncy ball onto a sloped track.",
};

export function buildMechanismArena(origin = [480, 200], existingBodies = []) {
  const [ox, oy] = origin;
  const taken = [...existingBodies];
  const mk = (prefix) => {
    const id = nextPhysicsId(prefix, taken);
    taken.push({ id });
    return id;
  };
  return [
    {
      id: mk("ball"),
      label: "Bouncy ball",
      type: "dynamic",
      shape: "circle",
      x: ox + 170,
      y: oy - 75,
      angle: 0,
      r: 15,
      color: "#e8bd53",
      trace: true,
      ...MATERIAL_DEFAULTS,
      restitution: 0.82,
      friction: 0.15,
    },
    {
      id: mk("ramp"),
      label: "Sloped ramp",
      type: "static",
      shape: "chain",
      x: ox + 175,
      y: oy + 55,
      angle: 0,
      pts: [[-95, -24], [0, 8], [95, -18]],
      thickness: 8,
      color: "#5ca688",
      ...MATERIAL_DEFAULTS,
      friction: 0.15,
      restitution: 0.5,
    },
  ];
}

export function defaultServoSweepSketch(pin = 9) {
  return `#include <Servo.h>
Servo actuator;
void setup() {
  actuator.attach(${pin});
  Serial.begin(9600);
}
void loop() {
  for (int a = 15; a <= 165; a += 3) {
    actuator.write(a);
    Serial.println(a);
    delay(25);
  }
  for (int a = 165; a >= 15; a -= 3) {
    actuator.write(a);
    Serial.println(a);
    delay(25);
  }
}
`;
}

export async function physicsCommand(physics, a = {}) {
  if (!physics) throw Error("Physics layer is not initialized.");
  const scene = physics.scene;

  if (a.action === "get") {
    return {
      running: Boolean(physics.running),
      simTime: physics.simTime || 0,
      visible: Boolean(physics.visible),
      active: Boolean(physics.active),
      gravity: scene.gravity,
      damping: scene.damping,
      bodies: structuredClone(scene.bodies || []),
      joints: structuredClone(scene.joints || []),
      actuators: (physics.actuators?.() || []).map((act) => ({
        id: act.id,
        type: act.type,
        x: Math.round(act.x),
        y: Math.round(act.y),
      })),
      selection: {
        bodies: [...(physics.selectedBodies || [])],
        joints: [...(physics.selectedJoints || [])],
      },
      presets: MECHANISM_PRESETS.map((m) => ({ id: m.id, name: m.name, tagline: m.tagline })),
    };
  }

  if (a.action === "clear") {
    physics.pushUndo?.();
    physics.load?.(null);
    physics.persistChange?.();
    physics.updateToolbarState?.();
    return { cleared: true };
  }

  if (a.action === "body_put") {
    const spec = a.body;
    if (!spec || typeof spec !== "object") throw Error("body object is required.");
    const shape = String(spec.shape || "circle");
    const mat = MATERIAL_PRESETS[spec.material] || {};
    physics.pushUndo?.();
    const existingIdx = spec.id ? scene.bodies.findIndex((b) => b.id === spec.id) : -1;
    if (existingIdx >= 0) {
      const updated = { ...scene.bodies[existingIdx], ...mat, ...spec };
      if (updated.shape === "ramp") updated.shape = "chain";
      scene.bodies[existingIdx] = updated;
      physics.visible = true;
      physics.persistChange?.();
      physics.renderInspector?.();
      return { updatedBody: updated.id, body: structuredClone(updated) };
    }
    const id = spec.id || nextPhysicsId("b", scene.bodies);
    const body = {
      id,
      label: spec.label || shape,
      type: spec.type || (shape === "ramp" || shape === "chain" ? "static" : "dynamic"),
      shape: shape === "ramp" ? "chain" : shape,
      x: Number.isFinite(Number(spec.x)) ? Number(spec.x) : 420,
      y: Number.isFinite(Number(spec.y)) ? Number(spec.y) : 220,
      angle: Number(spec.angle) || 0,
      ...(shape === "circle" ? { r: Number(spec.r) || 16 } : {}),
      ...(shape === "box" ? { w: Number(spec.w) || 48, h: Number(spec.h) || 28 } : {}),
      ...(shape === "link" ? { length: Number(spec.length) || 80, width: Number(spec.width) || 14 } : {}),
      ...(shape === "gear" ? { teeth: Number(spec.teeth) || 12, module: Number(spec.module) || 6 } : {}),
      ...(shape === "ramp" || shape === "chain"
        ? { pts: Array.isArray(spec.pts) ? spec.pts : [[-60, -10], [60, 15]], thickness: Number(spec.thickness) || 8 }
        : {}),
      ...MATERIAL_DEFAULTS,
      ...mat,
      ...spec,
      id,
      shape: shape === "ramp" ? "chain" : shape,
      trace: Boolean(spec.trace),
    };
    scene.bodies.push(body);
    physics.visible = true;
    physics.persistChange?.();
    physics.updateToolbarState?.();
    return { addedBody: body.id, body: structuredClone(body) };
  }

  if (a.action === "body_remove") {
    const id = String(a.id || "");
    if (!id) throw Error("id is required.");
    const before = scene.bodies.length;
    physics.pushUndo?.();
    scene.bodies = scene.bodies.filter((b) => b.id !== id);
    scene.joints = scene.joints.filter((j) => j.a !== id && j.b !== id);
    physics.selectedBodies?.delete(id);
    if (scene.bodies.length === before) throw Error(`Physics body not found: ${id}`);
    physics.persistChange?.();
    physics.renderInspector?.();
    return { removedBody: id };
  }

  if (a.action === "joint_put") {
    const spec = a.joint;
    if (!spec || typeof spec !== "object") throw Error("joint object is required.");
    physics.pushUndo?.();
    const existingIdx = spec.id ? scene.joints.findIndex((j) => j.id === spec.id) : -1;
    if (existingIdx >= 0) {
      const updated = { ...scene.joints[existingIdx], ...spec };
      scene.joints[existingIdx] = updated;
      physics.visible = true;
      physics.persistChange?.();
      physics.renderInspector?.();
      return { updatedJoint: updated.id, joint: structuredClone(updated) };
    }
    const kind = String(spec.kind || "hinge");
    const id = spec.id || nextPhysicsId("j", scene.joints);
    const acts = physics.actuators?.() || [];
    const target = spec.actuatorId ? acts.find((act) => act.id === spec.actuatorId) : null;
    const joint = {
      id,
      kind,
      a: spec.a ?? null,
      b: spec.b ?? null,
      anchor: spec.anchor || (target ? [target.x, target.y] : [420, 220]),
      ...(target ? { actuatorId: target.id } : {}),
      ...(Number.isFinite(Number(spec.motorSpeed)) && !target
        ? { motor: { on: true, speed: Number(spec.motorSpeed), torque: 220 } }
        : {}),
      ...spec,
      id,
      kind,
    };
    scene.joints.push(joint);
    physics.visible = true;
    physics.persistChange?.();
    physics.updateToolbarState?.();
    return { addedJoint: joint.id, joint: structuredClone(joint) };
  }

  if (a.action === "joint_remove") {
    const id = String(a.id || "");
    if (!id) throw Error("id is required.");
    const before = scene.joints.length;
    physics.pushUndo?.();
    scene.joints = scene.joints.filter((j) => j.id !== id);
    physics.selectedJoints?.delete(id);
    if (scene.joints.length === before) throw Error(`Physics joint not found: ${id}`);
    physics.persistChange?.();
    physics.renderInspector?.();
    return { removedJoint: id };
  }

  if (a.action === "batch") {
    physics.pushUndo?.();
    if (a.clear) {
      scene.bodies = [];
      scene.joints = [];
    }
    const addedBodies = [];
    const addedJoints = [];
    for (const spec of a.bodies || []) {
      if (!spec || typeof spec !== "object") continue;
      const shape = String(spec.shape || "circle");
      const mat = MATERIAL_PRESETS[spec.material] || {};
      const existingIdx = spec.id ? scene.bodies.findIndex((b) => b.id === spec.id) : -1;
      if (existingIdx >= 0) {
        const updated = { ...scene.bodies[existingIdx], ...mat, ...spec };
        if (updated.shape === "ramp") updated.shape = "chain";
        scene.bodies[existingIdx] = updated;
        addedBodies.push(updated.id);
      } else {
        const id = spec.id || nextPhysicsId("b", scene.bodies);
        const body = {
          id,
          label: spec.label || shape,
          type: spec.type || (shape === "ramp" || shape === "chain" ? "static" : "dynamic"),
          shape: shape === "ramp" ? "chain" : shape,
          x: Number.isFinite(Number(spec.x)) ? Number(spec.x) : 420,
          y: Number.isFinite(Number(spec.y)) ? Number(spec.y) : 220,
          angle: Number(spec.angle) || 0,
          ...(shape === "circle" ? { r: Number(spec.r) || 16 } : {}),
          ...(shape === "box" ? { w: Number(spec.w) || 48, h: Number(spec.h) || 28 } : {}),
          ...(shape === "link" ? { length: Number(spec.length) || 80, width: Number(spec.width) || 14 } : {}),
          ...(shape === "gear" ? { teeth: Number(spec.teeth) || 12, module: Number(spec.module) || 6 } : {}),
          ...(shape === "ramp" || shape === "chain"
            ? { pts: Array.isArray(spec.pts) ? spec.pts : [[-60, -10], [60, 15]], thickness: Number(spec.thickness) || 8 }
            : {}),
          ...MATERIAL_DEFAULTS,
          ...mat,
          ...spec,
          id,
          shape: shape === "ramp" ? "chain" : shape,
          trace: Boolean(spec.trace),
        };
        scene.bodies.push(body);
        addedBodies.push(body.id);
      }
    }
    const acts = physics.actuators?.() || [];
    for (const spec of a.joints || []) {
      if (!spec || typeof spec !== "object") continue;
      const existingIdx = spec.id ? scene.joints.findIndex((j) => j.id === spec.id) : -1;
      if (existingIdx >= 0) {
        const updated = { ...scene.joints[existingIdx], ...spec };
        scene.joints[existingIdx] = updated;
        addedJoints.push(updated.id);
      } else {
        const kind = String(spec.kind || "hinge");
        const id = spec.id || nextPhysicsId("j", scene.joints);
        const target = spec.actuatorId ? acts.find((act) => act.id === spec.actuatorId) : null;
        const joint = {
          id,
          kind,
          a: spec.a ?? null,
          b: spec.b ?? null,
          anchor: spec.anchor || (target ? [target.x, target.y] : [420, 220]),
          ...(target ? { actuatorId: target.id } : {}),
          ...(Number.isFinite(Number(spec.motorSpeed)) && !target
            ? { motor: { on: true, speed: Number(spec.motorSpeed), torque: 220 } }
            : {}),
          ...spec,
          id,
          kind,
        };
        scene.joints.push(joint);
        addedJoints.push(joint.id);
      }
    }
    if (Array.isArray(a.settings?.gravity) && a.settings.gravity.length === 2) {
      scene.gravity = a.settings.gravity.map(Number);
    }
    physics.visible = true;
    physics.persistChange?.();
    physics.updateToolbarState?.();
    physics.renderInspector?.();
    return {
      bodies: addedBodies,
      joints: addedJoints,
      totalBodies: scene.bodies.length,
      totalJoints: scene.joints.length,
    };
  }

  if (a.action === "mechanism") {
    const presetName = String(a.preset || "crank-slider").toLowerCase();
    const preset =
      MECHANISM_PRESETS.find(
        (m) => m.id === presetName || m.name.toLowerCase().includes(presetName),
      ) || MECHANISM_PRESETS[0];
    const acts = physics.actuators?.() || [];
    const target =
      (a.actuatorId && acts.find((act) => act.id === a.actuatorId)) ||
      (!a.origin ? acts[0] : null) ||
      null;
    const origin = Array.isArray(a.origin)
      ? a.origin
      : target
        ? [target.x, target.y]
        : [480, 200];
    physics.pushUndo?.();
    if (a.clear) {
      scene.bodies = [];
      scene.joints = [];
    }
    const { bodies, joints } = preset.build({
      ...(a.params && typeof a.params === "object" ? a.params : {}),
      origin,
      actuatorId: target?.id || null,
      actuatorType: target?.type || null,
      hornTip: target?.hornTip ? [target.hornTip.x, target.hornTip.y] : null,
      existingBodies: scene.bodies,
      existingJoints: scene.joints,
    });
    scene.bodies.push(...bodies);
    scene.joints.push(...joints);
    if (a.addArena) {
      const arena = buildMechanismArena(origin, scene.bodies);
      scene.bodies.push(...arena);
      bodies.push(...arena);
    }
    physics.visible = true;
    physics.persistChange?.();
    physics.updateToolbarState?.();
    return {
      mechanism: preset.id,
      name: preset.name,
      tagline: preset.tagline,
      explanation: MECHANISM_NOTES[preset.id] || preset.tagline,
      attachedTo: target?.id || null,
      bodies: bodies.map((b) => b.id),
      joints: joints.map((j) => j.id),
    };
  }

  if (a.action === "select") {
    const ids = new Set(a.ids || []);
    physics.selectedBodies?.clear();
    physics.selectedJoints?.clear();
    for (const b of scene.bodies) if (ids.has(b.id)) physics.selectedBodies?.add(b.id);
    for (const j of scene.joints) if (ids.has(j.id)) physics.selectedJoints?.add(j.id);
    physics.renderInspector?.();
    physics.draw?.();
    return {
      bodies: [...(physics.selectedBodies || [])],
      joints: [...(physics.selectedJoints || [])],
    };
  }

  if (a.action === "settings") {
    const s = a.settings || {};
    if (Array.isArray(s.gravity) && s.gravity.length === 2) scene.gravity = s.gravity.map(Number);
    if (Number.isFinite(Number(s.damping))) scene.damping = Number(s.damping);
    if (typeof s.visible === "boolean") physics.visible = s.visible;
    if (typeof s.active === "boolean") physics.setActive?.(s.active);
    if (typeof s.debug === "boolean") physics.debug = s.debug;
    if (typeof s.snap === "boolean") physics.snapEnabled = s.snap;
    if (typeof s.preserveConnections === "boolean")
      physics.preserveConnections = s.preserveConnections;
    physics.persistChange?.();
    physics.updateToolbarState?.();
    return {
      gravity: scene.gravity,
      damping: scene.damping,
      visible: physics.visible,
      active: physics.active,
      debug: physics.debug,
      snap: physics.snapEnabled,
    };
  }

  if (a.action === "run") {
    await physics.start?.();
    return { running: Boolean(physics.running), simTime: physics.simTime || 0 };
  }

  if (a.action === "stop") {
    physics.stop?.();
    return { running: false, simTime: physics.simTime || 0 };
  }

  if (a.action === "rewind") {
    physics.rewind?.();
    return { running: false, simTime: 0 };
  }

  throw Error("Unsupported physics action: " + a.action);
}
