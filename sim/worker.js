import {AnalogRuntime} from "./analogRuntime.js";
import { UnoRuntime, F_CPU } from "./runtime.js";
let runtime = null,
  timer = null,
  paused = false,
  tx = [],
  refreshHz = 60;
function stop() {
  clearTimeout(timer);
  timer = null;
}
function turn() {
  if (!runtime || paused) return;
  try {
    const start = performance.now();
    runtime.advance(F_CPU / refreshHz);
    if (tx.length) {
      postMessage({ type: "serial", bytes: tx });
      tx = [];
    }
    postMessage({ type: "state", ...runtime.snapshot() });
    timer = setTimeout(
      turn,
      Math.max(0, 1000 / refreshHz - (performance.now() - start)),
    );
  } catch (e) {
    stop();
    postMessage({ type: "error", message: e.message });
  }
}
onmessage = ({ data: d }) => {
  try {
    if (d.type === "refresh")
      refreshHz = Math.max(10, Math.min(120, Number(d.hz) || 60));
    if (d.type === "start") {
      refreshHz = Math.max(10, Math.min(120, Number(d.refreshHz) || 60));
      stop();
      tx = [];
      runtime = d.topology.board === null ? new AnalogRuntime(d.topology,d.controls) : new UnoRuntime(d.hex, d.topology, d.controls, (b) =>
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
