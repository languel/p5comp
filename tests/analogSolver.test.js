import test from "node:test";
import assert from "node:assert/strict";
import { resolveCircuit } from "../sim/circuit.js";
import { AnalogSolver } from "../sim/analogSolver.js";
import { quantity, waveform } from "../sim/analogMath.js";
const part = (id, type, attrs = {}) => ({ id, type, left: 0, top: 0, attrs });
const ground = part("g", "p5comp-ground");
function rc(extra = [], connections = []) {
  return resolveCircuit({
    version: 1,
    parts: [
      ground,
      part("bat", "p5comp-battery", { voltage: 5 }),
      part("r", "wokwi-resistor", { value: "1k" }),
      part("c", "p5comp-capacitor", { value: "1uF" }),
      ...extra,
    ],
    connections: [
      ["bat:-", "g:GND"],
      ["bat:+", "r:1"],
      ["r:2", "c:1"],
      ["c:2", "g:GND"],
      ...connections,
    ],
  });
}
const voltage = (t, s, pin) =>
  s.volts.get(t.analog.devices.find((d) => d.id === pin).a);
test("capacitor follows RC time constant with no Arduino", () => {
  const t = rc(),
    s = new AnalogSolver(t);
  assert.equal(t.board, null);
  s.advance(0.001);
  assert.ok(Math.abs(s.memory.get("c").voltage - 5 * (1 - Math.exp(-1))) < 0.1);
  s.advance(0.01);
  assert.ok(s.memory.get("c").voltage > 4.99);
});
test("inductor current ramps and settles through a resistor", () => {
  const t = rc();
  t.analog.devices = t.analog.devices.filter((d) => d.kind !== "capacitor");
  t.analog.devices.push({
    id: "l",
    kind: "inductor",
    a: t.passive.resistors[0].b,
    b: t.analog.ground,
    value: 1,
  });
  const s = new AnalogSolver(t);
  s.advance(0.001);
  assert.ok(
    Math.abs(s.memory.get("l").current - 0.005 * (1 - Math.exp(-1))) < 0.0001,
  );
});
test("diode rectifies forward and blocks reverse", () => {
  for (const reverse of [false, true]) {
    const t = resolveCircuit({
      version: 1,
      parts: [
        ground,
        part("b", "p5comp-battery", { voltage: 5 }),
        part("d", "p5comp-diode"),
        part("r", "wokwi-resistor", { value: "1k" }),
      ],
      connections: [
        ["b:-", "g:GND"],
        ["b:+", reverse ? "d:K" : "d:A"],
        [reverse ? "d:A" : "d:K", "r:1"],
        ["r:2", "g:GND"],
      ],
    });
    const s = new AnalogSolver(t);
    s.advance(0.001);
    const v = s.volts.get(t.passive.resistors[0].a);
    assert.ok(reverse ? v < 0.001 : v > 4.3 && v < 4.4, String(v));
  }
});
test("quantity parsing and deterministic generator", () => {
  assert.equal(quantity("10mH", "H"), 0.01);
  assert.ok(Math.abs(quantity("100nF", "F") - 1e-7) < 1e-20);
  assert.throws(() => quantity("bad", "F"));
  assert.equal(
    waveform(
      { waveform: "square", frequency: 1, amplitude: 2, offset: 3 },
      0.1,
    ),
    5,
  );
  assert.equal(
    waveform(
      { waveform: "square", frequency: 1, amplitude: 2, offset: 3 },
      0.9,
    ),
    1,
  );
});
test("shorted battery reports error", () => {
  const t = rc([], [["bat:+", "bat:-"]]);
  const s = new AnalogSolver(t);
  assert.throws(() => s.advance(0.001), /shorted/);
});
test("NPN switches a collector load", () => {
  const t = resolveCircuit({
    version: 1,
    parts: [
      ground,
      part("b", "p5comp-battery", { voltage: 5 }),
      part("q", "p5comp-npn"),
      part("rb", "wokwi-resistor", { value: "10k" }),
      part("rc", "wokwi-resistor", { value: "1k" }),
    ],
    connections: [
      ["b:-", "g:GND"],
      ["b:+", "rb:1"],
      ["rb:2", "q:B"],
      ["b:+", "rc:1"],
      ["rc:2", "q:C"],
      ["q:E", "g:GND"],
    ],
  });
  const s = new AnalogSolver(t);
  s.advance(0.002);
  const v = s.volts.get(t.passive.resistors.find((r) => r.id === "rc").b);
  assert.ok(v < 0.5, String(v));
});
test("555 astable charges capacitor between thresholds and oscillates", () => {
  const t = resolveCircuit({
    version: 1,
    parts: [
      ground,
      part("bat", "p5comp-battery", { voltage: 5 }),
      part("ic", "p5comp-555"),
      part("r1", "wokwi-resistor", { value: "1k" }),
      part("r2", "wokwi-resistor", { value: "10k" }),
      part("c", "p5comp-capacitor", { value: "1uF" }),
    ],
    connections: [
      ["bat:-", "g:GND"],
      ["ic:GND", "g:GND"],
      ["bat:+", "ic:VCC"],
      ["bat:+", "ic:RESET"],
      ["bat:+", "r1:1"],
      ["r1:2", "ic:DISCH"],
      ["r2:1", "ic:DISCH"],
      ["r2:2", "ic:THRESH"],
      ["ic:TRIG", "ic:THRESH"],
      ["c:1", "ic:THRESH"],
      ["c:2", "g:GND"],
    ],
  });
  const s = new AnalogSolver(t),
    ic = t.analog.devices.find((d) => d.id === "ic");
  let rises = 0,
    last = 0;
  for (let i = 0; i < 2400; i++) {
    s.step(1 / 12000);
    const high = s.volts.get(ic.pins.OUT) > 2;
    if (high && !last) rises++;
    last = high;
  }
  assert.ok(rises > 10 && rises < 20, String(rises));
  assert.ok(s.memory.get("c").voltage > 1.5 && s.memory.get("c").voltage < 3.5);
});
test("PNP sources a collector load when base is pulled low", () => {
  const t = resolveCircuit({
    version: 1,
    parts: [
      ground,
      part("bat", "p5comp-battery", { voltage: 5 }),
      part("q", "p5comp-pnp"),
      part("rb", "wokwi-resistor", { value: "10k" }),
      part("rc", "wokwi-resistor", { value: "1k" }),
    ],
    connections: [
      ["bat:-", "g:GND"],
      ["bat:+", "q:E"],
      ["q:B", "rb:1"],
      ["rb:2", "g:GND"],
      ["q:C", "rc:1"],
      ["rc:2", "g:GND"],
    ],
  });
  const s = new AnalogSolver(t);
  s.advance(0.002);
  assert.ok(
    s.volts.get(t.passive.resistors.find((r) => r.id === "rc").a) > 4.5,
  );
});
import { readFileSync } from "node:fs";
for (const slug of [
  "rc-smoothing",
  "555-astable",
  "npn-switch",
  "pnp-switch",
  "diode-rectifier",
  "lc-resonance",
  "am-detector",
  "opamp-comparator",
])
  test("foundation example runs: " + slug, () => {
    const p = JSON.parse(
        readFileSync(
          new URL("../public/examples/" + slug + ".json", import.meta.url),
        ),
      ),
      t = resolveCircuit(p.diagram),
      s = new AnalogSolver(t);
    const frames = s.advance(0.05);
    assert.ok(frames.length > 500);
    assert.ok([...s.volts.values()].every(Number.isFinite));
  });
test("op-amp follower and comparator respect supply range", () => {
  for (const kind of ["opamp", "comparator"]) {
    const t = resolveCircuit({
      version: 1,
      parts: [
        ground,
        part("supply", "p5comp-battery", { voltage: 5 }),
        part("input", "p5comp-battery", { voltage: 2 }),
        part("amp", "p5comp-" + kind),
      ],
      connections: [
        ["supply:-", "g:GND"],
        ["input:-", "g:GND"],
        ["supply:+", "amp:V+"],
        ["amp:V-", "g:GND"],
        ["input:+", "amp:IN+"],
        kind === "opamp" ? ["amp:OUT", "amp:IN-"] : ["amp:IN-", "g:GND"],
      ],
    });
    const s = new AnalogSolver(t);
    s.advance(0.001);
    const d = t.analog.devices.find((d) => d.kind === "opamp"),
      v = s.volts.get(d.a);
    assert.ok(
      kind === "opamp" ? Math.abs(v - 2) < 0.01 : v > 4.9 && v <= 5.01,
      String(v),
    );
  }
});
test('analog runtime streams waveform and audio samples to instruments', async()=>{
 const {AnalogRuntime}=await import('../sim/analogRuntime.js');
 const p=JSON.parse(readFileSync(new URL('../public/examples/555-astable.json',import.meta.url))),t=resolveCircuit(p.diagram),runtime=new AnalogRuntime(t);
 runtime.advance(160000);const state=runtime.snapshot();assert.ok(state.analogFrames.length>=119);assert.equal(state.analogFrames[0].audio.length,1);assert.equal(state.analogFrames[0].scope.scope.length,2);assert.ok(state.analogFrames.some(f=>f.audio[0]>4));
});
