import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCircuit } from "../sim/circuit.js";
import { UnoRuntime } from "../sim/runtime.js";
function example(name) {
  const project = JSON.parse(
    readFileSync(
      new URL("../public/examples/" + name + ".json", import.meta.url),
    ),
  );
  const bytes = [];
  const runtime = new UnoRuntime(
    project.artifact.hex,
    resolveCircuit(project.diagram),
    project.controls,
    (b) => bytes.push(b),
  );
  return {
    runtime,
    project,
    lines: () =>
      new TextDecoder()
        .decode(Uint8Array.from(bytes))
        .trim()
        .split("\n")
        .map((s) => s.trim()),
  };
}
test("One LED firmware blinks the external LED and reports matching serial state", () => {
  const { runtime: r, project: p, lines } = example("one-led");
  assert.deepEqual(p.diagram.connections, []);
  assert.equal(p.diagram.attachments.length, 2);
  assert.equal(p.artifact.buildKey, p.arduino + "{}");
  r.advance(4e6);
  assert.equal(r.snapshot().parts.led.lit, true);
  assert.equal(lines().at(-1), "1");
  r.advance(8e6);
  assert.equal(r.snapshot().parts.led.lit, false);
  assert.equal(lines().at(-1), "0");
});
test("Four signals firmware maps button to LED and pot to fading RGB brightness", () => {
  const { runtime: r, project: p, lines } = example("four-signals");
  assert.equal(p.artifact.buildKey, p.arduino + "{}");
  r.advance(4e6);
  assert.equal(r.snapshot().parts.led.lit, false);
  assert.deepEqual(
    lines().at(-1).split(",").map(Number).slice(0, 3),
    [0, 650, 0],
  );
  r.setControls({ button: true, pot: 1023 });
  r.advance(4e6);
  assert.equal(r.snapshot().parts.led.lit, true);
  const values = lines().at(-1).split(",").map(Number);
  assert.deepEqual(values.slice(0, 3), [1, 1023, 1]);
  assert.ok(values.slice(3).some((v) => v > 0));
  r.setControls({ button: false, pot: 0 });
  r.advance(4e6);
  assert.equal(r.snapshot().parts.led.lit, false);
  assert.deepEqual(lines().at(-1).split(",").map(Number), [0, 0, 0, 0, 0, 0]);
});
