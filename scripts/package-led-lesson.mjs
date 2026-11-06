// Package a browser-recorded take. Only startup waiting and caption holds are edited.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { stateAt, validateTake } from "../shared/takes/take.js";
const result = JSON.parse(
  await readFile(
    process.argv[2] || "/tmp/p5comp-led-recording-result.json",
    "utf8",
  ),
);
const take = structuredClone(result.take),
  project = structuredClone(result.project);
assert.equal(take.meta.p5comp.state.files["sketch.ino"], "");
assert.equal(take.meta.p5comp.state.files["sketch.js"], "");
assert.equal(take.meta.p5comp.state.diagram.parts.length, 0);
const frames = take.clips.filter((c) => c.track === "frame");
assert.ok(frames.length >= 4, "The lesson must contain real preview frames.");
const packets = new Set(
  take.clips.filter((c) => c.meta?.dir === "rx").map((c) => c.text),
);
assert.ok(
  packets.has("0") && packets.has("1"),
  "Both LED states must be received from the simulator.",
);
const firstFrame = frames[0].start,
  run = take.clips
    .filter(
      (c) => c.track === "action" && c.name === "runP5" && c.start < firstFrame,
    )
    .at(-1);
const from = run ? run.start + 2500 : firstFrame,
  to = firstFrame - 300,
  removed = Math.max(0, to - from);
if (removed) {
  const map = (t) => (t <= from ? t : t < to ? from : t - removed);
  take.clips = take.clips
    .filter((c) => !(c.start >= from && c.start + c.dur <= to))
    .map((c) => ({
      ...c,
      start: map(c.start),
      dur: Math.max(1, map(c.start + c.dur) - map(c.start)),
    }));
  take.duration -= removed;
}
const captions = take.clips
  .filter((c) => c.track === "say" && !c.meta?.dir)
  .sort((a, b) => a.start - b.start);
for (let i = 0; i < captions.length; i++)
  captions[i].dur = Math.max(
    captions[i].dur,
    (captions[i + 1]?.start ?? take.duration) - captions[i].start,
  );
take.meta.lesson = {
  slug: "led-from-scratch",
  recipe: "scripts/record-led-lesson.mjs",
  simulated: true,
  capturedFrames: frames.length,
  edit: {
    startupWaitRemovedMs: removed,
    captionHolds: "until the next caption",
  },
};
validateTake(take);
const final = stateAt(take, take.duration);
assert.equal(final.files["sketch.ino"], project.arduino);
assert.equal(final.files["sketch.js"], project.p5.webserial);
assert.deepEqual(final.diagram.parts, project.diagram.parts);
assert.deepEqual(final.diagram.connections, project.diagram.connections);
project.workbench.takes = { "led-from-scratch.ams-take.json": take };
project.workbench.name = "Getting started · LED from scratch";
project.workbench.layout = "horizontal";
await mkdir("public/lessons", { recursive: true });
await writeFile(
  "public/lessons/led-from-scratch.ams-take.json",
  JSON.stringify(take, null, 2) + "\n",
);
await writeFile(
  "public/examples/led-from-scratch.json",
  JSON.stringify(project, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    duration: take.duration,
    clips: take.clips.length,
    frames: frames.length,
    removedWait: removed,
  }),
);
