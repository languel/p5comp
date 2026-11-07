import test from "node:test";
import assert from "node:assert/strict";
import { createLessonPlayer } from "./lessonPlayer.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { flatten } from "./take.js";
const take = () => ({
  type: "ams-take",
  version: 1,
  title: "LED from scratch",
  duration: 2000,
  baseline: { elements: [], artboard: { width: 400, height: 300 } },
  meta: {
    p5comp: {
      state: {
        files: { "sketch.ino": "", "sketch.js": "" },
        diagram: { parts: [], connections: [] },
        signals: {},
      },
    },
  },
  clips: [
    {
      track: "code",
      file: "sketch.ino",
      diff: { from: 0, delete: 1, lines: ["const int LED_PIN = 13;"] },
      start: 500,
      dur: 1,
    },
    {
      track: "circuit",
      diff: {
        parts: [{ id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 }],
      },
      start: 1000,
      dur: 1,
    },
    { track: "say", text: "Add an Arduino Uno", start: 1000, dur: 1000 },
  ],
});
test("presentation seeks from empty source/circuit to the recorded construction without executing code", async () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "measureText"
          ? (s) => ({ width: String(s).length * 7 })
          : (...args) => {
              if (key === "fillText") calls.push(args[0]);
            },
      set: () => true,
    },
  );
  const canvas = { width: 1280, height: 720, getContext: () => ctx };
  const lesson = take(),
    player = createLessonPlayer(canvas, lesson);
  await player.ready;
  player.frame(0);
  assert.ok(calls.includes("Empty circuit — add an Arduino"));
  assert.ok(!calls.includes("const int LED_PIN = 13;"));
  calls.length = 0;
  player.frame(1200);
  assert.ok(calls.includes("const int LED_PIN = 13;"));
  assert.ok(calls.includes("Add an Arduino Uno"));
  assert.ok(calls.includes("uno"));
  calls.length = 0;
  player.seek(0);
  assert.ok(calls.includes("Empty circuit — add an Arduino"));
  assert.equal(lesson.meta.p5comp.state.files["sketch.ino"], "");
  assert.equal(player.time, 0);
  player.frame(Infinity);
  assert.equal(player.time, 2000);
});
test("standalone HTML uses stable raw function names and safely embeds source strings", () => {
  const coreSource = readFileSync(
    new URL("./take.js", import.meta.url),
    "utf8",
  );
  const playerSource = readFileSync(
    new URL("./lessonPlayer.js", import.meta.url),
    "utf8",
  );
  const source = readFileSync(
    new URL("./exportHTML.js", import.meta.url),
    "utf8",
  )
    .replace(/^import[^;]*;\s*/gm, "")
    .replace(/^export\s+/gm, "");
  const getHTML = new Function(
    "coreSource",
    "playerSource",
    "validateTake",
    "flatten",
    source + ";return takeToHTML;",
  )(coreSource, playerSource, () => {}, flatten);
  const lesson = take();
  lesson.title = '</script><img onerror="bad">';
  lesson.meta.p5comp.state.files["sketch.js"] = 'const message = "</script>";';
  const html = getHTML(lesson);
  assert.ok(html.includes("&lt;/script&gt;"));
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(!html.includes("createLessonPlayer.toString"));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, script] of scripts) new vm.Script(script);
});
