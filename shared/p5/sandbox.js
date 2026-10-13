import { basePath } from "../basePath.js";
import p5 from "p5";
import { installSerialProxy } from "./serialProxy.js";

const serialProxy = installSerialProxy((bytes) =>
  parent.postMessage({ type: "serialWrite", bytes }, "*"),
);
window.p5 = p5;
// The real p5.webserial library, scoped to this frame's host-managed transport.
const webserialScript = document.createElement("script");
webserialScript.src = basePath("libraries/p5.webserial.js");
webserialScript.onload = () => parent.postMessage({ type: "loaded" }, "*");
webserialScript.onerror = () =>
  parent.postMessage(
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
window.serialConnected = false;
window.send = (name, value) => {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new TypeError("send(name, value) requires a valid signal name.");
  }
  if (!Number.isFinite(Number(value))) {
    throw new TypeError("send(name, value) requires a numeric value.");
  }
  parent.postMessage({ type: "send", name, value: Number(value) }, "*");
};
window.sendLine = (text) => {
  if (typeof text !== "string")
    throw new TypeError("sendLine(text) requires a string.");
  parent.postMessage({ type: "sendLine", text }, "*");
};

const safeValue = (value) => {
  if (typeof value === "string") return value;
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
    parent.postMessage(
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
  parent.postMessage(
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
  parent.postMessage(
    { type: "runtimeError", message: String(event.reason) },
    "*",
  );
});

window.addEventListener("message", (event) => {
  if (event.source !== parent || !event.data) return;
  const message = event.data;
  if (message.theme) {
    window.theme = message.theme;
    document.documentElement.dataset.theme = message.theme;
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
        parent.postMessage(
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
  try {
    window.eval(`${message.source}\n//# sourceURL=student-sketch.js`);
    p5Instance = new p5(undefined, document.getElementById("canvas"));
    sketchReady = true;
    parent.postMessage({ type: "ready" }, "*");
  } catch (error) {
    parent.postMessage(
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
