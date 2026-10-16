import test from "node:test";
import assert from "node:assert/strict";
import { instrumentStates } from "../sim/instruments.js";
import { passiveStates } from "../sim/passiveStates.js";
import { UnoRuntime } from "../sim/runtime.js";
import { resolveCircuit } from "../sim/circuit.js";
import { readFileSync } from "node:fs";
test("PWM LEDs use duty brightness instead of instantaneous on/off samples", () => {
  const n = {
    sources: [
      { net: "a", pin: 9 },
      { net: "g", volts: 0 },
    ],
    resistors: [{ id: "r", a: "a", b: "l", ohms: 220 }],
    leds: [{ id: "led", a: "l", c: "g", forwardVoltage: 2 }],
  };
  const pins = [];
  pins[9] = 1.25;
  const pwm = [];
  pwm[9] = 0.25;
  const s = passiveStates(n, pins, {}, pwm);
  assert.ok(s.led.lit);
  assert.ok(Math.abs(s.led.current - (0.25 * 3) / 220) < 1e-8);
});
test("multimeter measures voltage, resistance and rejects powered ohm readings", () => {
  const passive = {
    sources: [
      { net: "v", volts: 5 },
      { net: "g", volts: 0 },
    ],
    resistors: [
      { a: "v", b: "s", ohms: 10000 },
      { a: "s", b: "g", ohms: 10000 },
    ],
  };
  const t = {
    passive,
    instruments: [
      { id: "m", type: "p5comp-multimeter", mode: "voltage", a: "s", b: "g" },
    ],
  };
  assert.equal(instrumentStates(t, [], {}, {}).m.voltage, 2.5);
  t.instruments[0].mode = "resistance";
  assert.equal(instrumentStates(t, [], {}, {}).m.reading, "LIVE");
  passive.sources = [];
  t.instruments[0].a = "v";
  assert.equal(instrumentStates(t, [], {}, {}).m.resistance, 20000);
});
test("wireable probe reports real PWM frequency and duty from compiled sketch", () => {
  const p = JSON.parse(
    readFileSync(
      new URL("../public/examples/four-signals.json", import.meta.url),
    ),
  );
  p.diagram.parts.push({
    id: "probe",
    type: "p5comp-signal-probe",
    left: 0,
    top: 0,
    attrs: {},
  });
  p.diagram.connections.push(
    ["probe:SIG", "uno:9"],
    ["probe:GND", "uno:GND.1"],
  );
  const r = new UnoRuntime(
    p.artifact.hex,
    resolveCircuit(p.diagram),
    p.controls,
  );
  r.advance(320000);
  r.snapshot();
  r.advance(320000);
  const s = r.snapshot().parts.probe;
  assert.ok(s.frequency > 450 && s.frequency < 550, JSON.stringify(s));
  assert.ok(s.duty > 0 && s.duty < 1);
  assert.ok(s.samples.length > 4);
});
test("series current meter reads a resistor branch and flags parallel overload", () => {
  const passive = {
    sources: [
      { net: "v", volts: 5 },
      { net: "g", volts: 0 },
    ],
    resistors: [
      { id: "m", a: "v", b: "s", ohms: 0.1 },
      { id: "r", a: "s", b: "g", ohms: 1000 },
    ],
  };
  const topology = {
    passive,
    instruments: [
      { id: "m", type: "p5comp-multimeter", mode: "current", a: "v", b: "s" },
    ],
  };
  const states = passiveStates(passive);
  assert.ok(
    Math.abs(instrumentStates(topology, [], {}, states).m.current - 0.0049995) <
      0.000001,
  );
  assert.equal(
    instrumentStates(topology, [], {}, { m: { current: 50 } }).m.reading,
    "OL",
  );
});

test('plotter channels and global power references resolve without long wires', () => {
  const d = {version:1, parts:[
    {id:'uno',type:'wokwi-arduino-uno',attrs:{}},
    {id:'plot',type:'p5comp-plotter',attrs:{}},
    {id:'g',type:'p5comp-ground',attrs:{}},
    {id:'v',type:'p5comp-vcc',attrs:{}},
  ],connections:[['plot:GND','g:GND'],['plot:CH1','v:VCC'],['plot:CH2','uno:9']]};
  d.parts.forEach(p=>{p.left=0;p.top=0;});
  const t=resolveCircuit(d), pins=[]; pins[9]=2.5;
  const state=instrumentStates(t,pins,{},{}).plot;
  assert.equal(state.channels[0].value,5);
  assert.equal(state.channels[1].value,2.5);
  assert.equal(state.channels[2].value,null);
  d.connections.push(['v:VCC','g:GND']);
  assert.throws(()=>resolveCircuit(d),/shorted/);
});
