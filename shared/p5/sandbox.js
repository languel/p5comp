import { basePath } from "../basePath.js";
const legacyP5 = document.querySelector('meta[name="p5comp-p5-major"]')?.content === "1" || new URLSearchParams(location.search).get("p5") === "1";
const {default: p5} = await (legacyP5 ? import("p5-v1") : import("p5"));
function lifecycleHook(modern, legacy, callback) {
  if (p5.registerAddon) p5.registerAddon((_p5, _prototype, lifecycles) => { lifecycles[modern] = callback; });
  else p5.prototype.registerMethod(legacy, callback);
}
import { installSerialProxy } from "./serialProxy.js";

let host = parent;
const detached =
  new URLSearchParams(location.search).get("detached") === "1" ||
  document.querySelector('meta[name="p5comp-detached"]')?.content === "1";
const appOrigin = new URL(import.meta.url).origin;
let mirrorEnabled = false,
  mirrorFailed = false,
  mirrorAt = 0;
const mirroredControls = new Map();
const mirrorIds = new WeakMap();
let nextMirrorId = 0;
function mirrorControls() {
  mirroredControls.clear();
  return [...document.querySelectorAll('button, input[type="range"], select')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    .map(el => {
      if (!mirrorIds.has(el)) mirrorIds.set(el, String(++nextMirrorId));
      const id = mirrorIds.get(el);
      mirroredControls.set(id, el);
      return { id, tag: el.localName, text: el.textContent, value: el.value,
        label: el.getAttribute('aria-label') || el.title || (el.localName === 'button' ? el.textContent : el.previousElementSibling?.textContent) || '',
        min: el.min, max: el.max, step: el.step, disabled: el.disabled,
        pressed: el.getAttribute('aria-pressed'),
        options: el.options ? [...el.options].map(o => ({value:o.value,text:o.text})) : undefined };
    });
}
function mirrorRender() {
  if (!mirrorEnabled || mirrorFailed || performance.now() - mirrorAt < 80)
    return;
  const canvas = document.querySelector("canvas");
  if (!canvas) return;
  mirrorAt = performance.now();
  try {
    host.postMessage(
      { type: "mirrorFrame", image: canvas.toDataURL("image/png"), controls: mirrorControls() },
      "*",
    );
  } catch {
    mirrorFailed = true;
    host.postMessage(
      {
        type: "mirrorError",
        message:
          "This canvas contains an image/video that blocks browser pixel capture. Use CORS-enabled assets for projection.",
      },
      "*",
    );
  }
}
let lastDraw = 0,
  lastSize = "";
lifecycleHook("postdraw", "post", () => {
  lastDraw = performance.now();
  if (p5Instance?.canvas) {
    const size = `${p5Instance.width},${p5Instance.height}`;
    if (size !== lastSize) {
      lastSize = size;
      host.postMessage(
        {
          type: "renderSize",
          width: p5Instance.width,
          height: p5Instance.height,
        },
        "*",
      );
    }
  }
  mirrorRender();
});
setInterval(() => {
  // Keep a looping sketch responsive on the projector when its editor tab is hidden.
  if (
    mirrorEnabled &&
    p5Instance?.isLooping() &&
    performance.now() - lastDraw > 150
  )
    p5Instance.redraw();
  mirrorRender();
}, 80);
const serialProxy = installSerialProxy((bytes) =>
  host.postMessage({ type: "serialWrite", bytes }, "*"),
);
window.p5 = p5;
// The real p5.webserial library, scoped to this frame's host-managed transport.
const webserialScript = document.createElement("script");
webserialScript.src = basePath("libraries/p5.webserial.js");
webserialScript.onload = () => host.postMessage({ type: "loaded" }, "*");
webserialScript.onerror = () =>
  host.postMessage(
    {
      type: "runtimeError",
      message: "The local p5.webserial library could not load.",
    },
    "*",
  );

const signals = {};
const pins = {};
const pinObjects = new Map();
let sketchReady = false;
let p5Instance = null;

window.signals = signals;
window.pins = pins;
window.pin = (name) => pins[name];
window.p5compHostSerial = true;
window.serialConnected = false;
window.send = (name, value) => {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new TypeError("send(name, value) requires a valid signal name.");
  }
  if (!Number.isFinite(Number(value))) {
    throw new TypeError("send(name, value) requires a numeric value.");
  }
  host.postMessage({ type: "send", name, value: Number(value) }, "*");
};
window.sendLine = (text) => {
  if (typeof text !== "string")
    throw new TypeError("sendLine(text) requires a string.");
  host.postMessage({ type: "sendLine", text }, "*");
};

const safeValue = (value) => {
  if (typeof value === "string") return value;
  if (value?.message) return {message: value.message, stack: value.stack};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
};

for (const level of ["log", "warn", "error", "info", "debug"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    host.postMessage(
      {
        type: "console",
        level,
        values: args.map(safeValue),
      },
      "*",
    );
  };
}

window.addEventListener("error", (event) => {
  host.postMessage(
    {
      type: "runtimeError",
      message: event.message,
      line: event.lineno,
      column: event.colno,
    },
    "*",
  );
});
window.addEventListener("unhandledrejection", (event) => {
  host.postMessage(
    { type: "runtimeError", message: event.reason?.message || JSON.stringify(event.reason) || String(event.reason) },
    "*",
  );
});

window.addEventListener("message", async (event) => {
  if (!event.data) return;
  // A detached iframe has a new parent. Its original workbench establishes the
  // transport host with a same-origin state message before sending sketch code.
  if (detached && event.data.type === "state" && event.origin === appOrigin)
    host = event.source;
  if (event.source !== host) return;
  const message = event.data;
  if (message.theme) {
    window.theme = message.theme;
    document.documentElement.dataset.theme = message.theme;
  }
  if (message.type === "mirrorControl") {
    const el = mirroredControls.get(message.id);
    if (!mirrorEnabled || !el?.isConnected || el.disabled) return;
    if (el.localName === 'button') {
      el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,button:0,pointerType:'mouse'}));
      el.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,button:0,pointerType:'mouse'}));
      el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,button:0}));
      el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,button:0}));
      el.click();
    }
    else {
      el.value = String(message.value);
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
    return;
  }
  if (message.type === "mirror") {
    mirrorEnabled = !!message.enabled;
    mirrorFailed = false;
    mirrorAt = 0;
    mirrorRender();
    return;
  }
  if (message.type === "closeSerial") {
    p5Instance?.noLoop();
    window.serialConnected = false;
    // End pending reads first, so adapters can release reader/writer locks.
    serialProxy.reset();
    Promise.resolve(window.arduinoComms?.disconnect?.())
      .catch(() => {})
      .finally(() => {
        host.postMessage(
          { type: "serialClosed", requestId: message.requestId },
          "*",
        );
      });
    return;
  }
  if (message.type === "theme") return;
  if (message.type === "state") {
    serialProxy.setConnected(
      Boolean(message.serialConnected),
      message.transportMode,
    );
    for (const [name, value] of Object.entries(message.signals ?? {})) {
      Object.defineProperty(signals, name, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    window.serialConnected = Boolean(message.serialConnected);
    return;
  }
  if (message.type === "serialBytes") {
    serialProxy.receive(message.bytes);
    return;
  }
  if (message.type === "pins") {
    const exposed = {};
    for (const pin of message.values ?? []) {
      let current = pinObjects.get(pin.id);
      if (!current) {
        current = {
          id: pin.id,
          pin: pin.pin,
          value: pin.value,
          mode: pin.mode,
        };
        pinObjects.set(pin.id, current);
      }
      current.pin = pin.pin;
      current.value = pin.value;
      current.mode = pin.mode;
      current.write = (value) =>
        host.postMessage(
          {
            type: "pinWrite",
            name: pin.id,
            value,
          },
          "*",
        );
      exposed[pin.id] = current;
      if (pin.alias) exposed[pin.alias] = current;
    }
    for (const key of Object.keys(pins)) delete pins[key];
    Object.assign(pins, exposed);
    return;
  }
  if (message.type !== "run" || sketchReady) return;
  sketchReady = true;
  try {
    const project = message.project || {},
      assets = project.assets || {};
    const parsed = new DOMParser().parseFromString(
      project.html || '<main id="canvas"></main>',
      "text/html",
    );
    const scripts = [...parsed.querySelectorAll("script")];
    scripts.forEach((s) => s.remove());
    if (project.html) {
      document.body.replaceChildren(...parsed.body.childNodes);
      if (!document.getElementById("canvas")) {
        const container = document.createElement("main");
        container.id = "canvas";
        document.body.append(container);
      }
    }
    for (const element of document.querySelectorAll("[src],[href]"))
      for (const attribute of ["src", "href"]) {
        const path = element.getAttribute(attribute)?.replace(/^\.\//, "");
        if (assets[path]) element.setAttribute(attribute, assets[path].src);
      }
    const style = document.createElement("style");
    style.textContent = (
      [...parsed.querySelectorAll("style")]
        .map((s) => s.textContent)
        .join("\n") +
      "\n" +
      (project.css || "")
    ).replace(/url\(["']?([^"')]+)["']?\)/g, (whole, path) =>
      assets[path.replace(/^\.\//, "")]
        ? 'url("' + assets[path.replace(/^\.\//, "")].src + '")'
        : whole,
    );
    document.head.append(style);
    for (const link of parsed.querySelectorAll('link[rel="stylesheet"]')) {
      const href = link.getAttribute("href"),
        name = href?.replace(/^\.\//, "");
      if (name?.endsWith(".css") && !/^https?:/.test(href) && !assets[name])
        continue;
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = assets[name]?.src || href;
      document.head.append(stylesheet);
    }
    for (const s of scripts) {
      const src = s.getAttribute("src");
      if (!src) continue;
      const name = src.replace(/^\.\//, "");
      if (
        name === "p5.js" ||
        /p5\.webserial(?:\.min)?\.js$/.test(src) ||
        /p5(?:\.min)?\.js$/.test(src) ||
        name === project.mainName ||
        project.sourceNames?.includes(name)
      )
        continue;
      if (!assets[name] && !/^https?:\/\//.test(src))
        throw new Error(
          `Library ${src} is not in the project assets. Import the file or use a full URL.`,
        );
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = assets[name]?.src || src;
        script.onload = resolve;
        script.onerror = () =>
          reject(new Error(`Library ${src} could not load.`));
        document.head.append(script);
      });
    }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options) =>
      nativeFetch(
        typeof input === "string" && assets[input.replace(/^\.\//, "")]
          ? assets[input.replace(/^\.\//, "")].src
          : input,
        options,
      );
    for (const method of [
      "loadImage",
      "loadSound",
      "loadFont",
      "loadJSON",
      "loadStrings",
      "loadTable",
    ]) {
      const original = p5.prototype[method];
      if (original)
        p5.prototype[method] = function (path, ...args) {
          return original.call(
            this,
            typeof path === "string" && assets[path.replace(/^\.\//, "")]
              ? assets[path.replace(/^\.\//, "")].src
              : path,
            ...args,
          );
        };
    }
    for (const script of scripts.filter((s) => !s.getAttribute("src")))
      window.eval(script.textContent);
    window.eval(`${message.source}\n//# sourceURL=student-sketch.js`);
    lifecycleHook("postsetup", "afterSetup", () =>
      host.postMessage({ type: "ready" }, "*"),
    );
    p5Instance = new p5(undefined, document.getElementById("canvas"));
    sketchReady = true;
  } catch (error) {
    host.postMessage(
      {
        type: "runtimeError",
        message: error.message,
        stack: error.stack,
      },
      "*",
    );
  }
});

document.head.append(webserialScript);
