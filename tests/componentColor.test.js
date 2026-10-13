import test from "node:test";
import assert from "node:assert/strict";
import { componentColor } from "../sim/componentColor.js";
test("native component color clears previous tint, keeps unrelated attributes and restores defaults", () => {
  const attrs = {
    color: "green",
    tint: "#123456",
    appearance: "gray",
    brightness: 0.5,
  };
  assert.deepEqual(componentColor(attrs, "#658eac", true), {
    color: "#658eac",
    appearance: "original",
    brightness: 0.5,
  });
  assert.deepEqual(componentColor(attrs, null, true, true), {
    appearance: "original",
    brightness: 0.5,
  });
  assert.equal(attrs.color, "green");
});
test("components without native color still support tint and original appearance", () => {
  assert.deepEqual(componentColor({}, "#658eac", false), {
    tint: "#658eac",
    appearance: "gray",
  });
  assert.deepEqual(componentColor({ tint: "#658eac" }, null, false, true), {
    tint: null,
    appearance: "original",
  });
});
