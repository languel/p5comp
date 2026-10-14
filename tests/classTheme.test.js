import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeSketch,
  webserialSketch,
  upgradeClassSketchTheme,
} from "../sim/examples.js";
test("legacy class colors migrate while custom logic and serial API remain intact", () => {
  const legacy =
    nativeSketch
      .replace(
        /window.theme === 'dark' \? '#[0-9a-f]+' : '(#[0-9a-f]+)'/g,
        "'$1'",
      )
      .replace(/\('#e8eeea'\)/g, "'#e8eeea'")
      .replace(
        ".style('background', 'var(--ui-hover)')",
        ".style('background', '#e8eeea')",
      )
      .replace(
        ".style('color', 'var(--ui-text)')",
        ".style('color', '#464b49')",
      ) + "\nconst studentThreshold = 37;";
  const updated = upgradeClassSketchTheme(legacy);
  assert.ok(
    updated.includes(
      "background(window.theme === 'dark' ? '#242426' : '#fafafa')",
    ),
  );
  assert.ok(updated.includes("var(--ui-hover)"));
  assert.ok(
    updated.includes("window.theme === 'dark' ? '#414145' : '#e8eeea'"),
  );
  assert.ok(updated.includes("const studentThreshold = 37;"));
  assert.ok(updated.includes("navigator.serial.requestPort()"));
  new Function(updated);
  assert.equal(upgradeClassSketchTheme(updated), updated);
});
test("theme migration does not alter custom artwork or current bundled examples", () => {
  const custom =
    "function setup(){createCanvas(500,360)} function draw(){background('#fafafa')}";
  assert.equal(upgradeClassSketchTheme(custom), custom);
  assert.equal(upgradeClassSketchTheme(nativeSketch), nativeSketch);
  assert.equal(upgradeClassSketchTheme(webserialSketch), webserialSketch);
});
