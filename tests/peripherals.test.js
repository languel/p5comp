import test from "node:test";
import assert from "node:assert/strict";
import { PeripheralModels } from "../sim/peripherals.js";
import { resolveCircuit } from "../sim/circuit.js";
import { passiveStates } from "../sim/passiveStates.js";
const part = (id, type, attrs = {}) => ({ id, type, attrs, left: 0, top: 0 });
test("Nano aliases, A6/A7 ADC routing and grounded inputs use ATmega328 topology", () => {
  const d = {
    parts: [
      part("nano", "wokwi-arduino-nano"),
      part("pot", "wokwi-potentiometer"),
    ],
    connections: [
      ["nano:5V.2", "pot:VCC"],
      ["nano:GND.3", "pot:GND"],
      ["nano:A7", "pot:SIG"],
    ],
  };
  const t = resolveCircuit(d);
  assert.equal(t.board, "nano");
  assert.equal(t.pots[0].powered, true);
  assert.equal(t.pots[0].pin, 21);
});
test("RGB channels honor common anode/cathode polarity and independent series resistance", () => {
  for (const common of ["anode", "cathode"]) {
    const d = {
      parts: [
        part("uno", "wokwi-arduino-uno"),
        part("rgb", "wokwi-rgb-led", { common }),
        part("r", "wokwi-resistor", { value: "220" }),
      ],
      connections: [
        ["rgb:COM", common === "anode" ? "uno:5V" : "uno:GND.1"],
        ["rgb:R", "r:1"],
        ["r:2", "uno:3"],
      ],
    };
    const pins = Array(20).fill(null);
    pins[3] = common === "anode" ? 0 : 5;
    const s = passiveStates(resolveCircuit(d).passive, pins);
    assert.ok(s.rgb.ledRed > 0);
    assert.equal(s.rgb.ledGreen, 0);
    assert.equal(s.rgb.ledBlue, 0);
    assert.ok(s.r.current > 0);
  }
});
test("Seven-segment common pins join; digit segment values respond to GPIO", () => {
  const d = {
    parts: [part("uno", "wokwi-arduino-uno"), part("seg", "wokwi-7segment")],
    connections: [
      ["seg:COM.2", "uno:GND.1"],
      ["seg:A", "uno:4"],
    ],
  };
  const pins = Array(20).fill(null);
  pins[4] = 5;
  assert.deepEqual(
    passiveStates(resolveCircuit(d).passive, pins).seg.values,
    [1, 0, 0, 0, 0, 0, 0, 0],
  );
});
test("Servo decodes emulated microseconds and buzzer signal expires without more edges", () => {
  const models = new PeripheralModels([
    { id: "servo", type: "wokwi-servo", pins: { PWM: 9 }, powered: true },
    { id: "buzz", type: "wokwi-buzzer", pins: { 1: 8 }, powered: true },
  ]);
  let level = false;
  const high = () => level;
  models.tick(0, high);
  level = true;
  models.tick(160, high);
  level = false;
  models.tick(160 + 1472 * 16, high);
  assert.ok(Math.abs(models.snapshot(25000).servo.angle - 90) < 1);
  assert.equal(models.snapshot(25000).buzz.hasSignal, true);
  assert.equal(models.snapshot(2000000).buzz.hasSignal, false);
});
test("HD44780 4-bit writes, row addressing, clear and power gating", () => {
  const pins = { E: 2, RS: 3, D4: 4, D5: 5, D6: 6, D7: 7 };
  const p = { id: "lcd", type: "wokwi-lcd1602", pins, powered: true };
  const model = new PeripheralModels([p]);
  let cycles = 0,
    levels = {};
  const high = (n) => !!levels[n];
  const nibble = (n, rs = false) => {
    levels = {
      2: true,
      3: rs,
      4: !!(n & 1),
      5: !!(n & 2),
      6: !!(n & 4),
      7: !!(n & 8),
    };
    model.tick((cycles += 16), high);
    levels[2] = false;
    model.tick((cycles += 16), high);
  };
  const byte = (n, rs = false) => {
    nibble(n >> 4, rs);
    nibble(n & 15, rs);
  };
  nibble(3);
  nibble(3);
  nibble(2);
  byte(0x28);
  byte(0x0c);
  byte(0x80);
  byte(72, true);
  byte(105, true);
  byte(0xc0);
  byte(33, true);
  let chars = model.snapshot(cycles).lcd.characters;
  assert.equal(String.fromCharCode(...chars.slice(0, 2)), "Hi");
  assert.equal(chars[16], 33);
  byte(1);
  assert.ok(model.snapshot(cycles).lcd.characters.every((c) => c === 32));
  p.powered = false;
  byte(65, true);
  assert.ok(model.snapshot(cycles).lcd.characters.every((c) => c === 32));
});

test("Compiled Nano example drives LCD, RGB, segments, servo and tone in AVR8JS", async () => {
  const { readFile } = await import("node:fs/promises");
  const { UnoRuntime } = await import("../sim/runtime.js");
  const project = JSON.parse(
    await readFile(
      new URL("../public/examples/peripheral-lab.json", import.meta.url),
      "utf8",
    ),
  );
  const runtime = new UnoRuntime(
    project.artifact.hex,
    resolveCircuit(project.diagram),
  );
  runtime.advance(16000000);
  const s = runtime.snapshot().parts;
  assert.equal(
    String.fromCharCode(...s.lcd.characters.slice(0, 14)),
    "p5comp: hello!",
  );
  assert.ok(s.rgb.ledRed > 0 && s.rgb.ledBlue > 0 && s.rgb.ledGreen === 0);
  assert.deepEqual(s.segment.values.slice(0, 3), [1, 1, 0]);
  assert.ok(s.servo.angle > 85 && s.servo.angle < 95);
  assert.ok(s.buzzer.frequency > 430 && s.buzzer.frequency < 450);
});

test("Custom presets reuse model metadata and validate base component types", async () => {
  const { setComponentPresets, searchElements } =
    await import("../sim/elements.js");
  setComponentPresets([
    { name: "Class 10k", base: "wokwi-resistor", attrs: { value: "10000" } },
  ]);
  const found = searchElements("Class 10k");
  assert.equal(found.length, 1);
  assert.equal(found[0].type, "wokwi-resistor");
  assert.equal(found[0].modeled, true);
  assert.throws(
    () =>
      setComponentPresets([{ name: "Broken", base: "imaginary", attrs: {} }]),
    /valid base/,
  );
  setComponentPresets([]);
});
