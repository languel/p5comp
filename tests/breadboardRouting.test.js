import test from "node:test";
import assert from "node:assert/strict";
import {
  autoroute,
  blockedSegment,
  crossingCost,
  snapPoint,
} from "../sim/wireGeometry.js";
test("breadboard routes use gaps between holes, with short stubs into endpoint holes", () => {
  const holes = [0, 10, 20, 30].flatMap((x) =>
      [0, 10, 20, 30, 40].map((y) => ({ x, y })),
    ),
    from = { x: 10, y: 30 },
    to = { x: 30, y: 0 };
  const board = {
    holes,
    bounds: { x: -5, y: -5, w: 40, h: 50 },
    lanesX: [5, 15, 25],
    lanesY: [5, 15, 25, 35],
  };
  const route = autoroute(from, to, [], [], [board]);
  assert.deepEqual(route[0], from);
  assert.deepEqual(route.at(-1), to);
  assert.ok(route.length >= 5);
  for (const hole of holes.filter(
    (p) =>
      !(p.x === from.x && p.y === from.y) && !(p.x === to.x && p.y === to.y),
  )) {
    const r = { x: hole.x - 2.3, y: hole.y - 2.3, w: 4.6, h: 4.6 };
    route
      .slice(1)
      .forEach((p, i) => assert.equal(blockedSegment(route[i], p, r), false));
  }
  route.slice(2, -1).forEach((p, j) => {
    const a = route[j + 1];
    assert.ok(
      a.x === p.x ? board.lanesX.includes(a.x) : board.lanesY.includes(a.y),
    );
  });
});
test("routing prefers a separate parallel lane rather than overlapping an existing wire", () => {
  const from = { x: 0, y: 0 },
    to = { x: 100, y: 0 },
    old = [from, to],
    route = autoroute(from, to, [], [old]);
  assert.ok(route.some((p) => p.y !== 0));
  route
    .slice(1)
    .forEach((p, i) => assert.equal(crossingCost(route[i], p, ...old), 0));
  assert.ok(
    crossingCost(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ) > 1000,
  );
});
test("None grid leaves positions free while retaining optional terminal-axis alignment", () => {
  const p = { x: 12.3, y: 17.9 };
  assert.deepEqual(snapPoint(p, { grid: 0 }).point, p);
  assert.deepEqual(snapPoint(p, { grid: 0, align: [{ x: 14, y: 18 }] }).point, {
    x: 14,
    y: 18,
  });
});
test("simple routing permits crossings while careful routing detours", () => {
  const from = { x: 0, y: 0 },
    to = { x: 100, y: 0 };
  const crossing = [
    { x: 50, y: -100 },
    { x: 50, y: 100 },
  ];
  assert.deepEqual(
    autoroute(from, to, [], [crossing], [], { mode: "simple" }),
    [from, to],
  );
  assert.ok(autoroute(from, to, [], [crossing]).some((p) => p.y !== 0));
});
test("simple routing still separates overlapping parallel wires", () => {
  const from = { x: 0, y: 0 },
    to = { x: 100, y: 0 },
    old = [from, to];
  const route = autoroute(from, to, [], [old], [], { mode: "simple" });
  assert.ok(route.some((p) => p.y !== 0));
  route
    .slice(1)
    .forEach((p, i) =>
      assert.equal(crossingCost(route[i], p, ...old, true), 0),
    );
});
