import test from "node:test";
import assert from "node:assert/strict";
import {
  autoroute,
  blockedSegment,
  crossingCost,
  moveBend,
  moveSegment,
  snapPoint,
  simplify,
  wirePoints,
} from "../sim/wireGeometry.js";
import {
  classroomCircuit,
  resolveCircuit,
  validateDiagram,
} from "../sim/circuit.js";
const orthogonal = (points) =>
  points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);
test("screen-distance snapping respects zoom, neighbor axes, Alt, and Shift", () => {
  assert.deepEqual(snapPoint({ x: 23, y: 37 }).point, { x: 20, y: 40 });
  assert.deepEqual(snapPoint({ x: 23, y: 37 }, { zoom: 4 }).point, {
    x: 23,
    y: 37,
  });
  assert.deepEqual(
    snapPoint({ x: 27, y: 31 }, { align: [{ x: 26, y: 55 }] }).point,
    { x: 26, y: 30 },
  );
  assert.deepEqual(snapPoint({ x: 23, y: 37 }, { alt: true }).point, {
    x: 23,
    y: 37,
  });
  assert.deepEqual(
    snapPoint(
      { x: 63, y: 37 },
      { enabled: false, shift: true, origin: { x: 13, y: 11 } },
    ).point,
    { x: 63, y: 11 },
  );
});
test("moving bends and end segments preserves terminal positions and orthogonal routing", () => {
  const original = [
    { x: 0, y: 0 },
    { x: 0, y: 60 },
    { x: 100, y: 60 },
    { x: 100, y: 0 },
  ];
  const moved = moveBend(original, 1, { x: 20, y: 80 });
  assert.deepEqual(moved[0], original[0]);
  assert.deepEqual(moved.at(-1), original.at(-1));
  assert.equal(orthogonal(moved), true);
  assert.deepEqual(moveBend(original, 1, { x: 20, y: 80 }, false)[1], {
    x: 20,
    y: 80,
  });
  const segment = moveSegment(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    0,
    { x: 30, y: 40 },
  );
  assert.equal(orthogonal(segment), true);
  assert.deepEqual(segment[0], { x: 0, y: 0 });
  assert.deepEqual(segment.at(-1), { x: 100, y: 0 });
});
test("autorouting avoids inflated component bodies and prefers paths without crossings", () => {
  const box = { id: "component", x: 80, y: -20, w: 40, h: 40 },
    route = autoroute({ x: 0, y: 0 }, { x: 200, y: 0 }, [box]);
  assert.equal(orthogonal(route), true);
  assert.ok(route.slice(1).every((p, i) => !blockedSegment(route[i], p, box)));
  const existing = [
      { x: 100, y: -50 },
      { x: 100, y: 50 },
    ],
    clean = autoroute({ x: 0, y: 0 }, { x: 200, y: 0 }, [], [existing]);
  assert.ok(clean.length > 2);
  assert.equal(
    clean
      .slice(1)
      .reduce((n, p, i) => n + crossingCost(clean[i], p, ...existing), 0),
    0,
  );
  assert.deepEqual(clean[0], { x: 0, y: 0 });
  assert.deepEqual(clean.at(-1), { x: 200, y: 0 });
});
test("docking exits a terminal through its component boundary", () => {
  const route = autoroute(
    { x: 50, y: 2, part: "board", direction: "up" },
    { x: 200, y: 100 },
    [{ id: "board", x: 0, y: 0, w: 100, h: 100 }],
  );
  assert.equal(route[1].x, 50);
  assert.ok(route[1].y < 0);
  assert.equal(orthogonal(route), true);
});
test("world coordinates, authored bends and tint/color metadata do not affect electrical nets", () => {
  const d = classroomCircuit(),
    before = resolveCircuit(d);
  d.parts[0].left = -50000;
  d.parts[0].top = 70000;
  d.parts[0].attrs.tint = "#658eac";
  d.connections[0][2] = "#cf6868";
  d.connections[0][3] = [
    { x: -10000, y: 20000 },
    { x: -10000, y: -5000 },
  ];
  validateDiagram(d);
  assert.deepEqual(resolveCircuit(d), before);
  const pins = new Map([
    ["a", { x: 1, y: 2 }],
    ["b", { x: 9, y: 8 }],
  ]);
  assert.deepEqual(wirePoints(["a", "b", "#658eac", [{ x: 4, y: 6 }]], pins), [
    { x: 1, y: 2 },
    { x: 4, y: 6 },
    { x: 9, y: 8 },
  ]);
  assert.deepEqual(
    simplify([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 0, y: 20 },
    ]),
    [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
    ],
  );
});
