import test from "node:test";
import assert from "node:assert/strict";
import { resolveCircuit } from "../sim/circuit.js";
import { passiveStates } from "../sim/passiveStates.js";
const diagram = {
  parts: [
    { id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 },
    { id: "led", type: "wokwi-led", left: 200, top: 0 },
    {
      id: "r",
      type: "wokwi-resistor",
      left: 100,
      top: 0,
      attrs: { value: "220" },
    },
  ],
  connections: [
    ["uno:13", "r:1"],
    ["r:2", "led:A"],
    ["led:C", "uno:GND.1"],
  ],
};
test("LED polarity, series resistance, disconnection and digital output states control light/current", () => {
  const topology = resolveCircuit(diagram),
    pins = Array(20).fill(null);
  pins[13] = 5;
  const state = passiveStates(topology.passive, pins);
  assert.equal(state.led.lit, true);
  assert.ok(Math.abs(state.led.current - 3 / 220) < 1e-8);
  assert.ok(state.r.power > 0);
  pins[13] = 0;
  assert.equal(passiveStates(topology.passive, pins).led.lit, false);
  const reversed = structuredClone(diagram);
  reversed.connections[1][1] = "led:C";
  reversed.connections[2][0] = "led:A";
  pins[13] = 5;
  assert.equal(
    passiveStates(resolveCircuit(reversed).passive, pins).led.lit,
    false,
  );
  const disconnected = structuredClone(diagram);
  disconnected.connections.pop();
  assert.equal(
    passiveStates(resolveCircuit(disconnected).passive, pins).led.lit,
    false,
  );
  const higher = structuredClone(diagram);
  higher.parts[2].attrs.value = "1k";
  assert.ok(
    passiveStates(resolveCircuit(higher).passive, pins).led.brightness <
      state.led.brightness,
  );
});

test("both momentary switch sizes close an LED series path, while equal-number contacts are always joined", () => {
  for (const type of ["wokwi-pushbutton", "wokwi-pushbutton-6mm"]) {
    const d = structuredClone(diagram);
    d.parts.push({ id: "button", type, left: 0, top: 100 });
    d.connections[2] = ["led:C", "button:1.r"];
    d.connections.push(["button:2.l", "uno:GND.1"]);
    const t = resolveCircuit(d),
      pins = Array(20).fill(null);
    pins[13] = 5;
    assert.equal(
      passiveStates(t.passive, pins, { button: false }).led.lit,
      false,
    );
    const pressed = passiveStates(t.passive, pins, { button: true });
    assert.equal(pressed.led.lit, true);
    assert.ok(Math.abs(pressed.led.current - 3 / 220) < 1e-8);
    assert.equal(pressed.button.closed, true);
    d.connections[3][0] = "button:1.l";
    assert.equal(
      passiveStates(resolveCircuit(d).passive, pins, { button: false }).led.lit,
      true,
    );
  }
});
