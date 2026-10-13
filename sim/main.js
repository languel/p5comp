import { Workbench } from "./Workbench.js";
import { basePath } from "../shared/basePath.js";
import { BREADBOARD_HOLE_RADIUS } from "./partGeometry.js";
import { ElementPicker, PartDocs } from "./ElementPicker.js";
import { elementByType } from "./elements.js";
import { initializeCompactUI } from "./compactUI.js";
import { SonarSimulator } from "./SonarSimulator.js";
import "./style.css";
import "@wokwi/elements";
import { CircuitCanvas } from "./CircuitCanvas.js";
import { initializeTheme } from "../shared/ui/theme.js";
import { createEditor } from "../shared/editor/createEditor.js";
import { P5Bridge } from "../shared/p5/P5Bridge.js";
import { SerialConnection } from "../shared/serial/SerialConnection.js";
import { flashUno } from "../shared/serial/UnoUploader.js";
import {
  classroomCircuit,
  resolveCircuit,
  validateDiagram,
  TYPES,
} from "./circuit.js";
import {
  webserialSketch,
  nativeSketch,
  upgradeClassSketchTheme,
} from "./examples.js";
import lessonSource from "./classroom.ino?raw";

const $ = (id) => document.getElementById(id),
  workspace = new URLSearchParams(location.search).get("workspace"),
  key =
    "physical-p5.circuit-project.v1" +
    (workspace ? ":" + workspace.slice(0, 64) : "");
initializeTheme();
let savedCanvas = {},
  workbench = null,
  savedWorkbench = {};
let diagram = classroomCircuit(),
  controls = { pot: 512, sonar: 100, b1: false, b2: false },
  api = "webserial",
  savedP5 = {},
  artifact = null;
try {
  const d = JSON.parse(localStorage.getItem(key) || "null");
  if (d) {
    validateDiagram(d.diagram);

    diagram = d.diagram;
    controls = d.controls || controls;
    api = d.api === "native" ? "native" : "webserial";
    savedP5 = Object.fromEntries(
      Object.entries(d.p5 || {}).map(([api, source]) => [
        api,
        upgradeClassSketchTheme(source),
      ]),
    );
    artifact = d.artifact || null;
    savedCanvas = d.canvas || {};
    savedWorkbench = d.workbench || {};
  }
} catch (e) {
  console.warn("Using classroom circuit:", e.message);
}
let compiling = false;
let running = false,
  paused = false,
  mode = "simulation",
  worker = null,
  wireMode = false,
  selectedWire = -1,
  selectedPart = null,
  serialBuffer = "",
  lastPacket = "",
  lines = [],
  topology = null;
const serial = new SerialConnection();
const log = (line) => {
  lines.push(line);
  if (!/^[←→]/.test(line)) workbench?.buildLog(line);
  if (lines.length > 150) lines.shift();
  $("log").textContent = lines.join("\n");
  $("log").scrollTop = $("log").scrollHeight;
};
const notice = (message) => {
  $("notice").hidden = !message;
  $("notice").textContent = message || "";
};
const status = (s) => ($("status").textContent = s);
function sourceValue(editor) {
  return editor.state.doc.toString();
}
let initialSource = lessonSource;
try {
  const d = JSON.parse(localStorage.getItem(key) || "null");
  if (typeof d?.arduino === "string") initialSource = d.arduino;
} catch {}
const arduinoEditor = createEditor({
  parent: $("arduinoEditor"),
  value: initialSource,
  language: "cpp",
  onChange: () => {
    persist();
    $("firmwareState").textContent = "Code edited · run to compile";
    updateConnection();
  },
  onRun: runArduino,
  onUpload: () => $("compileUpload").click(),
});
const p5Editor = createEditor({
  parent: $("p5Editor"),
  value: savedP5[api] || (api === "native" ? nativeSketch : webserialSketch),
  language: "javascript",
  onChange: () => {
    persist();
    workbench?.scheduleP5();
  },
  onRun: runP5,
});
$("comms").value = api;
const bridge = new P5Bridge($("p5Frame"), {
  onSerialWrite: writeBytes,
  onSend: (n, v) => writeBytes(new TextEncoder().encode(`${n}:${v}\n`)),
  onSendLine: (text) => writeBytes(new TextEncoder().encode(text + "\n")),
});
bridge.addEventListener("console", (e) => {
  if (e.detail.level === "error") {
    log("p5: " + e.detail.values.join(" "));
    notice(e.detail.values.join(" "));
  }
});
bridge.addEventListener("runtimeError", (e) => {
  log("p5 error: " + e.detail.message);
  notice("p5: " + e.detail.message);
});

function persist() {
  savedP5[api] = sourceValue(p5Editor);
  try {
    localStorage.setItem(key, JSON.stringify(project()));
  } catch {
    notice("Browser storage is full. Save the project to a file.");
  }
}
function project() {
  return {
    version: 2,
    workbench: workbench?.snapshot() || savedWorkbench,
    canvas: canvas.getState(),
    diagram,
    controls,
    api,
    p5: { ...savedP5, [api]: sourceValue(p5Editor) },
    arduino: sourceValue(arduinoEditor),
    artifact,
  };
}
function setCode(editor, text) {
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: text },
  });
}
function updateConnection() {
  workbench?.uploadState(serial.connected);
  bridge.updateState({}, running || (mode === "usb" && serial.connected), mode);
  $("upload").disabled =
    !artifact ||
    artifact.source !== sourceValue(arduinoEditor) ||
    mode !== "usb" ||
    !serial.connected;
}
function runP5() {
  updateConnection();
  bridge.run(
    workbench?.p5Source() || sourceValue(p5Editor),
    workbench?.p5Project() || {},
  );
}

function receive(bytes) {
  bridge.serialBytes(bytes);
  serialBuffer += new TextDecoder().decode(Uint8Array.from(bytes));
  const chunks = serialBuffer.split("\n");
  serialBuffer = chunks.pop();
  if (serialBuffer.length > 8192) serialBuffer = "";
  for (const raw of chunks) {
    const line = raw.trim();
    if (!line) continue;
    log("← " + line);
    const v = line.split(",").map(Number);
    if (v.length === 4 && v.every(Number.isFinite)) {
      $("packet").textContent = line;
      lastPacket = line;
    }
  }
}
async function writeBytes(bytes) {
  try {
    if (mode === "usb") {
      await serial.write(bytes);
    } else {
      if (!running)
        throw new Error("Start the Uno before sending serial data.");
      worker.postMessage({ type: "write", bytes: Array.from(bytes) });
    }
    log("→ " + new TextDecoder().decode(bytes).trim());
  } catch (e) {
    notice(e.message);
  }
}

async function getFirmware() {
  const source = sourceValue(arduinoEditor);
  const files = workbench?.arduinoFiles() || {};
  const buildKey = source + JSON.stringify(files);
  if (
    artifact?.buildKey === buildKey &&
    artifact?.source === source &&
    typeof artifact.hex === "string"
  )
    return artifact.hex;
  if (!Object.keys(files).length && source.trim() === lessonSource.trim()) {
    const response = await fetch(basePath("sim/classroom.hex"));
    if (!response.ok) throw new Error("Bundled classroom HEX could not load.");
    const hex = await response.text();
    artifact = { source, buildKey, hex };
    $("firmwareState").textContent = "Bundled lesson firmware";
    persist();
    return hex;
  }
  status("Compiling locally…");
  log("Compiling Arduino Uno…");
  let response;
  try {
    response = await fetch(
      workbench?.compilerURL() || basePath("api/compile"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: "uno", source, files }),
      },
    );
  } catch {
    throw new Error(
      "Edited Arduino code needs the local compilation helper. The bundled lesson runs without it.",
    );
  }
  const result = await response.json();
  log(result.stdout || "");
  if (!result.ok) throw new Error(result.stderr || "Compilation failed.");
  artifact = { source, buildKey, hex: result.hex };
  $("firmwareState").textContent = "Compiled locally · cached in project";
  log("Compilation complete · firmware cached.");
  persist();
  return result.hex;
}
function startWorker(hex) {
  worker?.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data: d }) => {
    if (d.type === "serial") receive(d.bytes);
    if (d.type === "state") {
      $("clock").textContent = d.seconds.toFixed(2) + " s";
      $("led").dataset.on = String(d.led);
      $("led").textContent = "LED 13 · " + (d.led ? "on" : "off");
      document.querySelector("wokwi-arduino-uno").led13 = d.led;
      for (const [id, state] of Object.entries(d.parts || {})) {
        const element = partElements.get(id);
        if (!element) continue;
        element.dataset.simulation = JSON.stringify(state);
        if (element.tagName === "WOKWI-LED") {
          element.value = state.lit;
          element.brightness =
            state.brightness *
            Number(
              diagram.parts.find((p) => p.id === id)?.attrs?.brightness ?? 1,
            );
        }
        element.title =
          `${id} · ${(state.current * 1000).toFixed(1)} mA` +
          (state.power != null
            ? ` · ${(state.power * 1000).toFixed(1)} mW`
            : "") +
          (state.warning ? " · " + state.warning : "");
      }
      workbench?.showPartState();
    }
    if (d.type === "error") {
      stop();
      notice(d.message);
      log("emulator: " + d.message);
    }
  };
  worker.onerror = (e) => {
    stop();
    notice(e.message || "Emulator worker failed.");
  };
  serialBuffer = "";
  worker.postMessage({ type: "start", hex, topology, controls });
  running = true;
  paused = false;
  $("pause").disabled = false;
  $("pause").textContent = "Pause";
  status("Running · simulated Uno");
  updateConnection();
  document.querySelector("wokwi-arduino-uno").ledPower = true;
}
async function runArduino() {
  if (compiling) return;
  compiling = true;
  $("run").disabled = true;
  $("compile").disabled = true;
  notice("");
  try {
    if (mode === "usb") {
      await serial.disconnect();
      mode = "simulation";
    }
    topology = resolveCircuit(diagram);
    showHealth();
    const hex = await getFirmware();
    startWorker(hex);
    runP5();
    persist();
  } catch (e) {
    stop();
    notice(e.message);
    log(e.message);
    $("code").open = sourceValue(arduinoEditor).trim() !== lessonSource.trim();
  } finally {
    compiling = false;
    $("run").disabled = false;
    $("compile").disabled = false;
  }
}
function stop() {
  worker?.terminate();
  worker = null;
  running = false;
  paused = false;
  $("pause").disabled = true;
  status("Stopped · simulated Uno");
  const board = document.querySelector("wokwi-arduino-uno");
  if (board) board.ledPower = false;
  for (const element of partElements.values()) {
    delete element.dataset.simulation;
    if (element.tagName === "WOKWI-LED") {
      element.value = false;
      element.brightness = 0;
    }
  }
  workbench?.showPartState();
  updateConnection();
}
function showHealth() {
  try {
    topology = resolveCircuit(diagram);
    $("circuitHealth").textContent = topology.warnings.length
      ? topology.warnings.join(" ")
      : "Wiring ready · Uno at 16 MHz";
    const visual = diagram.parts.filter(
      (p) =>
        !elementByType.get(p.type)?.modeled &&
        !["wokwi-led", "wokwi-resistor"].includes(p.type),
    ).length;
    if (visual) $("circuitHealth").textContent += ` · ${visual} unmodeled`;
    $("circuitHealth").style.color = topology.warnings.length ? "#a76d50" : "";
  } catch (e) {
    $("circuitHealth").textContent = e.message;
    $("circuitHealth").style.color = "#a76d50";
    topology = null;
  }
}
function changed() {
  showHealth();
  persist();
  renderWires();
  if (running) {
    if (!topology) {
      stop();
      notice("Fix the circuit fault before running.");
    } else {
      startWorker(artifact.hex);
      log("Circuit changed · Uno restarted.");
    }
  }
}

const partElements = new Map();
const canvas = new CircuitCanvas({
  stage: $("stage"),
  world: $("world"),
  wires: $("wires"),
  saved: savedCanvas,
  onChange: ({ nets }) => {
    if (nets) {
      notice("");
      changed();
    } else {
      persist();
      renderWires();
    }
  },
  onSelectWire: selectWire,
  onDocs: (id) => {
    partDocs.open(
      diagram.parts.find((p) => p.id === id),
      partElements.get(id),
    );
    workbench?.tab("help");
  },
  onRename: (wrapper) =>
    workbench?.editLabel(
      wrapper,
      diagram.parts.find((p) => p.id === wrapper.dataset.id),
    ),
  onSelectPart: (id) => {
    selectedPart = id;
    workbench?.selectPart(id);
    $("removePart").disabled =
      !id || id === diagram.parts.find((p) => p.type === TYPES[0])?.id;
    $("partTint").disabled = !id;
    $("grayTint").disabled = !id;
    $("originalTint").disabled = !id;
    $("partTint").value =
      diagram.parts.find((p) => p.id === id)?.attrs?.tint || "#87918c";
    document
      .querySelectorAll(".part")
      .forEach((el) => el.classList.toggle("selected", el.dataset.id === id));
  },
  onRestore: (d) => {
    const netKey = (x) =>
      JSON.stringify([
        x.parts.map((p) => [p.id, p.type]),
        x.connections.map((c) => c.slice(0, 2)),
      ]);
    const nets = netKey(diagram) !== netKey(d);
    const partsChanged =
      JSON.stringify(diagram.parts) !== JSON.stringify(d.parts);
    diagram = d;
    canvas.clearSelection();
    selectedWire = -1;
    selectedPart = null;
    wireMode = false;
    if (!d.parts.some((p) => p.id === sonarSimulator.id))
      sonarSimulator.panel.hidden = true;
    if (partsChanged) renderParts();
    else renderWires();
    if (nets) changed();
    else persist();
  },
  onViewChange: () => {
    $("zoomLabel").textContent = Math.round(canvas.camera.zoom * 100) + "%";
    if (typeof p5Editor !== "undefined") persist();
  },
});
$("zoomIn").onclick = () => canvas.zoomAt(1.2);
$("zoomOut").onclick = () => canvas.zoomAt(1 / 1.2);
$("fit").onclick = () => canvas.fit();
$("snap").checked = canvas.snap;
$("orthogonal").checked = canvas.orthogonal;
$("snap").onchange = () => {
  canvas.snap = $("snap").checked;
  persist();
};
$("orthogonal").onchange = () => {
  canvas.orthogonal = $("orthogonal").checked;
  persist();
};
$("wireColor").oninput = () => canvas.setColor($("wireColor").value);
$("partTint").oninput = () => canvas.setTint($("partTint").value);
$("grayTint").onclick = () => canvas.setTint(null);
$("originalTint").onclick = () => canvas.setTint(null, true);
$("gridReference").value = canvas.gridReference;
$("gridReference").onchange = () => {
  canvas.gridReference = $("gridReference").value;
  canvas.view();
};
$("gridAlignment").value = canvas.gridBetween ? "between" : "holes";
$("gridAlignment").onchange = () => {
  canvas.gridBetween = $("gridAlignment").value === "between";
  canvas.view();
};
$("gridSpacing").value = String(canvas.gridMultiplier);
$("gridSpacing").onchange = () =>
  canvas.setGridMultiplier(Number($("gridSpacing").value));
$("labels").checked = canvas.labels;
$("labels").onchange = () => canvas.setLabels($("labels").checked);
$("selectTool").onclick = () => {
  canvas.selectMode = !canvas.selectMode;
  $("selectTool").setAttribute("aria-pressed", String(canvas.selectMode));
};
const partDocs = new PartDocs();
const elementPicker = new ElementPicker(addElement);
$("addElement").onclick = () => elementPicker.open();
const sonarSimulator = new SonarSimulator(
  $("stage"),
  setControl,
  (id) => controls[id],
);
$("routeWire").onclick = () => canvas.autoRoute();
$("routeWireSimple").onclick = () =>
  canvas.autoRoute(canvas.selectedWire, "simple");
$("cleanup").onclick = () => {
  notice("");
  canvas.cleanup();
};
$("undoCanvas").onclick = () => canvas.undo();
$("redoCanvas").onclick = () => canvas.redo();
$("expandCanvas").onclick = () => {
  const expanded = document
    .querySelector(".workspace")
    .classList.toggle("canvas-expanded");
  $("expandCanvas").textContent = expanded ? "Show p5" : "Expand";
  $("expandCanvas").setAttribute("aria-pressed", String(expanded));
};

function bbPins() {
  const out = [];
  for (let n = 1; n <= 30; n++) {
    const x = 18 + (n - 1) * 9.5;
    ["a", "b", "c", "d", "e"].forEach((r, i) =>
      out.push({ name: `${n}t.${r}`, x, y: 40 + i * 9.5 }),
    );
    ["f", "g", "h", "i", "j"].forEach((r, i) =>
      out.push({ name: `${n}b.${r}`, x, y: 106.5 + i * 9.5 }),
    );
    [
      ["tp", 12],
      ["tn", 21.5],
      ["bp", 165.4],
      ["bn", 174.9],
    ].forEach(([r, y]) => out.push({ name: `${r}.${n}`, x, y }));
  }
  return out;
}
function breadboard() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "313.5");
  svg.setAttribute("height", "192");
  svg.setAttribute("viewBox", "0 0 313.5 192");
  svg.innerHTML =
    '<rect class="breadboard" x="1" y="1" width="311.5" height="190" rx="5"/><path d="M8 92.25H305.5" stroke="#e0e5df"/>' +
    bbPins()
      .map(
        (p) =>
          `<circle class="breadboard-hole" cx="${p.x}" cy="${p.y}" r="${BREADBOARD_HOLE_RADIUS}"/>`,
      )
      .join("") +
    '<path class="breadboard-rail" stroke="#bc7770" d="M12 6H300.5M12 160.4H300.5"/><path class="breadboard-rail" stroke="#99a4aa" d="M12 28H300.5M12 181.9H300.5"/>';
  const columns = [1, 5, 10, 15, 20, 25, 30]
    .map(
      (n) =>
        `<text class="breadboard-label" text-anchor="middle" x="${18 + (n - 1) * 9.5}" y="35">${n}</text>`,
    )
    .join("");
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
    .map(
      (r, i) =>
        `<text class="breadboard-label" x="5" y="${i < 5 ? 43 + i * 10 : 113 + (i - 5) * 10}">${r}</text>`,
    )
    .join("");
  svg.insertAdjacentHTML("beforeend", columns + rows);
  return svg;
}
let partRenderVersion = 0;
function renderParts() {
  const version = ++partRenderVersion;
  $("removeWire").disabled = selectedWire < 0;
  $("removePart").disabled =
    !selectedPart ||
    selectedPart === diagram.parts.find((p) => p.type === TYPES[0])?.id;
  partElements.clear();
  $("parts").replaceChildren();
  for (const p of diagram.parts) {
    const wrapper = document.createElement("div");
    wrapper.className = "part" + (selectedPart === p.id ? " selected" : "");
    wrapper.dataset.id = p.id;
    wrapper.style.left = p.left + "px";
    wrapper.style.top = p.top + "px";
    const handle = document.createElement("button");
    handle.className = "part-handle";
    handle.textContent = p.label || p.attrs?.label || p.id;
    const help = document.createElement("button");
    help.className = "part-doc-help";
    help.textContent = "?";
    help.title = "Part documentation";
    help.setAttribute("aria-label", "Documentation for " + p.id);
    help.onclick = (e) => {
      e.stopPropagation();
      partDocs.open(p, partElements.get(p.id));
      workbench?.tab("help");
    };
    wrapper.append(help);
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const rotate = document.createElement("button");
      rotate.className = "part-rotate";
      rotate.dataset.rotateCorner = corner;
      rotate.textContent = "↻";
      rotate.title = "Drag to rotate · 45° increments";
      rotate.setAttribute("aria-label", `Rotate ${p.id} from ${corner} corner`);
      rotate.onclick = (e) => e.stopPropagation();
      wrapper.append(rotate);
    }
    handle.title =
      (elementByType.get(p.type)?.name || p.type) +
      " · drag to move; click to select";
    wrapper.append(handle);
    const body = document.createElement("div");
    body.className = "part-body";
    wrapper.append(body);
    let element;
    if (p.type === TYPES[1]) {
      element = breadboard();
      element.pinInfo = bbPins();
      body.append(element);
    } else {
      element = document.createElement(p.type);
      for (const [attr, value] of Object.entries(p.attrs || {})) {
        if (
          ["tint", "appearance"].includes(attr) ||
          /^(on|innerHTML|outerHTML|style|src|href)/i.test(attr)
        )
          continue;
        if (
          attr in element &&
          (["string", "number", "boolean"].includes(typeof value) ||
            Array.isArray(value))
        )
          element[attr] =
            typeof element[attr] === "number"
              ? Number(value)
              : typeof element[attr] === "boolean"
                ? value === true || value === "true"
                : value;
      }
      body.append(element);
      if (p.type === TYPES[0]) {
        element.ledPower = running;
      }
      if (p.type === TYPES[2]) {
        element.min = 0;
        element.max = 1023;
        element.value = controls[p.id] ?? 512;
        element.addEventListener("input", () =>
          setControl(p.id, element.value),
        );
      }
      if (p.type === TYPES[4]) {
        element.color = p.attrs?.color || "green";
        element.addEventListener("button-press", () => setControl(p.id, true));
        element.addEventListener("button-release", () =>
          setControl(p.id, false),
        );
      }
    }
    partElements.set(p.id, element);
    $("parts").append(wrapper);
  }
  renderWires();
  renderControls();
  // Lit draws asynchronously. Rotated pins depend on the final body dimensions.
  Promise.all(
    [...partElements.values()].map((element) => element.updateComplete),
  ).then(() => {
    if (version === partRenderVersion) canvas.render();
  });
}
function renderWires() {
  $("undoCanvas").disabled = canvas.undoStack.length === 0;
  $("redoCanvas").disabled = canvas.redoStack.length === 0;
  canvas.setData(diagram, partElements, {
    selectedWire,
    selectedPart,
    wireMode,
  });
  $("wireMode").setAttribute("aria-pressed", String(canvas.wireMode));
  $("partTint").disabled = !selectedPart;
  $("grayTint").disabled = !selectedPart;
  $("originalTint").disabled = !selectedPart;
  if (selectedPart)
    $("partTint").value =
      diagram.parts.find((p) => p.id === selectedPart)?.attrs?.tint ||
      "#87918c";
  $("wireColor").value =
    selectedWire >= 0
      ? diagram.connections[selectedWire]?.[2] || canvas.newColor
      : canvas.newColor;
  $("wireCount").textContent = diagram.connections.length + " wires";
  document.querySelector(".canvas-inspector").hidden = !(
    canvas.selectedParts.size || canvas.selectedWires.size
  );
  $("selectionCount").textContent =
    canvas.selectedParts.size + canvas.selectedWires.size
      ? `${canvas.selectedParts.size} parts · ${canvas.selectedWires.size} wires selected`
      : "";
  $("connectionList").replaceChildren();
  diagram.connections.forEach(([a, b], i) => {
    const btn = document.createElement("button");
    btn.className = "connection" + (selectedWire === i ? " selected" : "");
    btn.textContent =
      (a.startsWith("free:") ? "Free end" : a) +
      " → " +
      (b.startsWith("free:") ? "Free end" : b);
    btn.addEventListener("click", (e) => canvas.selectWire(i, -1, e.shiftKey));
    $("connectionList").append(btn);
  });
}
function selectWire(i) {
  selectedWire = i;
  wireMode = canvas.wireMode;
  $("removeWire").disabled = i < 0;
  $("routeWire").disabled = i < 0;
  $("routeWireSimple").disabled = i < 0;
  $("wireInspector").open = i >= 0;
  renderWires();
}
function setControl(id, value) {
  sonarSimulator.sync(id, value);
  controls[id] = value;
  worker?.postMessage({ type: "controls", controls });
  persist();
  const el = partElements.get(id);
  if (el?.tagName === "WOKWI-POTENTIOMETER") el.value = value;
  if (el?.tagName === "WOKWI-PUSHBUTTON") el.pressed = Boolean(value);
  const hold = document.querySelector(`[aria-label="Hold ${id}"]`);
  if (hold) hold.setAttribute("aria-pressed", String(Boolean(value)));
  const out = document.querySelector(`[data-value="${id}"]`);
  if (out)
    out.textContent =
      typeof value === "boolean"
        ? value
          ? "pressed"
          : "released"
        : value === -1
          ? "no echo"
          : String(value);
  const noEcho = document.querySelector(`[aria-label="${id} no echo"]`);
  if (noEcho) noEcho.checked = value === -1;
  const input = document.querySelector(`[data-control="${id}"]`);
  if (input && el?.tagName === "WOKWI-HC-SR04") input.disabled = value === -1;
  if (input && input.type === "range" && value >= 0) input.value = value;
}
function renderControls() {
  $("controls").replaceChildren();
  for (const p of diagram.parts.filter((p) =>
    [TYPES[2], TYPES[3], TYPES[4]].includes(p.type),
  )) {
    const div = document.createElement("div");
    div.className = "control";
    const label = document.createElement("label");
    label.textContent = p.id;
    div.append(label);
    const output = document.createElement("output");
    output.dataset.value = p.id;
    if (p.type === TYPES[4]) {
      const btn = document.createElement("button");
      btn.textContent = "Hold";
      btn.setAttribute("aria-label", "Hold " + p.id);
      btn.setAttribute("aria-pressed", String(Boolean(controls[p.id])));
      btn.addEventListener("pointerdown", (e) => {
        btn.setPointerCapture(e.pointerId);
        setControl(p.id, true);
        btn.setAttribute("aria-pressed", "true");
      });
      const release = () => {
        setControl(p.id, false);
        btn.setAttribute("aria-pressed", "false");
      };
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("keydown", (e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          setControl(p.id, true);
          btn.setAttribute("aria-pressed", "true");
        }
      });
      btn.addEventListener("keyup", release);
      div.append(btn);
      output.textContent = controls[p.id] ? "pressed" : "released";
    } else {
      const input = document.createElement("input");
      input.type = "range";
      input.min = p.type === TYPES[3] ? "2" : "0";
      input.max = p.type === TYPES[3] ? "400" : "1023";
      input.step = "1";
      input.value =
        controls[p.id] >= 0 ? controls[p.id] : p.type === TYPES[3] ? 100 : 512;
      input.disabled = p.type === TYPES[3] && controls[p.id] === -1;
      input.dataset.control = p.id;
      input.setAttribute(
        "aria-label",
        p.type === TYPES[3] ? p.id + " distance cm" : p.id + " analog value",
      );
      input.addEventListener("input", () =>
        setControl(p.id, Number(input.value)),
      );
      div.append(input);
      output.textContent = controls[p.id] === -1 ? "no echo" : input.value;
      if (p.type === TYPES[3]) {
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = controls[p.id] === -1;
        check.setAttribute("aria-label", p.id + " no echo");
        check.title = "No echo";
        check.addEventListener("change", () => {
          input.disabled = check.checked;
          setControl(p.id, check.checked ? -1 : Number(input.value));
        });
        div.append(check);
        const simulate = document.createElement("button");
        simulate.textContent = "Simulate";
        simulate.setAttribute("aria-label", "Simulate " + p.id + " distance");
        simulate.onclick = () => sonarSimulator.open(p.id);
        div.append(simulate);
      }
    }
    div.append(output);
    $("controls").append(div);
  }
}
let renderWidth = 500,
  renderHeight = 360;
bridge.addEventListener("renderSize", (e) => {
  if (e.detail.width > 0 && e.detail.height > 0) {
    renderWidth = e.detail.width;
    renderHeight = e.detail.height;
    resize();
  }
});
function resize() {
  const preview = document.querySelector(".preview");
  if (
    preview.clientWidth &&
    preview.clientHeight &&
    bridge.frame.ownerDocument === document
  ) {
    bridge.frame.style.width = renderWidth + "px";
    bridge.frame.style.height = renderHeight + "px";
    bridge.frame.style.transform = `scale(${Math.min(preview.clientWidth / renderWidth, preview.clientHeight / renderHeight)})`;
  }
}
new ResizeObserver(resize).observe(document.querySelector(".preview"));
$("run").onclick = runArduino;
$("compile").onclick = runArduino;
$("runP5").onclick = runP5;
$("reset").onclick = runArduino;
$("pause").onclick = () => {
  if (mode === "usb") return;
  paused = !paused;
  worker?.postMessage({ type: "pause", paused });
  $("pause").textContent = paused ? "Resume" : "Pause";
  status(paused ? "Paused · simulated Uno" : "Running · simulated Uno");
};
$("comms").onchange = () => {
  savedP5[api] = sourceValue(p5Editor);
  api = $("comms").value;
  setCode(
    p5Editor,
    savedP5[api] || (api === "native" ? nativeSketch : webserialSketch),
  );
  $("apiLabel").textContent =
    api === "native" ? "navigator.serial" : "p5.webserial";
  persist();
  if (running || serial.connected) runP5();
};
$("loadExample").onclick = () => {
  setCode(p5Editor, api === "native" ? nativeSketch : webserialSketch);
  persist();
  if (running || serial.connected) runP5();
};
$("wireMode").onclick = () => {
  wireMode = !wireMode;
  canvas.draft = null;
  canvas.wireMode = wireMode;
  $("wireMode").setAttribute("aria-pressed", String(wireMode));
  notice(wireMode ? "Click two terminals to connect them." : "");
  renderWires();
};
$("removeWire").onclick = () => {
  canvas.deleteWire();
};
$("removePart").onclick = () => canvas.deleteSelection();
function addElement(type, attrs = {}) {
  if (!elementByType.has(type)) return;
  if (diagram.parts.length >= 40) {
    notice("Maximum 40 parts.");
    return;
  }
  let n = 1;
  while (diagram.parts.some((p) => p.id === "part" + n)) n++;
  const before = canvas.checkpoint(),
    id = "part" + n;
  const position = {
    left: (canvas.stage.clientWidth / 2 - canvas.camera.x) / canvas.camera.zoom,
    top: (canvas.stage.clientHeight / 2 - canvas.camera.y) / canvas.camera.zoom,
  };
  diagram.parts.push({ id, type, ...position, attrs: { ...attrs } });
  controls[id] = type === TYPES[2] ? 512 : type === TYPES[3] ? 100 : false;
  renderParts();
  canvas.commit(before, true);
  canvas.selectPart(id);
  const element = partElements.get(id);
  Promise.resolve(element?.updateComplete).then(() => {
    canvas.refreshPins();
    canvas.render();
  });
}
$("lesson").onclick = () => {
  const before = canvas.checkpoint();
  diagram = classroomCircuit();
  canvas.clearSelection();
  controls = { pot: 512, sonar: 100, b1: false, b2: false };
  selectedWire = -1;
  selectedPart = null;
  renderParts();
  canvas.commit(before, true);
  canvas.cleanup();
  canvas.fit();
  notice("Classroom wiring restored. Your Arduino and p5 code are kept.");
};
$("save").onclick = () => {
  const blob = new Blob([JSON.stringify(project(), null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "physical-p5-project.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("open").onclick = () => $("projectFile").click();
function openProject(d) {
  const candidate = d.diagram || d;
  validateDiagram(candidate);
  stop();
  diagram = candidate;
  controls = d.controls || {};
  if (d.arduino) setCode(arduinoEditor, d.arduino);
  if (d.p5) {
    savedP5 = Object.fromEntries(
      Object.entries(d.p5).map(([api, source]) => [
        api,
        upgradeClassSketchTheme(source),
      ]),
    );
    api = d.api === "native" ? "native" : "webserial";
    $("comms").value = api;
    setCode(
      p5Editor,
      savedP5[api] || (api === "native" ? nativeSketch : webserialSketch),
    );
  }
  artifact = d.artifact || null;
  workbench?.restore(d.workbench || {});
  canvas.undoStack = [];
  canvas.redoStack = [];
  canvas.draft = null;
  if (d.canvas?.camera) {
    Object.assign(canvas.camera, d.canvas.camera);
    canvas.gridMultiplier = [0.5, 1, 2].includes(d.canvas.gridMultiplier)
      ? d.canvas.gridMultiplier
      : 1;
    canvas.gridReference = ["arduino", "none"].includes(d.canvas.gridReference)
      ? d.canvas.gridReference
      : "breadboard";
    canvas.gridBetween = d.canvas.gridBetween === true;
    canvas.labels = d.canvas.labels !== false;
    $("labels").checked = canvas.labels;
    $("gridSpacing").value = String(canvas.gridMultiplier);
    $("gridReference").value = canvas.gridReference;
    $("gridAlignment").value = canvas.gridBetween ? "between" : "holes";
    canvas.view();
  }
  selectedWire = -1;
  selectedPart = null;
  $("apiLabel").textContent =
    api === "native" ? "navigator.serial" : "p5.webserial";
  renderParts();
  changed();
  notice("Project opened. Run to start the Uno.");
}
$("projectFile").onchange = async () => {
  const f = $("projectFile").files[0];
  if (!f) return;
  try {
    if (f.size > 15000000) throw new Error("Project limit is 15 MB.");
    openProject(JSON.parse(await f.text()));
  } catch (e) {
    notice(e.message);
  } finally {
    $("projectFile").value = "";
  }
};
$("sendForm").onsubmit = (e) => {
  e.preventDefault();
  writeBytes(new TextEncoder().encode($("sendText").value + "\n"));
};
$("clearLog").onclick = () => {
  lines = [];
  $("log").textContent = "";
};
serial.addEventListener("bytes", (e) => receive(e.detail));
serial.addEventListener("connect", () => {
  mode = "usb";
  status("Connected · physical Uno");
  updateConnection();
  runP5();
});
serial.addEventListener("disconnect", () => {
  status("USB disconnected");
  updateConnection();
});
serial.addEventListener("error", (e) => notice(e.detail.message));
$("usb").onclick = async () => {
  try {
    if (serial.connected) {
      await serial.disconnect();
      mode = "simulation";
      $("usb").textContent = "Connect USB Arduino";
      return;
    }
    stop();
    const grantedPorts = await navigator.serial.getPorts();
    await serial.connect({
      baudRate: 9600,
      port: grantedPorts.length === 1 ? grantedPorts[0] : null,
    });
    $("usb").textContent = "Disconnect USB Arduino";
  } catch (e) {
    notice(e.message);
  }
};
async function uploadFirmware() {
  if (!serial.connected || !artifact) return;
  $("upload").disabled = true;
  try {
    const port = await serial.releasePort();
    try {
      await flashUno(port, artifact.hex, (p) => {
        status(p);
        log(p);
      });
    } finally {
      await serial.reconnect(port, 9600);
    }
    status("Uploaded and verified · physical Uno");
    log("Uploaded and verified · physical Uno");
  } catch (e) {
    notice(e.message);
    log("Upload failed: " + e.message);
  } finally {
    updateConnection();
  }
}
$("upload").onclick = uploadFirmware;
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input,select,textarea,.cm-editor") || e.repeat) return;
  const id =
    e.key.toLowerCase() === "a"
      ? "b1"
      : e.key.toLowerCase() === "b"
        ? "b2"
        : null;
  if (id && partElements.has(id)) setControl(id, true);
  if (e.key === "Escape") {
    wireMode = false;
    $("wireMode").setAttribute("aria-pressed", "false");
    notice("");
    canvas.draft = null;
    canvas.wireMode = false;
    renderWires();
  }
});
document.addEventListener("keyup", (e) => {
  const id =
    e.key.toLowerCase() === "a"
      ? "b1"
      : e.key.toLowerCase() === "b"
        ? "b2"
        : null;
  if (id && partElements.has(id)) setControl(id, false);
});
window.addEventListener("blur", () => {
  for (const p of diagram.parts.filter((p) => p.type === TYPES[4]))
    setControl(p.id, false);
});
// Explicit semantic API for agents and lecture tooling; source edits and nets are reviewable.
window.physicalP5 = {
  getProject: () => structuredClone(project()),
  canvas: {
    fit: () => canvas.fit(),
    cleanup: () => canvas.cleanup(),
    autoroute: (i) => canvas.autoRoute(i),
    undo: () => canvas.undo(),
    redo: () => canvas.redo(),
    getView: () => canvas.getState(),
  },
  getState: () => ({
    running,
    paused,
    mode,
    packet: lastPacket,
    topology,
    controls: structuredClone(controls),
  }),
  run: runArduino,
  stop,
  setControl,
  readConsole: () => lines.slice(),
  setArduino: (code) => setCode(arduinoEditor, String(code)),
  setP5: (code) => setCode(p5Editor, String(code)),
  setDiagram: (d) => {
    validateDiagram(d);
    resolveCircuit(d);
    diagram = structuredClone(d);
    renderParts();
    changed();
  },
};
renderParts();
initializeCompactUI({ canvas, key });
workbench = new Workbench({
  key,
  project,
  openProject,
  persist,
  notice,
  canvas,
  bridge,
  arduinoEditor,
  p5Editor,
  compile: getFirmware,
  upload: uploadFirmware,
  setCode,
  stop,
  runP5,
  selected: () => diagram.parts.find((p) => p.id === selectedPart),
  element: () => partElements.get(selectedPart),
  updatePart: (next) => {
    const before = canvas.checkpoint();
    if (!selectedPart) throw new Error("Select a component first.");
    const candidate = structuredClone(diagram);
    candidate.parts[candidate.parts.findIndex((p) => p.id === selectedPart)] =
      next;
    if (next.id !== selectedPart)
      candidate.connections = candidate.connections.map((c) =>
        c.map((v, i) =>
          i < 2 && typeof v === "string" && v.startsWith(selectedPart + ":")
            ? next.id + v.slice(selectedPart.length)
            : v,
        ),
      );
    validateDiagram(candidate);
    if (next.id !== selectedPart) {
      controls[next.id] = controls[selectedPart];
      delete controls[selectedPart];
      selectedPart = next.id;
    }
    diagram = candidate;
    renderParts();
    canvas.commit(before, true);
    changed();
    canvas.selectPart(next.id);
    workbench?.selectPart();
  },
  lesson: () => ({
    diagram: classroomCircuit(),
    arduino: lessonSource,
    p5: { webserial: webserialSketch },
    api: "webserial",
  }),
});
workbench.restore(savedWorkbench);
showHealth();
resize();
$("apiLabel").textContent =
  api === "native" ? "navigator.serial" : "p5.webserial";

if (diagram.canvasEditor !== 2) {
  requestAnimationFrame(() => {
    diagram.canvasEditor = 2;
    canvas.cleanup();
    canvas.fit();
  });
}
