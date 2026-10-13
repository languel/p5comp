import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UnoRuntime, loadHex } from "../sim/runtime.js";
import { classroomCircuit, resolveCircuit } from "../sim/circuit.js";
const hex = readFileSync(
  new URL("../public/sim/classroom.hex", import.meta.url),
  "utf8",
);
test("breadboard strips join five holes but not center halves or adjacent columns", () => {
  const d = classroomCircuit();
  assert.equal(resolveCircuit(d).warnings.length, 0);
  d.connections = d.connections.filter(([a]) => a !== "bb:1t.e");
  assert.equal(resolveCircuit(d).pots[0].powered, false);
  d.connections.push(["bb:1b.f", "bb:bn.3"]);
  assert.equal(resolveCircuit(d).pots[0].powered, false);
  d.connections.push(["bb:1t.c", "bb:bn.3"]);
  assert.equal(resolveCircuit(d).pots[0].powered, true);
});
test("shorts, unknown terminals and duplicate IDs are rejected", () => {
  const d = classroomCircuit();
  d.connections.push(["uno:5V", "uno:GND.1"]);
  assert.throws(() => resolveCircuit(d), /shorted/);
  const e = classroomCircuit();
  e.connections.push(["uno:99", "pot:SIG"]);
  assert.throws(() => resolveCircuit(e), /Unknown terminal/);
  e.parts.push({ ...e.parts[0] });
  assert.throws(() => resolveCircuit(e), /unique/);
});
test("actual Arduino HEX reads ADC, debounces buttons, times sonar and transmits CSV", () => {
  let out = "";
  const r = new UnoRuntime(
    hex,
    resolveCircuit(classroomCircuit()),
    { pot: 512, sonar: 100, b1: false, b2: false },
    (b) => (out += String.fromCharCode(b)),
  );
  r.advance(8000000);
  assert.match(out, /99\.\d,512,0,0/);
  assert.equal(r.snapshot().led, false);
  out = "";
  r.setControls({ pot: 1023, sonar: 10, b1: true, b2: false });
  r.advance(4000000);
  assert.match(out, /(?:9|10)\.\d,1023,1,0/);
  assert.equal(r.snapshot().led, true);
  out = "";
  r.setControls({ pot: 0, sonar: 60, b1: true, b2: true });
  r.advance(4000000);
  assert.match(out, /59\.\d,0,1,1/);
  assert.equal(r.snapshot().led, false);
  out = "";
  r.setControls({ pot: 128, sonar: -1, b1: false, b2: true });
  r.advance(4000000);
  assert.match(out, /-1\.0,128,0,1/);
  r.write(new TextEncoder().encode("LED:1\nPING\n"));
  out = "";
  r.advance(4000000);
  assert.match(out, /PONG/);
  assert.equal(r.snapshot().led, true);
  r.write(new TextEncoder().encode("LED:0\n"));
  r.advance(4000000);
  assert.equal(r.snapshot().led, false);
});
test("disconnected sonar produces no echo, and bad HEX cannot execute", () => {
  const d = classroomCircuit();
  d.connections = d.connections.filter(([a]) => a !== "uno:9");
  let out = "";
  const r = new UnoRuntime(
    hex,
    resolveCircuit(d),
    { pot: 512, sonar: 100 },
    (b) => (out += String.fromCharCode(b)),
  );
  r.advance(8000000);
  assert.match(out, /-1\.0,512,0,0/);
  assert.throws(() => loadHex(hex.replace(":10", ":11")), /checksum/);
});
test("disconnected buttons release to the firmware pull-up and supply wires drive digital inputs", () => {
  const d = classroomCircuit();
  d.connections = d.connections.filter(([a]) => a !== "uno:2");
  let out = "";
  const r = new UnoRuntime(
    hex,
    resolveCircuit(d),
    { pot: 512, sonar: 100, b1: true },
    (b) => (out += String.fromCharCode(b)),
  );
  r.advance(4000000);
  assert.match(out, /99\.\d,512,0,0/);
  d.connections.push(["uno:2", "uno:GND.1"]);
  out = "";
  const grounded = new UnoRuntime(
    hex,
    resolveCircuit(d),
    { pot: 512, sonar: 100 },
    (b) => (out += String.fromCharCode(b)),
  );
  grounded.advance(4000000);
  assert.match(out, /99\.\d,512,1,0/);
});
