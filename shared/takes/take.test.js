import test from "node:test";
import assert from "node:assert/strict";
import {
  diffText,
  applyText,
  diffState,
  stateAt,
  TakeRecorder,
  validateTake,
  flatten,
} from "./take.js";
const state = () => ({
  files: { "sketch.js": "one\ntwo\nthree" },
  diagram: { parts: [], connections: [] },
  signals: {},
});
test("line diffs reproduce insertions, deletions, empty sources and final newline", () => {
  for (const [a, b] of [
    ["", ""],
    ["", "a"],
    ["a", ""],
    ["a\nb", "a\nx\nb"],
    ["a\nb\nc", "a\nc"],
    ["a", "a\n"],
    ["a\nb", "a\nx"],
  ]) {
    const diff = diffText(a, b);
    assert.equal(diff ? applyText(a, diff) : a, b);
  }
});
test("seek reconstructs edits, removed files, circuits and signals without changing baseline", () => {
  const before = state(),
    after = state();
  after.files["sketch.js"] = "one\nchanged\nthree";
  after.files["extra.js"] = "";
  after.diagram.parts = [{ id: "led", type: "wokwi-led" }];
  const take = {
    meta: { p5comp: { state: before } },
    clips: diffState(before, after).map((c) => ({ ...c, start: 10, dur: 1 })),
    tracks: [],
  };
  take.clips.push(
    { track: "signal", name: "sensor", value: 512, start: 20, dur: 1 },
    { track: "code", file: "extra.js", removed: true, start: 30, dur: 1 },
  );
  assert.deepEqual(stateAt(take, 0), before);
  assert.deepEqual(stateAt(take, 10).files, after.files);
  assert.equal(stateAt(take, 20).signals.sensor, 512);
  assert.equal("extra.js" in stateAt(take, 30).files, false);
  assert.deepEqual(stateAt(take, 0), before);
});
test("one compressed clock aligns host clips and embed drawing clips", () => {
  let now = 0;
  const r = new TakeRecorder({ now: () => now });
  r.start({ title: "Test", state: state(), project: {} });
  now = 10000;
  r.push({ track: "action", name: "run" });
  const take = r.stop(
    {
      baseline: { elements: [] },
      clips: [{ track: "draw", start: 9900, dur: 100, diff: { add: [] } }],
    },
    100,
  );
  const draw = take.clips.find((c) => c.track === "draw"),
    action = take.clips.find((c) => c.track === "action");
  assert.equal(draw.start, action.start);
  assert.ok(take.duration < 5000);
  assert.equal(r.take, null);
  assert.equal(validateTake(take), take);
});
test("signals are sampled at no more than 20Hz per name and unchanged values are omitted", () => {
  let now = 0;
  const r = new TakeRecorder({ now: () => now });
  r.start({ title: "T", state: state(), project: {} });
  r.signal("pot", 0);
  now = 10;
  r.signal("pot", 1);
  now = 50;
  r.signal("pot", 2);
  now = 100;
  r.signal("pot", 2);
  assert.deepEqual(
    r
      .stop()
      .clips.filter((c) => c.track === "signal")
      .map((c) => c.value),
    [0, 2],
  );
});
test("compositions scale clocks, inherit mute and ignore unknown kinds", () => {
  const take = {
    meta: { p5comp: { state: state() } },
    tracks: [{ id: "off", muted: true }],
    clips: [
      {
        track: "comp",
        start: 100,
        dur: 100,
        rate: 2,
        comp: {
          clips: [{ track: "signal", name: "x", value: 5, start: 40, dur: 10 }],
        },
      },
      { track: "signal", lane: "off", name: "x", value: 10, start: 0, dur: 1 },
      { track: "future-kind", start: 0, dur: 10 },
    ],
  };
  assert.equal(flatten(take).find((c) => c.value === 5).start, 120);
  assert.equal(stateAt(take, 119).signals.x, undefined);
  assert.equal(stateAt(take, 120).signals.x, 5);
});
test("invalid files and malformed diff/timing are rejected on import", () => {
  const take = { type: "ams-take", version: 1, clips: [] };
  for (const clip of [
    { track: "code", file: "__proto__", start: 0, dur: 1 },
    { track: "signal", name: "__proto__", value: 1, start: 0, dur: 1 },
    {
      track: "code",
      file: "x.js",
      diff: { from: -1, delete: 0, lines: [] },
      start: 0,
      dur: 1,
    },
    { track: "say", start: NaN, dur: 1 },
  ])
    assert.throws(() => validateTake({ ...take, clips: [clip] }));
});
