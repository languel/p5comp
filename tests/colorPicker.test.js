import test from "node:test";
import assert from "node:assert/strict";
import { parseColor, formatColor } from "../sim/ColorPicker.js";
import { breadboardPalette } from "../sim/breadboard.js";
test("opacity colors retain transparent and partially transparent values", () => {
  assert.deepEqual(parseColor("#aabbcc00"), { hex: "#aabbcc", alpha: 0 });
  assert.equal(formatColor("#aabbcc", 0), "#aabbcc00");
  const parsed = parseColor("#aabbcc80");
  assert.equal(formatColor(parsed.hex, parsed.alpha), "#aabbcc80");
  assert.equal(formatColor("#aabbcc", 1), "#aabbcc");
  assert.deepEqual(parseColor("rgba(10, 20, 30, 0.5)"), {
    hex: "#0a141e",
    alpha: 0.5,
  });
  assert.equal(breadboardPalette("#aabbcc80").color, "#aabbcc80");
});
