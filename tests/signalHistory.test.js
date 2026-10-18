import test from "node:test";
import assert from "node:assert/strict";
import { sampleSignal, signalPaths } from "../sim/signalHistory.js";
test("signal histories are bounded, handle multiple channels and reject invalid readings", () => {
  const h = [];
  sampleSignal(h, null, 0);
  assert.equal(h.length, 0);
  for (let t = 0; t < 30000; t += 100) sampleSignal(h, [t % 255, 1, 0], t);
  assert.ok(h.length <= 101);
  assert.equal(signalPaths(h, 30000).length, 3);
  for (const d of signalPaths(h, 30000)) assert.ok(!/NaN|Infinity/.test(d));
});
