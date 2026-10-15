import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCircuit } from "../sim/circuit.js";
import { UnoRuntime, loadHex } from "../sim/runtime.js";
import { digitalLevels, sensorReading } from "../sim/inputModels.js";
import { NeoPixelDecoder, ExtendedOutputs } from "../sim/outputModels.js";
const p = (id, type, attrs = {}) => ({ id, type, attrs, left: 0, top: 0 });
const project = (slug) =>
  JSON.parse(
    readFileSync(
      new URL("../public/examples/" + slug + ".json", import.meta.url),
      "utf8",
    ),
  );
const run = (slug, cycles = 1600000, controls) => {
  const d = project(slug);
  const bytes = [];
  const r = new UnoRuntime(
    d.artifact.hex,
    resolveCircuit(d.diagram),
    controls || d.controls,
    (b) => bytes.push(b),
  );
  r.advance(cycles);
  return { r, text: () => new TextDecoder().decode(Uint8Array.from(bytes)) };
};
test("DIP contacts connect only matching numbered sides; SPDT center switches throws", () => {
  const d = {
    parts: [
      p("u", "wokwi-arduino-uno"),
      p("dip", "wokwi-dip-switch-8"),
      p("s", "wokwi-slide-switch"),
    ],
    connections: [
      ["u:2", "dip:1a"],
      ["u:GND.1", "dip:1b"],
      ["u:3", "dip:2a"],
      ["u:GND.1", "dip:2b"],
      ["u:4", "s:2"],
      ["u:GND.1", "s:1"],
      ["u:5V", "s:3"],
    ],
  };
  const t = resolveCircuit(d),
    states = Array(20).fill(3);
  let l = digitalLevels(t, states, { dip: [1, 0], s: 0 });
  assert.equal(l[2], false);
  assert.equal(l[3], true);
  assert.equal(l[4], false);
  l = digitalLevels(t, states, { dip: [0, 1], s: 1 });
  assert.equal(l[2], true);
  assert.equal(l[3], false);
  assert.equal(l[4], true);
});
test("Scanned keypad is bidirectional: selected row pulls only closed column low", () => {
  const d = project("keypad-scan"),
    t = resolveCircuit(d.diagram),
    states = Array(20).fill(2);
  for (let n = 6; n < 10; n++) states[n] = 3;
  states[2] = 0;
  assert.equal(digitalLevels(t, states, { keypad: ["0,1"] })[7], false);
  assert.equal(digitalLevels(t, states, { keypad: ["1,1"] })[7], true);
  assert.equal(digitalLevels(t, states, { keypad: ["0,1", "0,3"] })[9], false);
});
test("Photo model follows lux divider and digital threshold; sound levels clamp", () => {
  const s = p("photo", "wokwi-photoresistor-sensor");
  let v = sensorReading(s, 100);
  assert.ok(Math.abs(v.volts - 2.5) < 0.02);
  assert.equal(sensorReading(s, 1).high, true);
  assert.equal(sensorReading(s, 10000).high, false);
  const sound = p("sound", "wokwi-small-sound-sensor", { threshold: 500 });
  assert.equal(sensorReading(sound, 700).high, true);
  assert.equal(sensorReading(sound, -1).volts, 0);
  sound.attrs.activeLow = true;
  assert.equal(sensorReading(sound, 700).high, false);
});
test("Compiled DIP and keypad firmware reads controls and releases without stuck keys", () => {
  const d = run("dip-inputs", 3200000, { dip: [1, 0, 1, 0, 0, 0, 0, 1] });
  assert.match(d.text(), /10100001/);
  assert.equal(d.r.snapshot().led, true);
  const k = run("keypad-scan", 3200000, { keypad: ["1,2"] });
  assert.match(k.text(), /6/);
  assert.equal(k.r.snapshot().led, true);
  k.r.setControls({ keypad: [] });
  k.r.advance(3200000);
  assert.equal(k.r.snapshot().led, false);
});
test("Compiled slider/switch and sound examples read ADCs and digital outputs", () => {
  const a = run("slider-switch", 3200000, { slider: 900, switch: 1 });
  assert.match(a.text(), /900,1/);
  const s = run("sound-levels", 3200000, { small: 700, big: 100 });
  assert.match(s.text(), /700,100,1,0/);
  assert.equal(s.r.snapshot().led, true);
});
test("PIR uses emulated-time delay, inhibit, retrigger and powered output", () => {
  const a = run("light-motion", 1600000, { light: 1, motion: false });
  a.r.setControls({ light: 1, motion: true });
  a.r.advance(1600000);
  assert.equal(a.r.snapshot().parts.motion.digital, true);
  a.r.setControls({ light: 1, motion: false });
  a.r.advance(16e6 * 2.1);
  assert.equal(a.r.snapshot().parts.motion.digital, false);
  a.r.setControls({ light: 1, motion: true });
  a.r.advance(160000);
  assert.equal(a.r.snapshot().parts.motion.digital, false);
  a.r.setControls({ light: 1, motion: false });
  a.r.advance(16e6 * 0.6);
  a.r.setControls({ light: 1, motion: true });
  a.r.advance(160000);
  assert.equal(a.r.snapshot().parts.motion.digital, true);
});
test("Relay COM/NO/NC controls a powered LED load through its resistor", () => {
  const a = run("relay-contacts", 4e6);
  let s = a.r.snapshot().parts;
  assert.equal(s.relay.energized, true);
  assert.equal(s.on.lit, true);
  assert.equal(s.off.lit, false);
  a.r.advance(16e6);
  s = a.r.snapshot().parts;
  assert.equal(s.relay.energized, false);
  assert.equal(s.on.lit, false);
  assert.equal(s.off.lit, true);
});
test("WS2812 decoder latches GRB bytes after reset and shifts chained pixel offset", () => {
  const d = new NeoPixelDecoder(1, 1);
  let t = 1600;
  for (const byte of [0, 255, 0, 64, 0, 128])
    for (let b = 7; b >= 0; b--) {
      d.tick(t, true);
      d.tick(t + ((byte >> b) & 1 ? 12 : 5), false);
      t += 20;
    }
  let colors = d.snapshot(t + 1000);
  assert.equal(colors[0].r, 0);
  assert.equal(colors[0].g, 64 / 255);
  assert.equal(colors[0].b, 128 / 255);
  const short = new NeoPixelDecoder(2);
  short.tick(1000, true);
  short.tick(1005, false);
  assert.ok(
    short.snapshot(3000).every((c) => c.r === 0 && c.g === 0 && c.b === 0),
  );
});
test("Compiled WS2812 firmware lights ring, chained strip/single, and matrix", () => {
  const a = run("neopixel-chain", 2e6);
  const s = a.r.snapshot().parts;
  assert.equal(s.ring.pixels.length, 8);
  assert.equal(s.strip.pixels.length, 8);
  assert.equal(s.pixel.pixels.length, 1);
  assert.ok(s.ring.pixels.some((c) => c.r > 0 || c.g > 0 || c.b > 0));
  assert.ok(s.strip.pixels.some((c) => c.r > 0 || c.g > 0 || c.b > 0));
  assert.ok(Object.values(s.pixel.pixels[0]).some((v) => v > 0));
  const m = run("neopixel-matrix", 2e6).r.snapshot().parts.matrix;
  assert.equal(m.pixels.length, 16);
  assert.equal(m.pixels.filter((c) => c.r > 0).length, 1);
});
test("A4988 steps, reverses, disables, resets, and supports microstep division", () => {
  const pins = {
    STEP: 0,
    DIR: 1,
    ENABLE: 2,
    RESET: 3,
    SLEEP: 4,
    MS1: 5,
    MS2: 6,
    MS3: 7,
  };
  const d = new ExtendedOutputs([
    { id: "d", type: "wokwi-a4988", pins, attrs: {}, powered: true },
  ]);
  let levels = [false, true, false, true, true, false, false, false],
    time = 0;
  const tick = () => d.tick(time++, (n) => levels[n]);
  const step = () => {
    levels[0] = true;
    tick();
    levels[0] = false;
    tick();
  };
  step();
  assert.equal(d.snapshot(time).d.steps, 1);
  levels[1] = false;
  step();
  assert.equal(d.snapshot(time).d.steps, 0);
  levels[2] = true;
  step();
  assert.equal(d.snapshot(time).d.steps, 0);
  levels[2] = false;
  levels[1] = true;
  levels[5] = true;
  step();
  assert.equal(d.snapshot(time).d.steps, 0.5);
  levels[3] = false;
  tick();
  assert.equal(d.snapshot(time).d.steps, 0);
});
test("Compiled stepper example moves the connected motor, not only its driver symbol", () => {
  const r = run("stepper-driver", 2e6).r;
  const s = r.snapshot().parts;
  assert.ok(Math.abs(s.motor.angle) > 1);
  assert.equal(s.motor.angle, s.driver.angle);
});
test("Mega example uses A15 and high GPIOs to light independent bar segments", () => {
  const r = run("mega-gpio", 4e6, { slider: 777 }).r;
  const s = r.snapshot();
  assert.equal(r.layout.digitalCount, 70);
  assert.equal(r.cpu.progBytes.length, 262144);
  assert.equal(r.cpu.data.length, 8704);
  assert.deepEqual(s.parts.bar.values.slice(0, 5), [1, 1, 1, 0, 0]);
});

test("Mega firmware verifies timers 0/3/4/5, ADC MUX5, interrupt and all UARTs", () => {
  const d = {
    parts: [
      p("mega", "wokwi-arduino-mega"),
      p("pot", "wokwi-slide-potentiometer"),
      p("button", "wokwi-pushbutton"),
    ],
    connections: [
      ["mega:5V", "pot:VCC"],
      ["mega:GND.1", "pot:GND"],
      ["mega:A15", "pot:SIG"],
      ["mega:2", "button:1.l"],
      ["mega:GND.1", "button:2.l"],
    ],
  };
  let serial = "";
  const r = new UnoRuntime(
    readFileSync(
      new URL("./fixtures/mega-registers.hex", import.meta.url),
      "utf8",
    ),
    resolveCircuit(d),
    { pot: 777, button: false },
    (b) => (serial += String.fromCharCode(b)),
  );
  const extra = ["", "", ""];
  r.uarts
    .slice(1)
    .forEach(
      (u, i) =>
        (u.onByteTransmit = (b) => (extra[i] += String.fromCharCode(b))),
    );
  r.advance(16e6);
  assert.match(serial, /904,777,0/);
  assert.deepEqual(extra, ["UART1\r\n", "UART2\r\n", "UART3\r\n"]);
  const samples = [new Set(), new Set(), new Set()];
  for (let i = 0; i < 150; i++) {
    r.advance(1600);
    [5, 6, 46].forEach((n, k) => {
      const [port, bit] = r.pin(n);
      samples[k].add(port.pinState(bit));
    });
  }
  for (const sample of samples) {
    assert.ok(sample.has(0));
    assert.ok(sample.has(1));
  }
  r.setControls({ pot: 333, button: true });
  r.advance(3200000);
  assert.match(serial, /,333,1/);
});

test("PIR retrigger extends its emulated hold time before entering inhibition", () => {
  const a = run("light-motion", 160000, { light: 500, motion: false });
  a.r.setControls({ light: 500, motion: true });
  a.r.advance(16e6);
  a.r.setControls({ light: 500, motion: false });
  a.r.setControls({ light: 500, motion: true });
  a.r.advance(16e6 * 1.5);
  assert.equal(a.r.snapshot().parts.motion.digital, true);
  a.r.setControls({ light: 500, motion: false });
  a.r.advance(16e6 * 0.6);
  assert.equal(a.r.snapshot().parts.motion.digital, false);
});
