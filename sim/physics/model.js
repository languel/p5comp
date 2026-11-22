/**
 * Pure physics scene model & geometry for p5comp's Algodoo-inspired 2D physics layer.
 * Modeled on artistmodelstudio/src/physics/model.js, extended with mechanical engineering
 * primitives (links, spur gears, prismatic sliders, actuator shaft bindings) and Poliplan import.
 *
 * Units: scene coordinates are canvas pixels and degrees; core.js converts to metres via world.ppm.
 */

export const WORLD_DEFAULTS = Object.freeze({
  gravity: [0, 9.8],
  ppm: 50,
  speed: 1,
  iterations: 8,
  floor: false,
  floorY: 560,
});

export const MATERIAL_PRESETS = Object.freeze({
  acrylic: { label: "Acrylic / PLA", density: 1.2, friction: 0.35, bounce: 0.25, color: "#4e8da6" },
  wood: { label: "Wood", density: 0.7, friction: 0.55, bounce: 0.2, color: "#b58552" },
  steel: { label: "Steel", density: 4.5, friction: 0.3, bounce: 0.15, color: "#6c7b88" },
  rubber: { label: "Rubber", density: 1.1, friction: 0.95, bounce: 0.82, color: "#c45b4a" },
  ice: { label: "Ice", density: 0.9, friction: 0.03, bounce: 0.1, color: "#8cc4d8" },
});

export const MATERIAL_DEFAULTS = Object.freeze({
  density: 1.2,
  friction: 0.45,
  bounce: 0.25,
  damping: 0.08,
  angularDamping: 0.08,
});

export const BODY_TYPES = ["dynamic", "static", "kinematic", "sensor"];
export const BODY_SHAPES = ["box", "circle", "link", "gear", "polygon", "chain"];
export const JOINT_KINDS = ["hinge", "weld", "spring", "slider", "curve"];

export const COLLISION_LAYERS = Object.freeze([
  { id: "A", label: "A", bit: 0x0001, z: 0 },
  { id: "B", label: "B", bit: 0x0002, z: 1 },
  { id: "C", label: "C", bit: 0x0004, z: 2 },
  { id: "D", label: "D", bit: 0x0008, z: 3 },
]);

const ALL_LAYERS_MASK = 0x000f;

/**
 * Resolve a body's Algodoo-style collision layer bitmask (bits 0..3 = layers A..D).
 * Two bodies collide iff `(mask1 & mask2) !== 0`.
 * Supports legacy string `collisionLayer` ("A".."D", "all", "none", "linkage") as well as numeric `collisionMask`.
 */
export function resolvedCollisionMask(body) {
  if (typeof body?.collisionMask === "number" && Number.isFinite(body.collisionMask)) {
    return body.collisionMask & ALL_LAYERS_MASK;
  }
  const raw = body?.collisionLayer;
  if (raw === "linkage" || raw === "none") return 0;
  if (raw === "all") return ALL_LAYERS_MASK;
  const found = COLLISION_LAYERS.find((l) => l.id === raw);
  if (found) return found.bit;
  return 0x0001; // Default: Layer A
}

/** Rapier2D 32-bit collision group bitmask (membership << 16 | filter). */
export function collisionGroupForBody(body) {
  const mask = resolvedCollisionMask(body) & 0xffff;
  return (mask << 16) | mask;
}

export function layerZOrder(body) {
  const mask = resolvedCollisionMask(body);
  if (mask === 0) return 5; // Pass-through links draw on top of gears/bodies
  let top = 0;
  for (const l of COLLISION_LAYERS) {
    if (mask & l.bit) top = Math.max(top, l.z);
  }
  return top;
}

export function createEmptyPhysicsScene(overrides = {}) {
  return {
    version: 1,
    world: { ...WORLD_DEFAULTS, ...(overrides.world || {}) },
    bodies: [],
    joints: [],
  };
}

let seqCounter = 1;
export function nextPhysicsId(prefix = "b", existing = []) {
  const used = new Set(existing.map((x) => x.id));
  while (used.has(`${prefix}${seqCounter}`)) seqCounter++;
  const id = `${prefix}${seqCounter++}`;
  return id;
}

// ---- geometry helpers (matching artistmodelstudio/src/physics/model.js) --------------------------

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeats. */
export function convexHull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  const upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function polygonCentroid(pts) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const k = x0 * y1 - x1 * y0;
    a += k;
    cx += (x0 + x1) * k;
    cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return {
      area: 0,
      c: [
        pts.reduce((s, q) => s + q[0], 0) / n,
        pts.reduce((s, q) => s + q[1], 0) / n,
      ],
    };
  }
  return { area: Math.abs(a / 2), c: [cx / (3 * a), cy / (3 * a)] };
}

export function roundness(pts) {
  if (pts.length < 6) return null;
  const { c } = polygonCentroid(pts);
  const r = pts.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]));
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length);
  return m > 0 && sd / m < 0.08 ? { c, r: m } : null;
}

export function thinPolyline(pts, minDist = 2) {
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (Math.hypot(pts[i][0] - out.at(-1)[0], pts[i][1] - out.at(-1)[1]) >= minDist) {
      out.push(pts[i]);
    }
  }
  out.push(pts.at(-1));
  return out.slice(0, 120);
}

/**
 * Compute spur gear tooth geometry (trapezoidal involute approximation) in local coordinates.
 * Matches the module & tooth-count parameterization used in ~/dev/mechanisms.
 */
export function gearGeometry(teeth = 12, mod = 6) {
  const z = Math.max(6, Math.min(48, Math.round(teeth)));
  const m = Math.max(2, Math.min(24, Number(mod) || 6));
  const pitchR = (z * m) / 2;
  const addendum = m * 0.9;
  const dedendum = m * 1.15;
  const rootR = Math.max(4, pitchR - dedendum);
  const tipR = pitchR + addendum;
  const step = (Math.PI * 2) / z;
  const rootHalf = step * 0.30;
  const tipHalf = step * 0.14;
  const teethPolys = [];
  const outline = [];
  for (let i = 0; i < z; i++) {
    const a = i * step;
    const p0 = [Math.cos(a - rootHalf) * rootR, Math.sin(a - rootHalf) * rootR];
    const p1 = [Math.cos(a - tipHalf) * tipR, Math.sin(a - tipHalf) * tipR];
    const p2 = [Math.cos(a + tipHalf) * tipR, Math.sin(a + tipHalf) * tipR];
    const p3 = [Math.cos(a + rootHalf) * rootR, Math.sin(a + rootHalf) * rootR];
    teethPolys.push([p0, p1, p2, p3]);
    outline.push(p0, p1, p2, p3);
  }
  return { teeth: z, module: m, pitchR, rootR, tipR, teethPolys, outline };
}

/** Compute local-space collider shapes for any physics body. */
export function collidersForBody(body) {
  if (body.shape === "circle") {
    return [{ kind: "ball", r: Math.max(3, Number(body.r) || 18), at: [0, 0] }];
  }
  if (body.shape === "box") {
    const hw = Math.max(3, (Number(body.w) || 40) / 2);
    const hh = Math.max(3, (Number(body.h) || 24) / 2);
    return [{ kind: "cuboid", hx: hw, hy: hh, at: [0, 0] }];
  }
  if (body.shape === "link") {
    const len = Math.max(8, Number(body.length) || 80);
    const r = Math.max(3, (Number(body.width) || 14) / 2);
    return [{ kind: "capsule", a: [-len / 2, 0], b: [len / 2, 0], r }];
  }
  if (body.shape === "gear") {
    const g = gearGeometry(body.teeth, body.module);
    return [
      { kind: "ball", r: g.rootR, at: [0, 0] },
      ...g.teethPolys.map((pts) => ({ kind: "hull", pts })),
    ];
  }
  if (body.shape === "polygon") {
    const pts = Array.isArray(body.pts) ? body.pts : [];
    const hull = convexHull(pts);
    if (hull.length < 3) return [{ kind: "ball", r: 10, at: [0, 0] }];
    return [{ kind: "hull", pts: hull }];
  }
  if (body.shape === "chain") {
    const pts = thinPolyline(Array.isArray(body.pts) ? body.pts : [], 2);
    const r = Math.max(2, (Number(body.thickness) || 6) / 2);
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      out.push({ kind: "capsule", a: pts[i - 1], b: pts[i], r });
    }
    return out;
  }
  return [];
}

/** Transform a local point on a body (with pose { x, y, a } in rad) to world space. */
export function bodyLocalToWorld(pose, lx, ly) {
  const cs = Math.cos(pose.a || 0);
  const sn = Math.sin(pose.a || 0);
  return [pose.x + lx * cs - ly * sn, pose.y + lx * sn + ly * cs];
}

/** Transform a world point into a body's local frame (pose { x, y, a } in rad). */
export function worldToBodyLocal(pose, wx, wy) {
  const dx = wx - pose.x;
  const dy = wy - pose.y;
  const cs = Math.cos(-(pose.a || 0));
  const sn = Math.sin(-(pose.a || 0));
  return [dx * cs - dy * sn, dx * sn + dy * cs];
}

function segDist(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/**
 * Project a world point (x, y) onto a polyline `pts = [[x0, y0], ...]`.
 * Returns closest point `{ x, y, tx, ty, nx, ny, dist, s, totalLen, atStart, atEnd }`.
 */
export function projectPointToPolyline(x, y, pts, closed = false) {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const segCount = closed ? pts.length : pts.length - 1;
  let best = null;
  let totalLen = 0;
  let bestS = 0;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (len * len)));
    const qx = a[0] + u * dx;
    const qy = a[1] + u * dy;
    const dist = Math.hypot(x - qx, y - qy);
    if (!best || dist < best.dist) {
      const tx = dx / len;
      const ty = dy / len;
      best = {
        x: qx,
        y: qy,
        tx,
        ty,
        nx: -ty,
        ny: tx,
        dist,
        segIndex: i,
        u,
      };
      bestS = totalLen + u * len;
    }
    totalLen += len;
  }
  if (!best) return null;
  return {
    ...best,
    s: bestS,
    totalLen,
    atStart: !closed && best.segIndex === 0 && best.u <= 0.001,
    atEnd: !closed && best.segIndex === segCount - 1 && best.u >= 0.999,
  };
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Hit-test a world point (wx, wy) against a body at its current pose (or rest pose). */
export function bodyHitTest(body, wx, wy, pose = null, slack = 5) {
  const p = pose || { x: body.x, y: body.y, a: ((body.angle || 0) * Math.PI) / 180 };
  const [lx, ly] = worldToBodyLocal(p, wx, wy);
  const shapes = collidersForBody(body);
  return shapes.some((s) => {
    if (s.kind === "ball") return Math.hypot(lx - s.at[0], ly - s.at[1]) <= s.r + slack;
    if (s.kind === "cuboid") return Math.abs(lx - s.at[0]) <= s.hx + slack && Math.abs(ly - s.at[1]) <= s.hy + slack;
    if (s.kind === "capsule") return segDist(lx, ly, s.a, s.b) <= s.r + slack;
    if (s.kind === "hull") {
      return (
        inPolygon(lx, ly, s.pts) ||
        s.pts.some((pt, i) => segDist(lx, ly, pt, s.pts[(i + 1) % s.pts.length]) <= slack)
      );
    }
    return false;
  });
}

/** Find topmost bodies under a world point (last-drawn first). */
export function bodiesAtPoint(bodies, wx, wy, poses = null, slack = 5) {
  const hits = [];
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (bodyHitTest(b, wx, wy, poses?.get?.(b.id), slack)) hits.push(b);
  }
  return hits;
}

/** Point-in-axis-aligned-box test. */
export function pointInBox(x, y, box) {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

/** Point-in-polygon test for freehand lasso selection. */
export function pointInLasso(x, y, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  return inPolygon(x, y, poly);
}

/** Find all bodies and joints whose center/anchor lies inside a box { x0, y0, x1, y1 }. */
export function selectInBox(scene, box, poses = null) {
  const norm = {
    x0: Math.min(box.x0, box.x1),
    y0: Math.min(box.y0, box.y1),
    x1: Math.max(box.x0, box.x1),
    y1: Math.max(box.y0, box.y1),
  };
  const bodyIds = [];
  for (const b of scene.bodies || []) {
    const p = poses?.get?.(b.id) || { x: b.x, y: b.y };
    if (pointInBox(p.x, p.y, norm)) bodyIds.push(b.id);
  }
  const jointIds = [];
  for (const j of scene.joints || []) {
    if (j.kind === "spring") {
      if (
        (j.pa && pointInBox(j.pa[0], j.pa[1], norm)) ||
        (j.pb && pointInBox(j.pb[0], j.pb[1], norm))
      ) {
        jointIds.push(j.id);
      }
    } else if (j.anchor && pointInBox(j.anchor[0], j.anchor[1], norm)) {
      jointIds.push(j.id);
    }
  }
  return { bodyIds, jointIds };
}

/** Find all bodies and joints whose center/anchor lies inside a lasso polygon [[x,y], ...]. */
export function selectInLasso(scene, poly, poses = null) {
  if (!Array.isArray(poly) || poly.length < 3) return { bodyIds: [], jointIds: [] };
  const bodyIds = [];
  for (const b of scene.bodies || []) {
    const p = poses?.get?.(b.id) || { x: b.x, y: b.y };
    if (pointInLasso(p.x, p.y, poly)) bodyIds.push(b.id);
  }
  const jointIds = [];
  for (const j of scene.joints || []) {
    if (j.kind === "spring") {
      if (
        (j.pa && pointInLasso(j.pa[0], j.pa[1], poly)) ||
        (j.pb && pointInLasso(j.pb[0], j.pb[1], poly))
      ) {
        jointIds.push(j.id);
      }
    } else if (j.anchor && pointInLasso(j.anchor[0], j.anchor[1], poly)) {
      jointIds.push(j.id);
    }
  }
  return { bodyIds, jointIds };
}

/**
 * Enumerate mechanical snap points in a physics scene + circuit actuators:
 * - Servo horn tips & actuator center shafts
 * - Gear, circle, and box centers
 * - Link bar end bores (the two exact pivot holes at ±length/2)
 * - Existing joint anchors
 */
export function collectSnapPoints(scene, actuators = [], poses = null, { ignoreBodyIds = null, ignoreJointId = null } = {}) {
  const pts = [];
  for (const a of actuators || []) {
    if (a.hornTip) {
      pts.push({
        x: a.hornTip.x,
        y: a.hornTip.y,
        kind: "horn-tip",
        label: `${a.id} tip`,
        actuator: a,
        mount: "horn-tip",
        priority: 0,
      });
    }
    pts.push({
      x: a.x,
      y: a.y,
      kind: "shaft",
      label: `${a.id} shaft`,
      actuator: a,
      mount: "shaft",
      priority: 1,
    });
  }
  for (const b of scene.bodies || []) {
    if (ignoreBodyIds?.has?.(b.id)) continue;
    const pose = poses?.get?.(b.id) || { x: b.x, y: b.y, a: ((b.angle || 0) * Math.PI) / 180 };
    if (b.shape === "link") {
      const half = (Number(b.length) || 80) / 2;
      const [lx0, ly0] = bodyLocalToWorld(pose, -half, 0);
      const [lx1, ly1] = bodyLocalToWorld(pose, half, 0);
      pts.push(
        { x: lx0, y: ly0, kind: "bore", label: "link bore", bodyId: b.id, priority: 2 },
        { x: lx1, y: ly1, kind: "bore", label: "link bore", bodyId: b.id, priority: 2 },
      );
    }
    if (["gear", "circle", "box", "polygon", "link"].includes(b.shape)) {
      pts.push({
        x: pose.x,
        y: pose.y,
        kind: "center",
        label: `${b.shape} center`,
        bodyId: b.id,
        priority: b.shape === "gear" || b.shape === "circle" ? 2 : 3,
      });
    }
  }
  for (const j of scene.joints || []) {
    if (j.id === ignoreJointId) continue;
    if (j.anchor) {
      pts.push({ x: j.anchor[0], y: j.anchor[1], kind: "joint", label: j.kind, jointId: j.id, priority: 4 });
    }
  }
  return pts;
}

/** Find the best snap point within maxDist (world px), preferring higher-priority targets when close. */
export function snapPhysicsPoint(pt, scene, actuators = [], poses = null, opts = {}) {
  const maxDist = opts.maxDist ?? 15;
  const candidates = collectSnapPoints(scene, actuators, poses, opts);
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - pt.x, c.y - pt.y);
    if (d > maxDist) continue;
    // Slight preference for actuator tips/shafts & gear centers/link bores over generic centers.
    const score = d + c.priority * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = { ...c, dist: d };
    }
  }
  return best;
}

/**
 * Convert a Poliplan / Artist Model Studio document's marks into physics bodies.
 * Closed planes/loops → dynamic circle or convex polygon; open strokes → static chain ramp/guide.
 */
export function poliplanDocToPhysicsBodies(doc, existingBodies = []) {
  const elements = Array.isArray(doc?.elements) ? doc.elements : [];
  const created = [];
  const all = [...existingBodies];
  for (const el of elements) {
    if (!Array.isArray(el?.points) || !el.points.length) continue;
    if (["note", "image", "guide"].includes(el.role)) continue;
    const pts = el.points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]);
    const color =
      el.realize?.params?.color ||
      el.realize?.params?.fill ||
      el.color ||
      "#4e8da6";
    const closed = Boolean(el.closed) || el.role === "plane";
    const id = nextPhysicsId("b", all);
    let body;
    if (el.role === "point" || pts.length === 1) {
      const r = Math.max(6, (Number(el.realize?.params?.size) || 16) / 2);
      body = {
        id,
        label: el.label || "Ball",
        type: "dynamic",
        shape: "circle",
        x: pts[0][0],
        y: pts[0][1],
        angle: 0,
        r,
        color,
        ...MATERIAL_DEFAULTS,
      };
    } else if (!closed) {
      const { c } = polygonCentroid(pts);
      body = {
        id,
        label: el.label || "Ramp",
        type: "static",
        shape: "chain",
        x: c[0],
        y: c[1],
        angle: 0,
        pts: thinPolyline(pts, 3).map(([x, y]) => [x - c[0], y - c[1]]),
        thickness: Math.max(4, Number(el.realize?.params?.width) || 6),
        color,
        ...MATERIAL_DEFAULTS,
      };
    } else {
      const round = roundness(pts);
      if (round) {
        body = {
          id,
          label: el.label || "Wheel",
          type: "dynamic",
          shape: "circle",
          x: round.c[0],
          y: round.c[1],
          angle: 0,
          r: Math.max(6, round.r),
          color,
          ...MATERIAL_DEFAULTS,
        };
      } else {
        const hull = convexHull(pts);
        const { c, area } = polygonCentroid(hull);
        if (hull.length < 3 || area < 16) continue;
        body = {
          id,
          label: el.label || "Shape",
          type: "dynamic",
          shape: "polygon",
          x: c[0],
          y: c[1],
          angle: 0,
          pts: hull.map(([x, y]) => [x - c[0], y - c[1]]),
          color,
          ...MATERIAL_DEFAULTS,
        };
      }
    }
    created.push(body);
    all.push(body);
  }
  return created;
}

// ---- Connection-preserving & Direct-Edit (Shift+V) construction helpers -----------------------

/** Return the two world-space bore endpoints `[pA, pB]` of a link bar body. */
export function linkEndpointsWorld(b) {
  const half = (b.length || 80) / 2;
  const rad = ((b.angle || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    [b.x - c * half, b.y - s * half],
    [b.x + c * half, b.y + s * half],
  ];
}

/**
 * BFS from `seedBodyIds` across all joints to find the connected mechanical assembly.
 * Returns `{ bodyIds: Set<string>, jointIds: Set<string> }` so moving any part in
 * connection-preserving mode (`V`) carries the intact mechanism together.
 */
export function connectedAssembly(scene, seedBodyIds) {
  const bodyIds = new Set(seedBodyIds);
  const jointIds = new Set();
  const joints = scene?.joints || [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const j of joints) {
      const touchesA = j.a && bodyIds.has(j.a);
      const touchesB = j.b && bodyIds.has(j.b);
      if (!touchesA && !touchesB) continue;
      if (!jointIds.has(j.id)) {
        jointIds.add(j.id);
        grew = true;
      }
      if (j.a && !bodyIds.has(j.a)) {
        bodyIds.add(j.a);
        grew = true;
      }
      if (j.b && !bodyIds.has(j.b)) {
        bodyIds.add(j.b);
        grew = true;
      }
    }
  }
  return { bodyIds, jointIds };
}

/**
 * Move a joint pivot (`joint.anchor`) to `(nx, ny)` while keeping any connected
 * `link` bars pinned to it: the bore sitting at the old anchor follows `(nx, ny)`
 * and the opposite bore stays fixed in world space, updating `x`, `y`, `angle`, and `length`.
 */
export function movePivotPreservingLinks(scene, joint, nx, ny, snapTol = 14) {
  if (!joint || !Array.isArray(joint.anchor)) return;
  const [ox, oy] = joint.anchor;
  joint.anchor = [nx, ny];
  const dx = nx - ox;
  const dy = ny - oy;
  if (Math.hypot(dx, dy) < 1e-6) return;

  const attachedIds = [joint.a, joint.b].filter(Boolean);
  for (const id of attachedIds) {
    const b = (scene.bodies || []).find((x) => x.id === id);
    if (!b) continue;
    if (b.shape === "link") {
      const [pA, pB] = linkEndpointsWorld(b);
      const dA = Math.hypot(pA[0] - ox, pA[1] - oy);
      const dB = Math.hypot(pB[0] - ox, pB[1] - oy);
      if (dA <= snapTol && dA <= dB) {
        const len = Math.max(12, Math.hypot(pB[0] - nx, pB[1] - ny));
        b.x = (nx + pB[0]) / 2;
        b.y = (ny + pB[1]) / 2;
        b.length = len;
        b.angle = (Math.atan2(pB[1] - ny, pB[0] - nx) * 180) / Math.PI;
      } else if (dB <= snapTol) {
        const len = Math.max(12, Math.hypot(nx - pA[0], ny - pA[1]));
        b.x = (pA[0] + nx) / 2;
        b.y = (pA[1] + ny) / 2;
        b.length = len;
        b.angle = (Math.atan2(ny - pA[1], nx - pA[0]) * 180) / Math.PI;
      }
    }
  }
}

/**
 * Return Direct-Edit (`Shift+V`) handles in world coordinates for a physics body:
 * - link: both end bores (`endA`, `endB`)
 * - gear: pitch-circle rim handle (`gearRadius`) to resize teeth cleanly
 * - circle: rim handle (`circleRadius`)
 * - box: 4 corner handles (`boxCorner`)
 * - chain / polygon: vertex handles (`vertex`)
 */
export function directHandlesForBody(b) {
  if (!b) return [];
  const rad = ((b.angle || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const toW = (lx, ly) => [b.x + lx * c - ly * s, b.y + lx * s + ly * c];

  if (b.shape === "link") {
    const [pA, pB] = linkEndpointsWorld(b);
    return [
      { kind: "linkEnd", end: "a", bodyId: b.id, x: pA[0], y: pA[1], label: "End A" },
      { kind: "linkEnd", end: "b", bodyId: b.id, x: pB[0], y: pB[1], label: "End B" },
    ];
  }
  if (b.shape === "gear") {
    const geo = gearGeometry(b.teeth, b.module);
    const [hx, hy] = toW(geo.pitchR, 0);
    return [
      { kind: "gearRadius", bodyId: b.id, x: hx, y: hy, label: `${geo.teeth}T` },
    ];
  }
  if (b.shape === "circle") {
    const r = b.r || 18;
    const [hx, hy] = toW(r, 0);
    return [
      { kind: "circleRadius", bodyId: b.id, x: hx, y: hy, label: `r=${Math.round(r)}` },
    ];
  }
  if (b.shape === "box") {
    const hx = (b.w || 40) / 2;
    const hy = (b.h || 24) / 2;
    return [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ].map(([lx, ly], i) => {
      const [x, y] = toW(lx, ly);
      return { kind: "boxCorner", index: i, bodyId: b.id, x, y };
    });
  }
  if ((b.shape === "chain" || b.shape === "polygon") && Array.isArray(b.pts)) {
    return b.pts.map(([lx, ly], i) => {
      const [x, y] = toW(lx, ly);
      return { kind: "vertex", index: i, bodyId: b.id, x, y };
    });
  }
  return [];
}

/**
 * Apply a Direct-Edit (`Shift+V`) handle drag to `body` at world point `(wx, wy)`.
 * For `linkEnd`, optionally carries any hinge/joint anchored on that bore (`carryJoints`).
 */
export function applyDirectHandleDrag(scene, body, handle, wx, wy, { carryJoints = true } = {}) {
  if (!body || !handle) return;
  if (handle.kind === "linkEnd" && body.shape === "link") {
    const [pA, pB] = linkEndpointsWorld(body);
    const oldEnd = handle.end === "a" ? pA : pB;
    const fixed = handle.end === "a" ? pB : pA;
    const len = Math.max(12, Math.hypot(wx - fixed[0], wy - fixed[1]));
    const nx = handle.end === "a" ? wx : fixed[0];
    const ny = handle.end === "a" ? wy : fixed[1];
    const fx = handle.end === "a" ? fixed[0] : wx;
    const fy = handle.end === "a" ? fixed[1] : wy;
    body.x = (nx + fx) / 2;
    body.y = (ny + fy) / 2;
    body.length = len;
    body.angle = (Math.atan2(fy - ny, fx - nx) * 180) / Math.PI;
    if (carryJoints && scene?.joints) {
      for (const j of scene.joints) {
        if (j.actuatorId || !Array.isArray(j.anchor)) continue;
        if ((j.a === body.id || j.b === body.id) && Math.hypot(j.anchor[0] - oldEnd[0], j.anchor[1] - oldEnd[1]) <= 12) {
          movePivotPreservingLinks(scene, j, wx, wy);
        }
      }
    }
    return;
  }
  if (handle.kind === "gearRadius" && body.shape === "gear") {
    const r = Math.max(14, Math.hypot(wx - body.x, wy - body.y));
    const mod = body.module || 6;
    body.teeth = Math.max(6, Math.min(64, Math.round((2 * r) / mod)));
    return;
  }
  if (handle.kind === "circleRadius" && body.shape === "circle") {
    body.r = Math.max(6, Math.round(Math.hypot(wx - body.x, wy - body.y)));
    return;
  }
  if (handle.kind === "boxCorner" && body.shape === "box") {
    const rad = (-(body.angle || 0) * Math.PI) / 180;
    const dx = wx - body.x;
    const dy = wy - body.y;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    body.w = Math.max(12, Math.round(Math.abs(lx) * 2));
    body.h = Math.max(12, Math.round(Math.abs(ly) * 2));
    return;
  }
  if (handle.kind === "vertex" && Array.isArray(body.pts) && body.pts[handle.index]) {
    const rad = (-(body.angle || 0) * Math.PI) / 180;
    const dx = wx - body.x;
    const dy = wy - body.y;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    body.pts[handle.index] = [lx, ly];
  }
}

/**
 * Compute world-space bounding box `{ minX, minY, maxX, maxY, cx, cy, w, h }`
 * for a set of selected physics bodies (and optional joints) to render a
 * Poliplan-style transform box (scale + rotate).
 */
export function selectionBounds(scene, bodyIds, jointIds = []) {
  const bSet = new Set(bodyIds || []);
  const jSet = new Set(jointIds || []);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const expand = (x, y, pad = 0) => {
    if (x - pad < minX) minX = x - pad;
    if (y - pad < minY) minY = y - pad;
    if (x + pad > maxX) maxX = x + pad;
    if (y + pad > maxY) maxY = y + pad;
  };

  for (const b of scene?.bodies || []) {
    if (!bSet.has(b.id)) continue;
    const rad = ((b.angle || 0) * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const rot = (lx, ly) => [b.x + lx * c - ly * s, b.y + lx * s + ly * c];
    if (b.shape === "circle") {
      expand(b.x, b.y, b.r || 18);
    } else if (b.shape === "gear") {
      const geo = gearGeometry(b.teeth, b.module);
      expand(b.x, b.y, geo.outerR);
    } else if (b.shape === "box") {
      const hx = (b.w || 40) / 2;
      const hy = (b.h || 24) / 2;
      for (const [lx, ly] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) {
        const [wx, wy] = rot(lx, ly);
        expand(wx, wy);
      }
    } else if (b.shape === "link") {
      const [pA, pB] = linkEndpointsWorld(b);
      const r = (b.width || 14) / 2;
      expand(pA[0], pA[1], r);
      expand(pB[0], pB[1], r);
    } else if ((b.shape === "chain" || b.shape === "polygon") && Array.isArray(b.pts)) {
      const pad = b.shape === "chain" ? (b.thickness || 8) / 2 : 0;
      for (const [lx, ly] of b.pts) {
        const [wx, wy] = rot(lx, ly);
        expand(wx, wy, pad);
      }
    } else {
      expand(b.x, b.y, 12);
    }
  }
  for (const j of scene?.joints || []) {
    if (!jSet.has(j.id)) continue;
    if (j.anchor) expand(j.anchor[0], j.anchor[1], 6);
    if (j.pa) expand(j.pa[0], j.pa[1], 6);
    if (j.pb) expand(j.pb[0], j.pb[1], 6);
  }
  if (!Number.isFinite(minX)) return null;
  const w = Math.max(16, maxX - minX);
  const h = Math.max(16, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w,
    h,
  };
}

/**
 * Uniformly scale a set of bodies and their associated joints around `(cx, cy)`
 * from their snapshot originals (`origBodies`, `origJoints`).
 */
export function applyTransformScale(origBodies, origJoints, bodies, joints, cx, cy, scale) {
  const s = Math.max(0.15, Math.min(8, scale));
  for (let i = 0; i < bodies.length; i++) {
    const o = origBodies[i];
    const b = bodies[i];
    b.x = cx + (o.x - cx) * s;
    b.y = cy + (o.y - cy) * s;
    if (b.shape === "circle") {
      b.r = Math.max(6, o.r * s);
    } else if (b.shape === "box") {
      b.w = Math.max(12, o.w * s);
      b.h = Math.max(12, o.h * s);
    } else if (b.shape === "link") {
      b.length = Math.max(12, o.length * s);
    } else if (b.shape === "gear") {
      b.teeth = Math.max(6, Math.min(64, Math.round((o.teeth || 12) * s)));
    } else if ((b.shape === "chain" || b.shape === "polygon") && Array.isArray(o.pts)) {
      b.pts = o.pts.map(([px, py]) => [px * s, py * s]);
    }
  }
  for (let i = 0; i < joints.length; i++) {
    const o = origJoints[i];
    const j = joints[i];
    if (o.anchor) j.anchor = [cx + (o.anchor[0] - cx) * s, cy + (o.anchor[1] - cy) * s];
    if (o.pa) j.pa = [cx + (o.pa[0] - cx) * s, cy + (o.pa[1] - cy) * s];
    if (o.pb) j.pb = [cx + (o.pb[0] - cx) * s, cy + (o.pb[1] - cy) * s];
    if (Array.isArray(o.pts)) {
      j.pts = o.pts.map(([px, py]) => [cx + (px - cx) * s, cy + (py - cy) * s]);
    }
  }
}

/**
 * Rotate a set of bodies and their associated joints around `(cx, cy)` by `deltaRad`
 * from their snapshot originals (`origBodies`, `origJoints`).
 */
export function applyTransformRotate(origBodies, origJoints, bodies, joints, cx, cy, deltaRad) {
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  const degDelta = (deltaRad * 180) / Math.PI;
  const rotPt = ([x, y]) => [
    cx + (x - cx) * c - (y - cy) * s,
    cy + (x - cx) * s + (y - cy) * c,
  ];
  for (let i = 0; i < bodies.length; i++) {
    const o = origBodies[i];
    const b = bodies[i];
    const [nx, ny] = rotPt([o.x, o.y]);
    b.x = nx;
    b.y = ny;
    b.angle = (o.angle || 0) + degDelta;
  }
  for (let i = 0; i < joints.length; i++) {
    const o = origJoints[i];
    const j = joints[i];
    if (o.anchor) j.anchor = rotPt(o.anchor);
    if (o.pa) j.pa = rotPt(o.pa);
    if (o.pb) j.pb = rotPt(o.pb);
    if (o.axis) {
      const [ax, ay] = o.axis;
      j.axis = [ax * c - ay * s, ax * s + ay * c];
    }
    if (Array.isArray(o.pts)) {
      j.pts = o.pts.map(rotPt);
    }
  }
}

/** Validate a physics scene object for project persistence. */
export function validatePhysicsScene(scene) {
  if (scene == null) return null;
  if (typeof scene !== "object" || Array.isArray(scene)) {
    throw new Error("Physics scene must be an object.");
  }
  if (scene.bodies != null && !Array.isArray(scene.bodies)) {
    throw new Error("Physics bodies must be an array.");
  }
  if (scene.joints != null && !Array.isArray(scene.joints)) {
    throw new Error("Physics joints must be an array.");
  }
  for (const b of scene.bodies || []) {
    if (!b || typeof b !== "object" || typeof b.id !== "string" || !b.id) {
      throw new Error("Every physics body needs a string id.");
    }
    if (!BODY_TYPES.includes(b.type || "dynamic")) {
      throw new Error(`Invalid physics body type: ${b.type}`);
    }
    if (!BODY_SHAPES.includes(b.shape)) {
      throw new Error(`Invalid physics body shape: ${b.shape}`);
    }
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      throw new Error(`Physics body ${b.id} needs finite x and y.`);
    }
  }
  for (const j of scene.joints || []) {
    if (!j || typeof j !== "object" || typeof j.id !== "string" || !j.id) {
      throw new Error("Every physics joint needs a string id.");
    }
    if (!JOINT_KINDS.includes(j.kind)) {
      throw new Error(`Invalid physics joint kind: ${j.kind}`);
    }
  }
  return scene;
}

/** Return a clean, normalized deep copy of a physics scene. */
export function normalizePhysicsScene(scene) {
  if (!scene) return createEmptyPhysicsScene();
  validatePhysicsScene(scene);
  return {
    version: 1,
    world: {
      ...WORLD_DEFAULTS,
      ...(scene.world || {}),
      gravity:
        Array.isArray(scene.world?.gravity) && scene.world.gravity.length === 2
          ? [Number(scene.world.gravity[0]) || 0, Number(scene.world.gravity[1]) || 0]
          : [...WORLD_DEFAULTS.gravity],
    },
    bodies: (scene.bodies || []).map((b) => ({
      ...MATERIAL_DEFAULTS,
      angle: 0,
      color: "#4e8da6",
      ...b,
      type: b.type || "dynamic",
    })),
    joints: (scene.joints || []).map((j) => ({ ...j })),
  };
}
