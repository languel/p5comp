/**
 * Live bridge between Poliplan (DrawingBoard) marks and p5comp's PhysicsLayer.
 *
 * Designed to keep all experimental convergence work inside p5comp while staying
 * structurally 1:1 with ~/dev/artistmodelstudio/src/physics/model.js so it can be
 * merged back upstream cleanly (see docs/poliplan-physics-integration.md).
 */

import {
  poliplanDocToPhysicsBodies,
  thinPolyline,
  projectPointToPolyline,
  nextPhysicsId,
  MATERIAL_DEFAULTS,
} from "./model.js";

/**
 * Convert selected Poliplan mark(s) into dynamic or static physics bodies,
 * tagged with `sourceMarkId` so future edits in Poliplan update them live.
 */
export function attachPoliplanBodies(scene, doc, ids = [], { type = "dynamic" } = {}) {
  const elements = Array.isArray(doc?.elements) ? doc.elements : [];
  const chosen = ids?.length ? elements.filter((e) => ids.includes(e.id)) : elements;
  if (!chosen.length) return { bodies: [], replaced: 0 };

  const tempDoc = { elements: chosen };
  const rawBodies = poliplanDocToPhysicsBodies(tempDoc, scene.bodies);
  const created = [];
  let replaced = 0;

  // Match each generated body back to its source mark id in order.
  const validMarks = chosen.filter(
    (el) => Array.isArray(el?.points) && el.points.length && !["note", "image", "guide"].includes(el.role),
  );
  for (let i = 0; i < rawBodies.length; i++) {
    const b = rawBodies[i];
    const mark = validMarks[i];
    if (!mark) continue;
    b.type = type;
    b.sourceMarkId = mark.id;
    const markColor = mark.fill && mark.fill !== "none" && mark.fill !== "transparent"
      ? mark.fill
      : mark.color && mark.color !== "none" && mark.color !== "transparent"
        ? mark.color
        : mark.stroke && mark.stroke !== "none" && mark.stroke !== "transparent"
          ? mark.stroke
          : null;
    if (markColor) b.color = markColor;
    const existingIdx = scene.bodies.findIndex((x) => x.sourceMarkId === mark.id);
    if (existingIdx >= 0) {
      b.id = scene.bodies[existingIdx].id;
      scene.bodies[existingIdx] = { ...scene.bodies[existingIdx], ...b };
      replaced++;
    } else {
      scene.bodies.push(b);
      created.push(b);
    }
  }
  return { bodies: created, replaced };
}

/**
 * Detach physics bodies and curve track constraints linked to the given Poliplan mark IDs.
 */
export function detachPoliplanMarks(scene, ids = []) {
  const idSet = new Set(ids || []);
  if (!idSet.size) return { removedBodies: 0, removedJoints: 0 };
  const removedBodyIds = new Set();
  for (const b of scene.bodies) {
    if (b.sourceMarkId && idSet.has(b.sourceMarkId)) removedBodyIds.add(b.id);
  }
  const beforeB = scene.bodies.length;
  const beforeJ = scene.joints.length;
  scene.bodies = scene.bodies.filter((b) => !removedBodyIds.has(b.id));
  scene.joints = scene.joints.filter(
    (j) =>
      !(j.sourceMarkId && idSet.has(j.sourceMarkId)) &&
      !removedBodyIds.has(j.a) &&
      !removedBodyIds.has(j.b),
  );
  return {
    removedBodies: beforeB - scene.bodies.length,
    removedJoints: beforeJ - scene.joints.length,
  };
}

/**
 * Turn a selected Poliplan curve/stroke into a general `curve` track constraint.
 * Automatically constrains any dynamic physics body near the curve — or creates a
 * small carriage pin on the curve's start point if no dynamic body is near it yet!
 */
export function attachPoliplanCurveConstraint(scene, doc, ids = []) {
  const elements = Array.isArray(doc?.elements) ? doc.elements : [];
  const chosen = ids?.length ? elements.filter((e) => ids.includes(e.id)) : elements;
  const mark = chosen.find(
    (el) => Array.isArray(el?.points) && el.points.length >= 2 && !["note", "image", "guide"].includes(el.role),
  );
  if (!mark) return null;

  const rawPts = mark.points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]);
  const pts = thinPolyline(rawPts, 4);
  if (pts.length < 2) return null;

  // Find the closest dynamic body to the curve (within 42 px), else create a carriage pin at pts[0].
  let targetBody = null;
  let bestDist = 42;
  let bestAnchor = pts[0];
  for (const b of scene.bodies) {
    if (b.type !== "dynamic") continue;
    const proj = projectPointToPolyline(b.x, b.y, pts, Boolean(mark.closed));
    if (proj && proj.dist < bestDist) {
      bestDist = proj.dist;
      targetBody = b;
      bestAnchor = [proj.x, proj.y];
    }
  }

  let createdCarriage = null;
  if (!targetBody) {
    createdCarriage = {
      id: nextPhysicsId("car", scene.bodies),
      label: "Curve carriage",
      type: "dynamic",
      shape: "circle",
      x: pts[0][0],
      y: pts[0][1],
      angle: 0,
      r: 10,
      color: "#4e8da6",
      trace: true,
      collisionMask: 0x0001,
      ...MATERIAL_DEFAULTS,
    };
    scene.bodies.push(createdCarriage);
    targetBody = createdCarriage;
    bestAnchor = [pts[0][0], pts[0][1]];
  }

  const joint = {
    id: nextPhysicsId("j", scene.joints),
    kind: "curve",
    a: null,
    b: targetBody.id,
    anchor: bestAnchor,
    pts,
    closed: Boolean(mark.closed),
    friction: 0.03,
    sourceMarkId: mark.id,
  };
  const existingIdx = scene.joints.findIndex((j) => j.kind === "curve" && j.sourceMarkId === mark.id);
  if (existingIdx >= 0) {
    joint.id = scene.joints[existingIdx].id;
    scene.joints[existingIdx] = joint;
  } else {
    scene.joints.push(joint);
  }

  return { joint, body: targetBody, createdCarriage };
}

/**
 * Live-sync any physics bodies or curve constraints linked via `sourceMarkId`
 * whenever the user edits, moves, reshapes, or erases marks in Poliplan.
 */
export function syncLinkedPoliplanMarks(scene, doc) {
  if (!doc || !Array.isArray(doc.elements)) return false;
  const byMark = new Map(doc.elements.map((e) => [e.id, e]));
  let changed = false;

  // Sync linked bodies
  for (let i = scene.bodies.length - 1; i >= 0; i--) {
    const b = scene.bodies[i];
    if (!b.sourceMarkId) continue;
    const mark = byMark.get(b.sourceMarkId);
    if (!mark) {
      scene.bodies.splice(i, 1);
      scene.joints = scene.joints.filter((j) => j.a !== b.id && j.b !== b.id);
      changed = true;
      continue;
    }
    const rebuilt = poliplanDocToPhysicsBodies({ elements: [mark] }, [])[0];
    if (!rebuilt) continue;
    const markColor = mark.fill && mark.fill !== "none" && mark.fill !== "transparent"
      ? mark.fill
      : mark.color && mark.color !== "none" && mark.color !== "transparent"
        ? mark.color
        : null;
    const next = {
      ...b,
      shape: rebuilt.shape,
      x: rebuilt.x,
      y: rebuilt.y,
      ...(markColor ? { color: markColor } : {}),
      ...(rebuilt.r != null ? { r: rebuilt.r } : {}),
      ...(rebuilt.pts ? { pts: rebuilt.pts } : {}),
      ...(rebuilt.thickness != null ? { thickness: rebuilt.thickness } : {}),
    };
    if (JSON.stringify(next) !== JSON.stringify(b)) {
      scene.bodies[i] = next;
      changed = true;
    }
  }

  // Sync linked curve constraints
  for (let i = scene.joints.length - 1; i >= 0; i--) {
    const j = scene.joints[i];
    if (j.kind !== "curve" || !j.sourceMarkId) continue;
    const mark = byMark.get(j.sourceMarkId);
    if (!mark || !Array.isArray(mark.points) || mark.points.length < 2) {
      scene.joints.splice(i, 1);
      changed = true;
      continue;
    }
    const pts = thinPolyline(
      mark.points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]),
      4,
    );
    if (JSON.stringify(pts) !== JSON.stringify(j.pts)) {
      j.pts = pts;
      j.closed = Boolean(mark.closed);
      changed = true;
    }
  }

  return changed;
}
