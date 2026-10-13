import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  ELEMENTS,
  elementPins,
  searchElements,
  terminalColors,
} from "../sim/elements.js";
import {
  classroomCircuit,
  validateDiagram,
  resolveCircuit,
} from "../sim/circuit.js";
test("catalog includes every registered Wokwi element and searches labels, types and variants", () => {
  const root = new URL(
    "../node_modules/@wokwi/elements/dist/esm/",
    import.meta.url,
  );
  const types = readdirSync(root)
    .filter((f) => f.endsWith("-element.js"))
    .map(
      (f) =>
        readFileSync(new URL(f, root), "utf8").match(
          /customElement\('([^']+)'\)/,
        )?.[1],
    )
    .filter(Boolean);
  assert.deepEqual(
    ELEMENTS.filter((e) => e.type !== "wokwi-breadboard")
      .map((e) => e.type)
      .sort(),
    types.sort(),
  );
  assert.equal(searchElements("oled")[0].type, "wokwi-ssd1306");
  assert.equal(searchElements("lcd i2c").length, 2);
  assert.equal(searchElements("no-such-part").length, 0);
});
test("catalog terminal validation supports visual parts without pretending to simulate them", () => {
  const d = classroomCircuit(),
    original = resolveCircuit(d);
  d.parts.push({
    id: "oled",
    type: "wokwi-ssd1306",
    left: 0,
    top: 0,
    attrs: {},
  });
  d.connections.push(["uno:GND.1", "oled:GND", "#123456"]);
  validateDiagram(d);
  assert.deepEqual(resolveCircuit(d), original);
  d.connections.push(["uno:A4", "oled:UNKNOWN", "#123456"]);
  assert.throws(() => resolveCircuit(d), /Unknown terminal/);
  assert.deepEqual(
    elementPins({ type: "wokwi-lcd1602", attrs: { pins: "i2c" } }),
    ["GND", "VCC", "SDA", "SCL"],
  );
});
test("terminal dots track recoloring, selected shared wires and disconnected ends", () => {
  const wires = [
    ["uno:2", "button:1", "#123456"],
    ["uno:2", "free:1,2", "#abcdef"],
  ];
  assert.equal(terminalColors(wires).get("uno:2"), "#abcdef");
  assert.equal(terminalColors(wires, 0).get("uno:2"), "#123456");
  assert.equal(terminalColors(wires).has("free:1,2"), false);
  wires[0][2] = "#445566";
  assert.equal(terminalColors(wires).get("button:1"), "#445566");
});
