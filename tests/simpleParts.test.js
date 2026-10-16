import test from "node:test";
import assert from "node:assert/strict";
import { resolveCircuit, validateDiagram } from "../sim/circuit.js";
import { digitalLevels } from "../sim/inputModels.js";
import { resistiveVoltages } from "../sim/resistiveNetwork.js";
import { UnoRuntime } from "../sim/runtime.js";
import { readFileSync } from "node:fs";
const p = (id, type, attrs = {}) => ({ id, type, attrs, left: 0, top: 0 });
test("simple two-terminal switch opens/closes a pullup input", () => {
  const d = {
    parts: [p("u", "wokwi-arduino-uno"), p("s", "p5comp-toggle-switch")],
    connections: [
      ["u:2", "s:1"],
      ["u:GND.1", "s:2"],
    ],
  };
  validateDiagram(d);
  const t = resolveCircuit(d);
  const states = Array(20).fill(3);
  assert.equal(digitalLevels(t, states, { s: 0 })[2], true);
  assert.equal(digitalLevels(t, states, { s: 1 })[2], false);
});
test("two-terminal photoresistor makes a light-dependent analog voltage divider", () => {
  const d = {
    parts: [
      p("u", "wokwi-arduino-uno"),
      p("light", "p5comp-photoresistor", { value: 100, rl10: 50, gamma: 0.7 }),
      p("r", "wokwi-resistor", { value: "10k" }),
    ],
    connections: [
      ["u:5V", "light:1"],
      ["light:2", "r:1"],
      ["r:1", "u:A0"],
      ["r:2", "u:GND.1"],
    ],
  };
  validateDiagram(d);
  const t = resolveCircuit(d);
  const net = t.digital.pinNets[14];
  const dark = resistiveVoltages(t.passive, [], { light: 1 }).get(net),
    bright = resistiveVoltages(t.passive, [], { light: 1000 }).get(net);
  assert.ok(dark < 0.3);
  assert.ok(bright > 4);
  const firmware = JSON.parse(
    readFileSync(
      new URL("../public/examples/four-signals.json", import.meta.url),
    ),
  );
  const r = new UnoRuntime(firmware.artifact.hex, t, { light: 1 }, () => {});
  assert.ok(r.adc.channelValues[0] < 0.3);
  r.setControls({ light: 1000 });
  assert.ok(r.adc.channelValues[0] > 4);
});
test("simple pot has normal powered analog semantics and capacitor remains open", () => {
  const d = {
    parts: [
      p("u", "wokwi-arduino-uno"),
      p("pot", "p5comp-potentiometer"),
      p("c", "p5comp-capacitor", { value: "100nF" }),
    ],
    connections: [
      ["u:5V", "pot:VCC"],
      ["u:GND.1", "pot:GND"],
      ["u:A0", "pot:SIG"],
      ["c:1", "u:5V"],
      ["c:2", "u:GND.1"],
    ],
  };
  validateDiagram(d);
  const t = resolveCircuit(d);
  assert.equal(t.pots[0].powered, true);
  assert.equal(t.pots[0].pin, 14);
  assert.equal(t.passive.resistors.length, 0);
});
test("simple slide pot uses analog wiring and accepts engineering resistance values", () => {
  const d = {
    parts: [
      p("u", "wokwi-arduino-uno"),
      p("pot", "p5comp-slide-potentiometer", {
        maxResistance: "10K",
        value: 512,
      }),
    ],
    connections: [
      ["u:5V", "pot:VCC"],
      ["u:GND.1", "pot:GND"],
      ["u:A0", "pot:SIG"],
    ],
  };
  validateDiagram(d);
  const circuit = resolveCircuit(d);
  assert.equal(circuit.pots[0].powered, true);
  assert.equal(circuit.pots[0].pin, 14);
  d.parts[1].attrs.maxResistance = "-10k";
  assert.throws(() => validateDiagram(d), /positive ohms/);
});
