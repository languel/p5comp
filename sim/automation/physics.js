/** Physics & Mechanisms automation adapter for window.p5comp, WebMCP, MCP, and Pi Agent. */
import { MECHANISM_PRESETS } from "../physics/mechanisms.js";
import { MATERIAL_DEFAULTS, MATERIAL_PRESETS, nextPhysicsId } from "../physics/model.js";

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
      presets: MECHANISM_PRESETS.map((m) => ({ id: m.id, name: m.name })),
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
    const { bodies, joints } = preset.build({
      origin,
      actuatorId: target?.id || null,
      actuatorType: target?.type || null,
      hornTip: target?.hornTip ? [target.hornTip.x, target.hornTip.y] : null,
      existingBodies: scene.bodies,
      existingJoints: scene.joints,
    });
    scene.bodies.push(...bodies);
    scene.joints.push(...joints);
    physics.visible = true;
    physics.persistChange?.();
    physics.updateToolbarState?.();
    return {
      mechanism: preset.id,
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
