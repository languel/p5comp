import { UnoRuntime, F_CPU } from "./runtime.js";
let runtime = null,
  timer = null,
  paused = false,
  tx = [];
function stop() {
  clearTimeout(timer);
  timer = null;
}
function turn() {
  if (!runtime || paused) return;
  try {
    const start = performance.now();
    runtime.advance(F_CPU / 50);
    if (tx.length) {
      postMessage({ type: "serial", bytes: tx });
      tx = [];
    }
    postMessage({ type: "state", ...runtime.snapshot() });
    timer = setTimeout(turn, Math.max(0, 20 - (performance.now() - start)));
  } catch (e) {
    stop();
    postMessage({ type: "error", message: e.message });
  }
}
onmessage = ({ data: d }) => {
  try {
    if (d.type === "start") {
      stop();
      tx = [];
      runtime = new UnoRuntime(d.hex, d.topology, d.controls, (b) =>
        tx.push(b),
      );
      paused = false;
      turn();
    }
    if (d.type === "controls") runtime?.setControls(d.controls);
    if (d.type === "write") runtime?.write(d.bytes);
    if (d.type === "pause") {
      paused = d.paused;
      stop();
      if (!paused) turn();
    }
    if (d.type === "stop") {
      stop();
      runtime = null;
      tx = [];
    }
  } catch (e) {
    postMessage({ type: "error", message: e.message });
  }
};
