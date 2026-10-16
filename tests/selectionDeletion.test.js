import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteCircuitSelection,
  isObjectDeleteShortcut,
  releaseReferenceStream,
} from "../sim/selectionDeletion.js";
test("any board can be deleted without deleting inserted parts and leaves valid surviving connections", () => {
  for (const type of [
    "wokwi-arduino-uno",
    "wokwi-arduino-nano",
    "wokwi-arduino-mega",
  ]) {
    const d = {
      parts: [{ id: "board", type }, { id: "led" }, { id: "pot" }],
      connections: [
        ["board:13", "led:A"],
        ["led:C", "pot:GND"],
      ],
      attachments: [["led:A", "board:13"]],
      detachedContacts: [["led:C", "board:GND.1"]],
      groups: [["board", "pot"]],
    };
    const next = deleteCircuitSelection(d, ["board"], []);
    assert.deepEqual(
      next.parts.map((p) => p.id),
      ["led", "pot"],
    );
    assert.deepEqual(next.connections, [["led:C", "pot:GND"]]);
    assert.deepEqual(next.attachments, []);
    assert.deepEqual(next.detachedContacts, []);
    assert.deepEqual(next.groups, []);
    assert.equal(d.parts.length, 3);
  }
});
test("mixed part and wire deletion removes exactly the selection", () => {
  const d = {
    parts: [{ id: "a" }, { id: "b" }, { id: "c" }],
    connections: [
      ["a:1", "b:1"],
      ["b:2", "c:2"],
      ["c:1", "@1,2"],
    ],
  };
  const next = deleteCircuitSelection(d, ["a"], [2]);
  assert.deepEqual(next.connections, [["b:2", "c:2"]]);
});
test("command delete works outside editable fields, including overlay buttons, while editor text deletion stays native", () => {
  const event = {
    key: "Backspace",
    metaKey: true,
    composedPath: () => [{ matches: () => false }],
  };
  assert.equal(isObjectDeleteShortcut(event), true);
  assert.equal(
    isObjectDeleteShortcut({
      ...event,
      key: "Delete",
      metaKey: false,
      ctrlKey: true,
    }),
    true,
  );
  assert.equal(isObjectDeleteShortcut({ ...event, repeat: true }), false);
  assert.equal(
    isObjectDeleteShortcut({
      ...event,
      composedPath: () => [{ matches: () => true }],
    }),
    false,
  );
});
test("deleting a capture releases only that media stream", () => {
  const stopped = [];
  const streams = new Map([
    ["camera", { getTracks: () => [{ stop: () => stopped.push("camera") }] }],
    ["other", { getTracks: () => [{ stop: () => stopped.push("other") }] }],
  ]);
  releaseReferenceStream(streams, "camera");
  assert.deepEqual(stopped, ["camera"]);
  assert.equal(streams.has("camera"), false);
  assert.equal(streams.has("other"), true);
});
