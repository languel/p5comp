import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  parseParameters,
  parameterBindings,
  parameterValue,
  readParameters,
} from "../shared/p5/parameters.js";
test("annotations bind getters and setters to actual lexical sketch variables", () => {
  const source = `// @param gain = 1 (0..3 step:0.25)\nlet gain=1;\n// @watch out energy\nlet energy=2;\n// @link gain -> energy`;
  const context = vm.createContext({ window: {} });
  vm.runInContext(source + parameterBindings(source), context);
  const bindings = context.window.__p5compBindings;
  assert.equal(bindings[0].get(), 1);
  bindings[0].set(parameterValue(bindings[0], 2.12));
  assert.equal(bindings[0].get(), 2);
  assert.equal(vm.runInContext("gain", context), 2);
  assert.equal(readParameters(bindings)[1].value, 2);
  assert.deepEqual(parseParameters(source).links, [
    { from: "gain", to: "energy" },
  ]);
});
test("readonly, booleans, malformed paths and out-of-range inputs are handled", () => {
  const rows = parseParameters(
    "// @param fixed = 1 (0..2 step:1)\nconst fixed=1;\n// @param enabled = true (boolean)\nlet enabled=true;\n// @watch out sensor.pot\n// @watch out foo();globalThis.bad=1",
  ).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].editable, false);
  assert.throws(() => parameterValue(rows[0], 2), /read-only/);
  assert.equal(parameterValue(rows[1], false), false);
  assert.throws(() => parameterValue(rows[1], 1), /boolean/);
  const numeric = { editable: true, type: "number", min: 0, max: 2, step: 0.1 };
  assert.equal(parameterValue(numeric, 8), 2);
  assert.throws(() => parameterValue(numeric, NaN), /finite/);
});
test("communication terminals expose real p5 controls and declared circuit endpoints", () => {
  const source = `// @param interval = 500 (50..2000 step:10)\n// @watch out interval\n// @watch in led\n// @terminal circuit in arduino.interval = interval\n// @terminal circuit out arduino.led = led\n// @link interval -> arduino.interval\nlet interval=500; let led=1;`;
  const context = vm.createContext({ window: {} });
  vm.runInContext(source + parameterBindings(source), context);
  const bindings = context.window.__p5compBindings;
  assert.equal(bindings[0].direction, "out");
  bindings[0].set(800);
  assert.equal(bindings[2].scope, "circuit");
  assert.equal(bindings[2].get(), 800);
  assert.equal(bindings[3].get(), 1);
});
test("send and receive conventions generate paired terminals without redundant annotations", () => {
  const source =
    "// @param interval = 500 (50..2000 step:10)\n// @send interval\n// @receive led\nlet interval=500;let led=0;";
  const parsed = parseParameters(source);
  assert.equal(parsed.rows.find((r) => r.name === "interval").editable, true);
  assert.equal(parsed.rows.find((r) => r.name === "interval").direction, "out");
  assert.equal(parsed.rows.find((r) => r.name === "led").direction, "in");
  assert.deepEqual(parsed.links, [
    { from: "interval", to: "arduino.interval" },
    { from: "arduino.led", to: "led" },
  ]);
});
