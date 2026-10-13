import test from "node:test";
import assert from "node:assert/strict";
import {
  partPoint,
  partBounds,
  lineInBox,
  intersects,
  freePoint,
  freeEnd,
} from "../sim/partGeometry.js";
import {
  classroomCircuit,
  resolveCircuit,
  validateDiagram,
} from "../sim/circuit.js";
import { wirePoints, snapPoint } from "../sim/wireGeometry.js";
import { UnoRuntime } from "../sim/runtime.js";
import { readFileSync } from "node:fs";
test("rotation and flips transform terminal coordinates about the body center without changing electrical nets", () => {
  const p = { id: "p", left: 10, top: 20, rotate: 90 },
    size = { w: 100, h: 40 };
  const q = partPoint(p, { x: 0, y: 0 }, size);
  assert.ok(Math.abs(q.x - 80) < 1e-8 && Math.abs(q.y + 10) < 1e-8);
  p.flipX = true;
  assert.ok(Math.abs(partPoint(p, { x: 0, y: 0 }, size).y - 90) < 1e-8);
  const b = partBounds(p, size);
  assert.ok(Math.abs(b.w - 40) < 1e-8 && Math.abs(b.h - 100) < 1e-8);
  const d = classroomCircuit(),
    before = resolveCircuit(d);
  d.parts.forEach((p) => {
    p.rotate = 45;
    p.flipX = true;
    p.flipY = true;
  });
  assert.deepEqual(resolveCircuit(d), before);
  d.parts[0].rotate = 12;
  assert.throws(() => validateDiagram(d), /45/);
});
test("box selection detects crossing segments and excludes diagonals whose bounding box alone intersects", () => {
  const b = { x: 4, y: 4, w: 2, h: 2 };
  assert.equal(
    lineInBox(
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
      b,
    ),
    true,
  );
  assert.equal(
    lineInBox(
      [
        { x: 0, y: 0 },
        { x: 10, y: 3 },
        { x: 10, y: 10 },
      ],
      b,
    ),
    false,
  );
  assert.equal(
    lineInBox(
      [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ],
      b,
    ),
    true,
  );
  assert.equal(intersects({ x: 6, y: 6, w: 1, h: 1 }, b), true);
});
test("detached endpoints persist and render, and actual Arduino stops receiving sonar echoes until reattached", () => {
  const d = classroomCircuit(),
    wire = d.connections.find((c) => c[0] === "uno:8");
  wire[1] = freeEnd({ x: -42.5, y: 99 });
  validateDiagram(d);
  assert.deepEqual(freePoint(wire[1]), { x: -42.5, y: 99 });
  assert.equal(freePoint("free:Infinity,0"), null);
  const points = wirePoints(wire, new Map([["uno:8", { x: 1, y: 2 }]]));
  assert.deepEqual(points.at(-1), { x: -42.5, y: 99 });
  const hex = readFileSync(
    new URL("../public/sim/classroom.hex", import.meta.url),
    "utf8",
  );
  let output = "";
  const r = new UnoRuntime(
    hex,
    resolveCircuit(d),
    { pot: 512, sonar: 100 },
    (b) => (output += String.fromCharCode(b)),
  );
  r.advance(4000000);
  assert.match(output, /-1\.0,512/);
  wire[1] = "sonar:ECHO";
  output = "";
  const connected = new UnoRuntime(
    hex,
    resolveCircuit(d),
    { pot: 512, sonar: 100 },
    (b) => (output += String.fromCharCode(b)),
  );
  connected.advance(4000000);
  assert.match(output, /99\.\d,512/);
});
test("half, single and double pin grids snap about a terminal anchor independent of zoom", () => {
  for (const scale of [0.5, 1, 2]) {
    const grid = 9.5 * scale,
      gridOrigin = { x: 160, y: 229 };
    const p = snapPoint(
      { x: 160 + grid + 0.2, y: 229 - grid + 0.2 },
      { grid, gridOrigin, zoom: 2 },
    ).point;
    assert.deepEqual(p, { x: 160 + grid, y: 229 - grid });
  }
});

test("rotation handles snap angle changes to 45 degrees and wrap at the seam", async () => {
  const { rotationFromDrag } = await import("../sim/partGeometry.js");
  assert.equal(rotationFromDrag(0, 0, Math.PI / 3), 45);
  assert.equal(rotationFromDrag(315, 0, Math.PI / 4), 0);
  assert.equal(rotationFromDrag(0, Math.PI * 0.95, -Math.PI * 0.95), 0);
  assert.equal(rotationFromDrag(0, 0, -Math.PI / 2), 270);
});
