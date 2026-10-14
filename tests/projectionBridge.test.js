import test from "node:test";
import assert from "node:assert/strict";
import { P5Bridge } from "../shared/p5/P5Bridge.js";
async function fixture(run) {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document,
    sent = [],
    listeners = new Map();
  globalThis.document = {
    baseURI: "http://localhost:8771/",
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
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    contentWindow: { postMessage: (message) => sent.push(message) },
  };
  const bridge = new P5Bridge(frame, {
    loadSandbox: async () => "<html><head></head><body></body></html>",
  });
  try {
    await run({
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
  fixture(async ({ bridge, frame, sent, receive }) => {
    bridge.mirror(true);
    assert.equal(frame.src, "original");
    assert.deepEqual(sent.at(-1), { type: "mirror", enabled: true });
    await bridge.run("function draw() {}");
    assert.match(frame.srcdoc, /sandbox.html/);
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

test("preview document fetch failures surface runtime errors instead of leaving a silent blank frame", () =>
  fixture(async ({ bridge }) => {
    const errors = [];
    bridge.addEventListener("runtimeError", (e) =>
      errors.push(e.detail.message),
    );
    bridge.loadSandbox = async () => {
      throw new Error("Preview could not load (404).");
    };
    await bridge.run("function setup(){}");
    assert.deepEqual(errors, ["Preview could not load (404)."]);
  }));
test("stopping a sketch prevents a delayed document load from restarting it", () =>
  fixture(async ({ bridge, frame }) => {
    let finish;
    bridge.loadSandbox = () => new Promise((resolve) => (finish = resolve));
    const loading = bridge.run("function setup(){}");
    bridge.stop();
    finish("<head></head>");
    await loading;
    assert.equal(frame.src, "about:blank");
    assert.equal(frame.srcdoc, undefined);
  }));
test("a stalled local preview logs its recovery and eventually reports an actionable startup timeout", () =>
  fixture(async ({ bridge, frame }) => {
    const errors = [],
      logs = [];
    bridge.startupTimeout = 10;
    bridge.addEventListener("runtimeError", (e) =>
      errors.push(e.detail.message),
    );
    bridge.addEventListener("console", (e) => logs.push(e.detail.values));
    await bridge.run("function setup(){}");
    await new Promise((resolve) => setTimeout(resolve, 45));
    assert.match(frame.src, /p5comp-preview\.localhost/);
    assert.equal(logs.length, 1);
    assert.match(errors[0], /after recovery/);
  }));

test("a recovered local runtime is reused without another opaque-frame startup delay", () =>
  fixture(async ({ bridge, frame, receive }) => {
    bridge.preferredRuntimeURL =
      "http://p5comp-preview.localhost:8771/shared/p5/sandbox.html";
    await bridge.run("function setup(){}");
    assert.match(frame.src, /p5comp-preview\.localhost/);
    assert.equal(frame.sandbox, "allow-scripts allow-same-origin");
    receive({ type: "loaded" });
    receive({ type: "ready" });
    await bridge.run("function draw(){}");
    assert.match(frame.src, /p5comp-preview\.localhost/);
    bridge.preferredRuntimeURL = null;
    await bridge.run("function setup(){}");
    assert.equal(frame.sandbox, "allow-scripts");
  }));

test("local recovery refuses the editor origin and keeps the primary srcdoc sandbox opaque", () =>
  fixture(async ({ bridge, frame }) => {
    const errors = [];
    bridge.addEventListener("runtimeError", (e) =>
      errors.push(e.detail.message),
    );
    bridge.preferredRuntimeURL = "http://localhost:8771/shared/p5/sandbox.html";
    await bridge.run("function setup(){}");
    assert.match(errors[0], /unsafe local preview origin/);
    assert.notEqual(frame.sandbox, "allow-scripts allow-same-origin");
  }));

test("a loaded document waiting on sketch setup reports a timeout without restarting preload", () =>
  fixture(async ({ bridge, frame, receive }) => {
    bridge.startupTimeout = 10;
    const failure = new Promise((resolve) =>
      bridge.addEventListener(
        "runtimeError",
        (e) => resolve(e.detail.message),
        { once: true },
      ),
    );
    await bridge.run("function preload(){}");
    receive({ type: "loaded" });
    const message = await failure;
    assert.equal(bridge.fallbackUsed, false);
    assert.match(frame.srcdoc, /sandbox.html/);
    assert.match(message, /Try Run p5 again/);
  }));
