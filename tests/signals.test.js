import test from "node:test";
import assert from "node:assert/strict";
import { parseSignals } from "../shared/serial/signals.js";

test("parses multiple named numeric values with mixed separators", () => {
  assert.deepEqual(
    parseSignals("D4: 0 A4=799, A0: -3.5; temperature: 21.4"),
    { D4: 0, A4: 799, A0: -3.5, temperature: 21.4 }
  );
});

test("returns no values when a line contains no valid signal pairs", () => {
  assert.deepEqual(parseSignals("READY - waiting"), {});
});

test("keeps special object property names as ordinary signal values", () => {
  const values = parseSignals("__proto__: 10");
  assert.equal(Object.getPrototypeOf(values), Object.prototype);
  assert.equal(Object.hasOwn(values, "__proto__"), true);
  assert.equal(values.__proto__, 10);
});
