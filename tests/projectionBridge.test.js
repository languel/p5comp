import test from "node:test";
import assert from "node:assert/strict";
import { P5Bridge } from "../shared/p5/P5Bridge.js";
function fixture(run) {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document,
    sent = [],
    listeners = new Map();
  globalThis.document = {
    documentElement: { dataset: { theme: "dark" } },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const frame = {
    ownerDocument: document,
    src: "original",
    contentWindow: { postMessage: (message) => sent.push(message) },
  };
  const bridge = new P5Bridge(frame);
  try {
    run({
      bridge,
      frame,
      sent,
      receive: (data) =>
        listeners.get("message")({ source: frame.contentWindow, data }),
      foreign: (data) => listeners.get("message")({ source: {}, data }),
    });
  } finally {
    bridge.dispose();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
}
test("projection requests keep the original iframe and restore mirroring after sketch reload", () =>
  fixture(({ bridge, frame, sent, receive }) => {
    bridge.mirror(true);
    assert.equal(frame.src, "original");
    assert.deepEqual(sent.at(-1), { type: "mirror", enabled: true });
    bridge.run("function draw() {}");
    assert.match(frame.src, /sandbox.html/);
    receive({ type: "loaded" });
    assert.deepEqual(sent.at(-1), { type: "mirror", enabled: true });
    assert.ok(
      sent.some((m) => m.type === "run" && m.source === "function draw() {}"),
    );
    bridge.mirror(false);
    assert.deepEqual(sent.at(-1), { type: "mirror", enabled: false });
  }));
test("only the actual editor iframe can supply mirrored pixels, serial writes remain on the same bridge", () =>
  fixture(({ bridge, receive, foreign }) => {
    const frames = [],
      writes = [];
    bridge.onSerialWrite = (bytes) => writes.push([...bytes]);
    bridge.addEventListener("mirrorFrame", (e) => frames.push(e.detail.image));
    foreign({ type: "mirrorFrame", image: "foreign" });
    receive({ type: "mirrorFrame", image: "editor pixels" });
    receive({ type: "serialWrite", bytes: [76, 69, 68] });
    assert.deepEqual(frames, ["editor pixels"]);
    assert.deepEqual(writes, [[76, 69, 68]]);
  }));
