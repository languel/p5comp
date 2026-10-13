import { freePoint } from "./partGeometry.js";
// Geometry is independent of electrical nets. Waypoints are world coordinates.
export const same = (a, b) =>
  Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
export const copy = (p) => ({ x: p.x, y: p.y });
export function simplify(points) {
  const out = [];
  for (const p of points) {
    if (out.length && same(out.at(-1), p)) continue;
    while (out.length > 1) {
      const a = out.at(-2),
        b = out.at(-1);
      if (
        Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) >
          0.001 ||
        (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < 0
      )
        break;
      out.pop();
    }
    out.push(copy(p));
  }
  return out;
}
export function waypoints(connection) {
  return Array.isArray(connection[3])
    ? connection[3]
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map(copy)
    : [];
}
export function wirePoints(connection, pins) {
  const a = pins.get(connection[0]) || freePoint(connection[0]),
    b = pins.get(connection[1]) || freePoint(connection[1]);
  return a && b ? [copy(a), ...waypoints(connection), copy(b)] : [];
}
export function projectPoint(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function snapPoint(
  p,
  {
    zoom = 1,
    enabled = true,
    grid = 10,
    gridOrigin = { x: 0, y: 0 },
    alt = false,
    shift = false,
    origin = null,
    align = [],
  } = {},
) {
  const q = copy(p),
    guides = [];
  if (alt) return { point: q, guides };
  if (enabled)
    for (const axis of ["x", "y"]) {
      const candidates = [
        ...(grid > 0
          ? [
              Math.round((p[axis] - gridOrigin[axis]) / grid) * grid +
                gridOrigin[axis],
            ]
          : []),
        ...align.map((a) => a[axis]),
      ];
      if (!candidates.length) continue;
      const target = candidates.reduce(
        (best, n) =>
          Math.abs(n - p[axis]) < Math.abs(best - p[axis]) ? n : best,
        candidates[0],
      );
      if (Math.abs(target - p[axis]) * zoom <= 7) {
        q[axis] = target;
        guides.push({ axis, value: target });
      }
    }
  if (shift && origin) {
    if (Math.abs(q.x - origin.x) >= Math.abs(q.y - origin.y)) q.y = origin.y;
    else q.x = origin.x;
  }
  return { point: q, guides };
}
export function moveBend(points, index, p, orthogonal = true) {
  const out = points.map(copy),
    old = out[index];
  if (index <= 0 || index >= out.length - 1) return out;
  out[index] = copy(p);
  if (!orthogonal) return out;
  const before = points[index - 1],
    after = points[index + 1];
  const adjust = (neighbor, oldNeighbor, isBefore) => {
    const vertical = Math.abs(old.x - oldNeighbor.x) < 0.001,
      horizontal = Math.abs(old.y - oldNeighbor.y) < 0.001;
    if (!vertical && !horizontal) return null;
    if (neighbor === 0 || neighbor === out.length - 1) {
      return vertical && Math.abs(p.x - oldNeighbor.x) > 0.001
        ? { x: oldNeighbor.x, y: p.y }
        : horizontal && Math.abs(p.y - oldNeighbor.y) > 0.001
          ? { x: p.x, y: oldNeighbor.y }
          : null;
    }
    if (vertical) out[neighbor].x = p.x;
    else out[neighbor].y = p.y;
    return null;
  };
  const pre = adjust(index - 1, before, true),
    post = adjust(index + 1, after, false);
  if (post) out.splice(index + 1, 0, post);
  if (pre) out.splice(index, 0, pre);
  return out; // Preserve authored points, even collinear ones, during editing.
}
export function moveSegment(points, index, delta) {
  const out = points.map(copy),
    a = out[index],
    b = out[index + 1];
  if (!a || !b) return out;
  const horizontal = Math.abs(a.y - b.y) < 0.001,
    vertical = Math.abs(a.x - b.x) < 0.001;
  const d = horizontal
    ? { x: 0, y: delta.y }
    : vertical
      ? { x: delta.x, y: 0 }
      : delta;
  const aa = { x: a.x + d.x, y: a.y + d.y },
    bb = { x: b.x + d.x, y: b.y + d.y };
  if (index + 1 === out.length - 1) out.splice(index + 1, 0, bb);
  else out[index + 1] = bb;
  if (index === 0) out.splice(1, 0, aa);
  else out[index] = aa;
  return out;
}
export function crossingCost(a, b, c, d, allowCrossings = false) {
  const cross = (u, v) => u.x * v.y - u.y * v.x,
    ab = { x: b.x - a.x, y: b.y - a.y },
    cd = { x: d.x - c.x, y: d.y - c.y },
    ac = { x: c.x - a.x, y: c.y - a.y },
    den = cross(ab, cd);
  if (Math.abs(den) < 0.001) {
    const separation = Math.abs(cross(ac, ab)) / (Math.hypot(ab.x, ab.y) || 1);
    if (separation >= 3) return 0;
    const axis = Math.abs(ab.x) >= Math.abs(ab.y) ? "x" : "y",
      overlap =
        Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
        Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
    return overlap > 0
      ? separation < 0.001
        ? 600 + overlap * 20
        : overlap * (3 - separation) * 4
      : 0;
  }
  const t = cross(ac, cd) / den,
    u = cross(ac, ab) / den;
  return !allowCrossings && t >= 0 && t <= 1 && u > 0.001 && u < 0.999
    ? 500
    : 0;
}
const inside = (p, r) =>
  p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
export function blockedSegment(a, b, r) {
  return Math.abs(a.y - b.y) < 0.001
    ? a.y > r.y &&
        a.y < r.y + r.h &&
        Math.max(a.x, b.x) > r.x &&
        Math.min(a.x, b.x) < r.x + r.w
    : Math.abs(a.x - b.x) < 0.001
      ? a.x > r.x &&
        a.x < r.x + r.w &&
        Math.max(a.y, b.y) > r.y &&
        Math.min(a.y, b.y) < r.y + r.h
      : false;
}
class Heap {
  data = [];
  push(n) {
    const a = this.data;
    a.push(n);
    let i = a.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (a[p].f <= n.f) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = n;
  }
  pop() {
    const a = this.data,
      first = a[0],
      last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && a[c + 1].f < a[c].f) c++;
        if (a[c].f >= last.f) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return first;
  }
}
function dock(pin, rectangles) {
  const r = rectangles.find((r) => r.id === pin.part);
  if (!r) return copy(pin);
  const pad = 12;
  switch (pin.direction) {
    case "up":
      return { x: pin.x, y: r.y - pad };
    case "down":
      return { x: pin.x, y: r.y + r.h + pad };
    case "left":
      return { x: r.x - pad, y: pin.y };
    case "right":
      return { x: r.x + r.w + pad, y: pin.y };
    default:
      return copy(pin);
  }
}
export function autoroute(
  from,
  to,
  rectangles = [],
  otherWires = [],
  boards = [],
  { mode = "careful" } = {},
) {
  const start = dock(from, rectangles),
    goal = dock(to, rectangles),
    pad = 12;
  const region = {
    x: Math.min(start.x, goal.x) - 320,
    y: Math.min(start.y, goal.y) - 320,
    w: Math.abs(start.x - goal.x) + 640,
    h: Math.abs(start.y - goal.y) + 640,
  };
  const obstacles = rectangles
    .filter(
      (r) =>
        r.x + r.w >= region.x &&
        r.x <= region.x + region.w &&
        r.y + r.h >= region.y &&
        r.y <= region.y + region.h,
    )
    .map((r) => ({
      x: r.x - pad,
      y: r.y - pad,
      w: r.w + 2 * pad,
      h: r.h + 2 * pad,
    }));
  const nearbyBoards = boards.filter(
    (board) =>
      board.bounds.x + board.bounds.w >= region.x &&
      board.bounds.x <= region.x + region.w &&
      board.bounds.y + board.bounds.h >= region.y &&
      board.bounds.y <= region.y + region.h,
  );
  // Preserve access to the endpoint holes, but keep all other holes clear.
  const holeObstacles = nearbyBoards.flatMap((board) =>
    board.holes
      .filter((p) => !same(p, from) && !same(p, to))
      .map((p) => ({ x: p.x - 2.3, y: p.y - 2.3, w: 4.6, h: 4.6 })),
  );
  const segments = otherWires.flatMap((w) =>
    w.slice(1).map((p, i) => [w[i], p]),
  );
  const xs = new Set([
      start.x,
      goal.x,
      start.x - 20,
      start.x + 20,
      goal.x - 20,
      goal.x + 20,
    ]),
    ys = new Set([
      start.y,
      goal.y,
      start.y - 20,
      start.y + 20,
      goal.y - 20,
      goal.y + 20,
    ]);
  for (const board of nearbyBoards) {
    for (const x of board.lanesX)
      if (x >= region.x && x <= region.x + region.w) xs.add(x);
    for (const y of board.lanesY)
      if (y >= region.y && y <= region.y + region.h) ys.add(y);
  }
  for (const r of obstacles) {
    xs.add(r.x);
    xs.add(r.x + r.w);
    ys.add(r.y);
    ys.add(r.y + r.h);
  }
  // Nearby parallel lanes make it possible to avoid existing wires without huge grids.
  const nearby = otherWires
    .flat()
    .filter(
      (p) =>
        p.x >= region.x &&
        p.x <= region.x + region.w &&
        p.y >= region.y &&
        p.y <= region.y + region.h,
    )
    .slice(0, 70);
  for (const p of nearby) {
    if (xs.size < 95) {
      xs.add(p.x - 8);
      xs.add(p.x + 8);
    }
    if (ys.size < 95) {
      ys.add(p.y - 8);
      ys.add(p.y + 8);
    }
  }
  const xx = [...xs].sort((a, b) => a - b),
    yy = [...ys].sort((a, b) => a - b),
    nx = xx.length,
    ny = yy.length,
    total = nx * ny * 3;
  const point = (id) => {
    const v = Math.floor(id / 3);
    return { x: xx[v % nx], y: yy[Math.floor(v / nx)] };
  };
  const idOf = (x, y, dir) => (y * nx + x) * 3 + dir;
  const dist = new Float64Array(total).fill(Infinity),
    prev = new Int32Array(total).fill(-1),
    heap = new Heap();
  const startId = idOf(xx.indexOf(start.x), yy.indexOf(start.y), 2);
  dist[startId] = 0;
  heap.push({
    id: startId,
    g: 0,
    f: Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y),
  });
  let end = -1,
    iterations = 0;
  while (heap.data.length && iterations++ < 35000) {
    const n = heap.pop();
    if (n.g !== dist[n.id]) continue;
    const p = point(n.id);
    if (same(p, goal)) {
      end = n.id;
      break;
    }
    const v = Math.floor(n.id / 3),
      x = v % nx,
      y = Math.floor(v / nx),
      dir = n.id % 3;
    for (const [dx, dy, nextDir] of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 1],
      [0, 1, 1],
    ]) {
      const tx = x + dx,
        ty = y + dy;
      if (tx < 0 || tx >= nx || ty < 0 || ty >= ny) continue;
      const q = { x: xx[tx], y: yy[ty] };
      if (
        obstacles.some((r) => inside(q, r) || blockedSegment(p, q, r)) ||
        holeObstacles.some((r) => inside(q, r) || blockedSegment(p, q, r))
      )
        continue;
      let cost =
        Math.abs(q.x - p.x) +
        Math.abs(q.y - p.y) +
        (dir !== 2 && dir !== nextDir ? 14 : 0);
      for (const [a, b] of segments)
        cost += crossingCost(p, q, a, b, mode === "simple");
      const length = Math.abs(q.x - p.x) + Math.abs(q.y - p.y),
        mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      for (const board of nearbyBoards)
        if (inside(mid, board.bounds)) {
          const lanes = nextDir === 0 ? board.lanesY : board.lanesX,
            coordinate = nextDir === 0 ? p.y : p.x;
          // Mid-row/column lanes are preferred. Small endpoint stubs remain legal.
          if (
            lanes.length &&
            !lanes.some((v) => Math.abs(v - coordinate) < 0.01)
          )
            cost += length * 5;
        }
      const id = idOf(tx, ty, nextDir),
        g = n.g + cost;
      if (g >= dist[id]) continue;
      dist[id] = g;
      prev[id] = n.id;
      heap.push({
        id,
        g,
        f: g + Math.abs(q.x - goal.x) + Math.abs(q.y - goal.y),
      });
    }
  }
  if (end < 0)
    return simplify([from, start, { x: goal.x, y: start.y }, goal, to]);
  const path = [];
  for (let id = end; id >= 0; id = prev[id]) path.push(point(id));
  path.reverse();
  return simplify([from, ...path, to]);
}
