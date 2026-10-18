import { dipCount } from "./switchTypes.js";
import { drawingCommand } from "./automation/drawing.js";
import {formatCode} from "../shared/editor/formatCode.js";
import {matchingPortName} from "../shared/serial/portIdentity.js";
import {createSerialActivity} from "./serialActivity.js";
import {startupProject} from "./startupProject.js";
import {CircuitAudio} from "./circuitAudio.js";
import "./foundationElements.js";
import {isObjectDeleteShortcut} from "./selectionDeletion.js";
import {terminalContacts, syncSeating, unplugContacts} from "./terminalContacts.js";
import { installAgentSurface } from "./automation/install.js";
import { createAgentAdapter } from "./automation/adapter.js";
import { paintRGBGlow } from "./ledAppearance.js";
import { InputSimulator } from "./InputSimulator.js";
import { isPot, isSensorInput } from "./inputModels.js";
import { boardKind } from "./avrBoards.js";
import { isNeoPixel } from "./outputModels.js";
import { isAVRBoard } from "./circuit.js";
import {
  breadboardName,
  breadboardPins,
  breadboardSVG,
  isBreadboard,
} from "./breadboard.js";
import firmataParserSource from "../firmata/FirmataParser.js?raw";
import firmataClientSource from "../firmata/FirmataClient.js?raw";
import { COMMS_VERSION, embedComms, commsExample } from "./commsCode.js";
import { resistance } from "./passiveStates.js";
import { Workbench } from "./Workbench.js";
import { basePath } from "../shared/basePath.js";
import { BREADBOARD_HOLE_RADIUS } from "./partGeometry.js";
import { ElementPicker, PartDocs } from "./ElementPicker.js";
import { elementByType } from "./elements.js";
import { initializeCompactUI } from "./compactUI.js";
import { SonarSimulator } from "./SonarSimulator.js";
import "./style.css";
import "@wokwi/elements";
import "./extraElements.js";
import "./simpleElements.js";
import "./instrumentElements.js";
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
  isMomentarySwitch,
} from "./circuit.js";
import {
  upgradeClassSketchTheme,
} from "./examples.js";
import lessonSource from "./classroom.ino?raw";

let agentSurface = null,
  agentMuteObserve = false,
  agentMuteActions = false,
  agentLatestState = null;
const $ = (id) => document.getElementById(id),
  workspace = new URLSearchParams(location.search).get("workspace"),
  key =
    "physical-p5.circuit-project.v1" +
    (workspace ? ":" + workspace.slice(0, 64) : "");
initializeTheme();
let cachedProjectText=null;
try { cachedProjectText=localStorage.getItem(key); } catch {}
function upgradeManagedComms(source, api) {
  const themed = upgradeClassSketchTheme(source);
  return themed.includes("// p5comp communications: begin") && !themed.includes(COMMS_VERSION)
    ? embedComms(themed, api, {parser: firmataParserSource, client: firmataClientSource})
    : themed;
}
const initialProject=startupProject(cachedProjectText);
let savedCanvas = initialProject.canvas || {},
  workbench = null,
  savedWorkbench = initialProject.workbench || {};
let diagram = initialProject.diagram,
  controls = initialProject.controls || {},
  api = ["native", "none", "firmata"].includes(initialProject.api) ? initialProject.api : "webserial",
  savedP5 = Object.fromEntries(Object.entries(initialProject.p5 || {}).map(([api,source])=>[api,upgradeManagedComms(source,api)])),
  artifact = initialProject.artifact || null;
const circuitAudio=new CircuitAudio({onError:message=>log(message),onInput:value=>{
  if(value==null)return;
  for(const part of diagram.parts)if(["wokwi-small-sound-sensor","wokwi-big-sound-sensor"].includes(part.type))controls[part.id]=value;
  worker?.postMessage({type:"controls",controls});
}});
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
const serialActivity = createSerialActivity();
const serialBoard = () => document.querySelector("wokwi-arduino-uno,wokwi-arduino-nano,wokwi-arduino-mega");
const log = (line) => {
  agentSurface?.emit("console", { line: String(line) });
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
const boardLabel = () => boardKind(diagram.parts.find(p => isAVRBoard(p.type))?.type).toUpperCase();
const portNames = new WeakMap();
async function discoverPortName(port) {
  try {
    const compiler = workbench?.compilerURL() || basePath("api/compile");
    const response = await fetch(new URL("serial-ports", new URL(compiler, location.href)), {signal: AbortSignal.timeout(6000)});
    if (!response.ok) return;
    const name = matchingPortName(port.getInfo(), (await response.json()).ports || []);
    if (name) portNames.set(port, name);
    if (serial.port === port) {
      updateConnection();
      if ($("status").textContent.startsWith("Connected")) status(`Connected · ${usbIdentity()} (${boardLabel()})`);
    }
  } catch {}
}
function usbIdentity() {
  const port = serial.port;
  const info = port?.getInfo?.() || {};
  return portNames.get(port) || port?.deviceName || port?.name || port?.path || (info.usbVendorId != null
    ? `USB ${info.usbVendorId.toString(16).padStart(4, "0")}:${(info.usbProductId || 0).toString(16).padStart(4, "0")}`
    : "USB serial device");
}
const status = (s) => {
  s = s.replace(/simulated (?:Arduino|Uno)/g, `(${boardLabel()} sim)`);
  agentSurface?.emit("runtime.status", { message: s });
  $("status").textContent = s;
  $("run").dataset.running = String(running);
  $("run").dataset.paused = String(paused);
  $("run").setAttribute("aria-pressed", String(running && !paused));
  const action = paused
    ? "Resume simulation"
    : running
      ? "Stop simulation"
      : "Run Arduino + p5";
  $("run").title =
    action + " · Shift-click: pause/resume · Option/Alt-click: reset";
  $("run").setAttribute("aria-label", action);
  $("run").textContent = action;
  workbench?.editorStatus("arduino", s);
  workbench?.syncTransport(running && !paused);
};
function sourceValue(editor) {
  return editor.state.doc.toString();
}
const initialSource = typeof initialProject.arduino === "string" ? initialProject.arduino : lessonSource;
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
  value: savedP5[api] || commsExample(api, {parser: firmataParserSource, client: firmataClientSource}),
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
bridge.addEventListener("status", (event) => {
  const status = $("p5Status");
  if (status) status.textContent = event.detail;
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
    if (!agentMuteObserve) agentSurface?.observe();
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
  $("usb").dataset.connected = String(serial.connected);
  $("usb").title = serial.connected ? `USB connected · ${usbIdentity()} (${boardLabel()}) · connection options` : "USB disconnected · connection options";
  $("usb").setAttribute("aria-label", $("usb").title);
  if ($("arduinoEditorStatus")) $("arduinoEditorStatus").dataset.usb = serial.connected ? "connected" : "disconnected";
  bridge.updateState(
    {},
    api !== "none" && (running || (mode === "usb" && serial.connected)),
    mode,
  );
  $("upload").disabled =
    !artifact ||
    artifact.source !== sourceValue(arduinoEditor) ||
    mode !== "usb" ||
    !serial.connected;
}
function runP5() {
  if (!agentMuteActions)
    agentSurface?.action("runtime", { action: "p5_start" });
  updateConnection();
  return bridge.run(
    workbench?.p5Source() || sourceValue(p5Editor),
    workbench?.p5Project() || {},
  );
}

function receive(bytes) {
  if (bytes.length) serialActivity.pulse(serialBoard(), "TX");
  if (api !== "none") bridge.serialBytes(bytes);
  serialBuffer += new TextDecoder().decode(Uint8Array.from(bytes));
  const chunks = serialBuffer.split("\n");
  serialBuffer = chunks.pop();
  if (serialBuffer.length > 8192) serialBuffer = "";
  for (const raw of chunks) {
    const line = raw.trim();
    if (!line) continue;
    log("← " + line);
    $("packet").textContent = line;
    lastPacket = line;
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
    if (mode === "simulation" && !agentMuteActions) agentSurface?.action("serial", { action: "write", text: new TextDecoder().decode(bytes) });
    if (bytes.length) serialActivity.pulse(serialBoard(), "RX");
    log("→ " + new TextDecoder().decode(bytes).trim());
  } catch (e) {
    notice(e.message);
  }
}

async function getFirmware() {
  const source = sourceValue(arduinoEditor);
  const files = workbench?.arduinoFiles() || {};
  const board = boardKind(diagram.parts.find((p) => isAVRBoard(p.type))?.type);
  const buildKey =
    source + JSON.stringify(files) + (board === "uno" ? "" : board);
  if (
    artifact?.buildKey === buildKey &&
    artifact?.source === source &&
    typeof artifact.hex === "string"
  )
    return artifact.hex;
  if (
    board === "uno" &&
    !Object.keys(files).length &&
    source.trim() === lessonSource.trim()
  ) {
    const response = await fetch(basePath("sim/classroom.hex"));
    if (!response.ok) throw new Error("Bundled classroom HEX could not load.");
    const hex = await response.text();
    artifact = { source, buildKey, hex };
    $("firmwareState").textContent = "Bundled lesson firmware";
    persist();
    return hex;
  }
  status("Compiling locally…");
  log(
    `Compiling Arduino ${board === "mega" ? "Mega" : board === "nano" ? "Nano" : "Uno"}…`,
  );
  let response;
  try {
    response = await fetch(
      workbench?.compilerURL() || basePath("api/compile"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board, source, files }),
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
  if (result.stderr) log(result.stderr);
  if (/warning:/i.test((result.stderr || "") + (result.stdout || "")))
    workbench?.editorStatus(
      "arduino",
      "Compiled with warnings · check console",
      "warning",
    );
  artifact = { source, buildKey, hex: result.hex };
  $("firmwareState").textContent = "Compiled locally · cached in project";
  log("Compilation complete · firmware cached.");
  persist();
  return result.hex;
}
document.addEventListener("p5comp:pwm-refresh", (e) =>
  worker?.postMessage({ type: "refresh", hz: e.detail }),
);
function startWorker(hex) {
  worker?.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data: d }) => {
    if (d.type === "serial") receive(d.bytes);
    if (d.type === "state") {
      agentLatestState = d;
      circuitAudio?.consume(d.analogFrames||[],diagram.parts);
      for(const [id,element] of partElements)if(element.tagName==="P5COMP-OSCILLOSCOPE")element.ingest(d.analogFrames||[],id);
      $("clock").textContent = d.seconds.toFixed(2) + " s";
      $("led").dataset.on = String(d.led);
      $("led").textContent = "LED 13 · " + (d.led ? "on" : "off");
      document.querySelector(
        "wokwi-arduino-uno,wokwi-arduino-nano,wokwi-arduino-mega",
      )?.setAttribute("data-led13", String(d.led));
      const activeBoard=document.querySelector("wokwi-arduino-uno,wokwi-arduino-nano,wokwi-arduino-mega");
      if(activeBoard)activeBoard.led13=d.led;
      for (const [id, state] of Object.entries(d.parts || {})) {
        const element = partElements.get(id);
        if (!element) continue;
        element.dataset.simulation = JSON.stringify(state);
        if (
          ["P5COMP-MULTIMETER", "P5COMP-SIGNAL-PROBE", "P5COMP-PLOTTER"].includes(element.tagName)
        ) {
          element.measurement = { ...state, seconds: d.seconds };
          element.title = state.warning || state.reading || "Plotter · voltage history";
          continue;
        }
        if (element.tagName.startsWith("P5COMP-") && element.constructor.elementProperties?.has("measurement")) {
          element.measurement=state; continue;
        }
        if (element.tagName === "WOKWI-LED") {
          element.value = state.lit;
          element.brightness =
            state.brightness *
            Number(
              diagram.parts.find((p) => p.id === id)?.attrs?.brightness ?? 1,
            );
        }
        for (const prop of [
          "angle",
          "hasSignal",
          "characters",
          "values",
          "ledRed",
          "ledGreen",
          "ledBlue",
        ])
          if (state[prop] != null) element[prop] = state[prop];
        if (element.tagName === "WOKWI-RGB-LED") paintRGBGlow(element, state);
        for (const prop of [
          "energized",
          "active",
          "ledPower",
          "ledDO",
          "ledSignal",
          "outerHandAngle",
          "innerHandAngle",
        ])
          if (state[prop] != null) element[prop] = state[prop];
        if (element.tagName === "WOKWI-STEPPER-MOTOR" && state.steps != null) {
          element.value = Number(state.steps).toFixed(1);
          element.units = "steps";
        }
        if (state.pixels) {
          if (element.tagName === "WOKWI-NEOPIXEL")
            Object.assign(element, state.pixels[0] || { r: 0, g: 0, b: 0 });
          else
            state.pixels.forEach((color, i) =>
              element.tagName === "WOKWI-NEOPIXEL-MATRIX"
                ? element.setPixel(
                    Math.floor(i / Number(element.cols)),
                    i % Number(element.cols),
                    color,
                  )
                : element.setPixel(i, color),
            );
          element.title = id + " · " + state.pixels.length + " pixels";
          continue;
        }
        if (state.energized != null) {
          element.title =
            id + " · " + (state.energized ? "COM → NO" : "COM → NC");
          continue;
        }
        if (state.digital != null) {
          element.title =
            id +
            " · " +
            (state.powered
              ? "AO " + state.analog + " · DO " + Number(state.digital)
              : "check VCC / GND");
          continue;
        }
        if (
          state.angle != null ||
          state.hasSignal != null ||
          state.characters
        ) {
          element.title = `${id} · ${state.powered !== false ? (state.angle != null ? state.angle.toFixed(0) + "°" : state.frequency != null ? state.frequency.toFixed(0) + " Hz" : "LCD running") : "check power connections"}`;
          continue;
        }
        if (isMomentarySwitch(element.tagName.toLowerCase())) {
          element.title = `${id} · ${state.closed ? "closed (pressed)" : "open (released)"}`;
          continue;
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
  worker.postMessage({
    type: "start",
    hex,
    topology,
    controls,
    refreshHz: Number(localStorage.getItem("p5comp.pwmRefreshHz")) || 60,
  });
  running = true;
  paused = false;
  $("pause").disabled = false;
  $("pause").textContent = "Pause";
  status(topology?.board === null ? "Running · analog circuit" : "Running · simulated Arduino");
  updateConnection();
  document.querySelector(
    "wokwi-arduino-uno,wokwi-arduino-nano,wokwi-arduino-mega",
  )?.setAttribute("data-powered", "true");
  const activeBoard=document.querySelector("wokwi-arduino-uno,wokwi-arduino-nano,wokwi-arduino-mega");
  if(activeBoard)activeBoard.ledPower=true;
}
async function runArduino() {
  if (compiling) return;
  if (!agentMuteActions) agentSurface?.action("runtime", { action: "start" });
  compiling = true;
  $("run").disabled = true;
  $("compile").disabled = true;
  notice("");
  try {
    if (mode === "usb") {
      await serial.disconnect();
      mode = "simulation";
    }
    topology = resolveCurrentCircuit();
    showHealth();
    const hex = topology.board === null ? null : await getFirmware();
    startWorker(hex);
    const muteP5Action = agentMuteActions;
    agentMuteActions = true;
    try { await runP5(); } finally { agentMuteActions = muteP5Action; }
    persist();
  } catch (e) {
    stop();
    notice(e.message);
    log(e.message);
    workbench?.editorStatus("arduino", e.message, "error");
    workbench?.bottomTab("console");
    $("code").open = sourceValue(arduinoEditor).trim() !== lessonSource.trim();
  } finally {
    compiling = false;
    $("run").disabled = false;
    $("compile").disabled = false;
  }
}
function stop() {
  circuitAudio.silence();
  if (running && !agentMuteActions)
    agentSurface?.action("runtime", { action: "stop" });
  $("run").title = "Run Arduino + p5";
  $("run").setAttribute("aria-label", "Run Arduino + p5");
  worker?.terminate();
  worker = null;
  running = false;
  paused = false;
  $("pause").disabled = true;
  serialActivity.clear();
  status("Stopped · simulated Arduino");
  const board = document.querySelector(
    "wokwi-arduino-uno,wokwi-arduino-nano,wokwi-arduino-mega",
  );
  if (board) board.ledPower = false;
  for (const element of partElements.values()) {
    delete element.dataset.simulation;
    if (isNeoPixel(element.tagName.toLowerCase())) {
      if (element.reset) element.reset();
      else Object.assign(element, { r: 0, g: 0, b: 0 });
    }
    if (element.tagName === "WOKWI-RELAY-MODULE") element.energized = false;
    if (element.tagName === "WOKWI-RGB-LED") {
      element.ledRed = element.ledGreen = element.ledBlue = 0;
      paintRGBGlow(element, {});
    }
    if (["WOKWI-7SEGMENT", "WOKWI-LED-BAR-GRAPH"].includes(element.tagName))
      element.values = Array(8).fill(0);
    if (element.tagName === "WOKWI-BUZZER") element.hasSignal = false;
    if (["WOKWI-LCD1602", "WOKWI-LCD2004"].includes(element.tagName))
      element.characters = Array(
        element.tagName === "WOKWI-LCD2004" ? 80 : 32,
      ).fill(32);
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
    topology = resolveCurrentCircuit();
    $("circuitHealth").textContent = topology.warnings.length
      ? topology.warnings.join(" ")
      : topology.board === null ? "Analog circuit · 12 kHz sampling" : `Wiring ready · ${topology.board === "mega" ? "Mega" : topology.board === "nano" ? "Nano" : "Uno"} at 16 MHz`;
    const visual = diagram.parts.filter(
      (p) =>
        !elementByType.get(p.type)?.modeled &&
        !["wokwi-led", "wokwi-resistor"].includes(p.type) &&
        !isMomentarySwitch(p.type),
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
      if (seatingChanged()) changed();
      else persist();
      renderWires();
      workbench?.selectPart();
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
  onAdd: (point) => elementPicker.open(point),
  onRename: (wrapper) =>
    workbench?.editLabel(
      wrapper,
      diagram.parts.find((p) => p.id === wrapper.dataset.id),
    ),
  onEditValue: (wrapper) =>
    isSensorInput(diagram.parts.find((p) => p.id === wrapper.dataset.id)?.type)
      ? inputSimulator.open(
          diagram.parts.find((p) => p.id === wrapper.dataset.id),
        )
      : diagram.parts.find((p) => p.id === wrapper.dataset.id)?.type ===
          TYPES[3]
        ? sonarSimulator.open(wrapper.dataset.id)
        : workbench?.editValue(
            wrapper,
            diagram.parts.find((p) => p.id === wrapper.dataset.id),
          ),
  onSelectPart: (id) => {
    selectedPart = id;
    workbench?.selectPart(id);
    $("removePart").disabled = !id;
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
    if (nets || seatingChanged()) changed();
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
const inputSimulator = new InputSimulator(setControl, (id) => controls[id]);
const sonarSimulator = new SonarSimulator(
  $("stage"),
  setControl,
  (id) => controls[id],
);
$("routeWire").onclick = () => canvas.autoRoute();
$("routeWireSimple").onclick = () =>
  canvas.autoRoute(canvas.selectedWire, "simple");
$("cleanup").title = "Cleanup wires · Shift-click for simple routing";
$("cleanup").onclick = (e) => {
  notice("");
  canvas.cleanup(e.shiftKey ? "simple" : "careful");
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

function breadboard(part) {
  const container = document.createElement("div");
  container.innerHTML = breadboardSVG(part);
  return container.firstElementChild;
}
function currentContacts() {
  canvas.refreshPins();
  if (!canvas.drag) syncSeating(diagram, canvas.pins);
  return terminalContacts(diagram.parts, canvas.pins, diagram.detachedContacts);
}
function resolveCurrentCircuit() {
  return resolveCircuit(diagram, currentContacts());
}
let seatedKey = "";
function seatingChanged() {
  const contacts = currentContacts();
  const synced = !canvas.drag && syncSeating(diagram, canvas.pins);
  const next = JSON.stringify(contacts);
  const changed = synced || next !== seatedKey;
  seatedKey = next;
  return changed;
}
let partRenderVersion = 0;
function renderParts() {
  const version = ++partRenderVersion;
  $("removeWire").disabled = selectedWire < 0;
  $("removePart").disabled = !selectedPart;
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
      rotate.title = "Click to rotate 45° · drag to rotate";
      rotate.setAttribute("aria-label", `Rotate ${p.id} from ${corner} corner`);
      rotate.onclick = (e) => e.stopPropagation();
      wrapper.append(rotate);
    }
    handle.title =
      (isBreadboard(p.type)
        ? breadboardName(p)
        : elementByType.get(p.type)?.name || p.type) +
      " · drag to move; double-click label to rename, body to edit value";
    wrapper.append(handle);
    const body = document.createElement("div");
    body.className = "part-body";
    wrapper.append(body);
    let element;
    if (isBreadboard(p.type)) {
      element = breadboard(p);
      element.pinInfo = breadboardPins(p);
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
      if (p.type === "wokwi-resistor")
        element.value = String(resistance(p.attrs?.value));
      body.append(element);
      if (p.type === "p5comp-multimeter")
        element.addEventListener("mode-change", (e) => {
          const before = canvas.checkpoint();
          p.attrs = { ...p.attrs, mode: e.detail };
          canvas.commit(before, true);
          changed();
          if (running) runArduino();
        });
      if (isAVRBoard(p.type)) {
        element.ledPower = running;
      }
      if (isPot(p.type)) {
        element.min = 0;
        element.max = 1023;
        controls[p.id] ??= Number(p.attrs?.value ?? 512);
        element.value = controls[p.id];
        element.addEventListener("input", () =>
          setControl(p.id, element.value),
        );
      }
      if (p.type === "p5comp-photoresistor") {
        controls[p.id] ??= Number(p.attrs?.value ?? 100);
        element.value = controls[p.id];
        element.addEventListener("input", () =>
          setControl(p.id, Number(element.value)),
        );
      }
      if (dipCount(p.type) > 0) {
        controls[p.id] ??= p.attrs?.values || Array(dipCount(p.type)).fill(0);
        element.values = [...controls[p.id]];
        element.addEventListener("switch-change", () =>
          setControl(p.id, [...element.values]),
        );
      }
      if (["wokwi-slide-switch", "p5comp-slide-switch", "p5comp-toggle-switch"].includes(p.type)) {
        controls[p.id] ??= Number(p.attrs?.value || 0);
        element.value = controls[p.id];
        element.addEventListener("input", () =>
          setControl(p.id, element.value),
        );
      }
      if (p.type === "wokwi-membrane-keypad") {
        controls[p.id] ??= [];
        const key = (e, on) => {
          const values = new Set(controls[p.id]);
          const k = e.detail.row + "," + e.detail.column;
          if (on) values.add(k);
          else values.delete(k);
          setControl(p.id, [...values]);
        };
        element.addEventListener("button-press", (e) => key(e, true));
        element.addEventListener("button-release", (e) => key(e, false));
      }
      if (isSensorInput(p.type))
        controls[p.id] ??= p.type.includes("photo")
          ? Number(p.attrs?.lux ?? 500)
          : p.type.includes("pir")
            ? false
            : Number(p.attrs?.level || 0);
      if (isMomentarySwitch(p.type)) {
        element.color = p.attrs?.color || "green";
        controls[p.id] ??= !!p.attrs?.pressed;
        element.pressed = !!controls[p.id];
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
    if (version === partRenderVersion) {
      for (const element of partElements.values()) {
        // Slim only the resistor body/bands; preserve lead positions and footprint.
        if (element.localName === "wokwi-resistor")
          element.shadowRoot
            ?.querySelector("svg > g")
            ?.setAttribute("transform", "translate(0 .48) scale(1 .68)");
        const slider = element.localName === "wokwi-slide-potentiometer";
        const toggle = element.localName === "wokwi-slide-switch";
        if (!slider && !toggle) continue;
        const head = element.shadowRoot?.querySelector(
          slider ? "#tip" : "#handle",
        );
        if (head) {
          head.style.cursor = slider ? "ew-resize" : "pointer";
          head.setAttribute(
            "aria-label",
            slider ? "Drag slider" : "Toggle switch",
          );
          const title = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "title",
          );
          title.textContent = slider
            ? "Drag to change value · Alt-drag to move part"
            : "Click to toggle · Alt-drag to move part";
          head.append(title);
        }
      }
      canvas.render();
      if (seatingChanged()) changed();
    }
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
  if (
    el &&
    (isPot(el.tagName.toLowerCase()) ||
      [
        "WOKWI-SLIDE-SWITCH", "P5COMP-SLIDE-SWITCH",
        "P5COMP-TOGGLE-SWITCH",
        "P5COMP-PHOTORESISTOR",
      ].includes(el.tagName))
  )
    el.value = value;
  if (dipCount(el?.localName) > 0) el.values = [...value];
  if (el && isMomentarySwitch(el.tagName.toLowerCase()))
    el.pressed = Boolean(value);
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
  for (const p of diagram.parts.filter(
    (p) =>
      isPot(p.type) ||
      p.type === TYPES[3] ||
      isMomentarySwitch(p.type) ||
      isSensorInput(p.type) ||
      [
        "wokwi-dip-switch-8", "p5comp-dip-switch-1", "p5comp-dip-switch-4", "p5comp-dip-switch-6",
        "wokwi-slide-switch", "p5comp-slide-switch",
        "p5comp-toggle-switch",
        "p5comp-photoresistor",
        "wokwi-membrane-keypad",
      ].includes(p.type),
  )) {
    const div = document.createElement("div");
    div.className = "control";
    const label = document.createElement("label");
    label.textContent = p.id;
    div.append(label);
    const output = document.createElement("output");
    output.dataset.value = p.id;
    if (
      isSensorInput(p.type) ||
      [
        "wokwi-dip-switch-8", "p5comp-dip-switch-1", "p5comp-dip-switch-4", "p5comp-dip-switch-6",
        "wokwi-slide-switch", "p5comp-slide-switch",
        "p5comp-toggle-switch",
        "p5comp-photoresistor",
        "wokwi-membrane-keypad",
      ].includes(p.type)
    ) {
      const button = document.createElement("button");
      button.textContent = "Simulate";
      button.setAttribute("aria-label", "Simulate " + p.id);
      button.onclick = () => inputSimulator.open(p);
      div.append(button);
      output.textContent = Array.isArray(controls[p.id])
        ? controls[p.id].join(" ")
        : String(controls[p.id]);
    } else if (isMomentarySwitch(p.type)) {
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
$("run").onclick = (e) => {
  if (e.altKey) return runArduino();
  if (running && (e.shiftKey || paused)) return $("pause").onclick();
  if (running) {
    stop();
    bridge.stop();
    return;
  }
  return runArduino();
};
$("compile").onclick = runArduino;
$("runP5").onclick = runP5;
$("reset").onclick = runArduino;
$("pause").onclick = () => {
  if (mode === "usb") return;
  paused = !paused;
  if (!agentMuteActions)
    agentSurface?.action("runtime", { action: paused ? "pause" : "resume" });
  worker?.postMessage({ type: "pause", paused });
  $("pause").textContent = paused ? "Resume simulation" : "Pause";
  $("pause").setAttribute("aria-label", $("pause").textContent);
  $("pause").disabled = false;
  status(paused ? "Paused · simulated Arduino" : "Running · simulated Arduino");
};
$("comms").onchange = async () => {
  const oldBaud = Number($("monitorBaud").value);
  api = $("comms").value;
  $("monitorBaud").value = api === "firmata" ? "57600" : "9600";
  monitorBaud = Number($("monitorBaud").value);
  let updatedComms = embedComms(sourceValue(p5Editor), api, {
    parser: firmataParserSource,
    client: firmataClientSource,
  });
  try { updatedComms = await formatCode(updatedComms, "javascript"); } catch {}
  setCode(p5Editor, updatedComms);
  workbench?.syncCommsLibrary(api);
  persist();
  if (api === "firmata")
    notice("Firmata requires StandardFirmata Arduino firmware (Examples).");
  if (serial.connected && oldBaud !== Number($("monitorBaud").value)) {
    try {
      const port = await serial.releasePort();
      await serial.reconnect(port, Number($("monitorBaud").value));
    } catch (e) {
      notice(e.message);
      log(e.message);
    }
  }
  if (running || serial.connected) runP5();
};
$("loadExample").onclick = () => {
  setCode(
    p5Editor,
    commsExample(api, {
      parser: firmataParserSource,
      client: firmataClientSource,
    }),
  );
  workbench?.syncCommsLibrary(api);
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
function addElement(type, attrs = {}, point = null) {
  if (type === "p5comp-note") return workbench?.addNote(point);
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
    left:
      point?.x ??
      (canvas.stage.clientWidth / 2 - canvas.camera.x) / canvas.camera.zoom,
    top:
      point?.y ??
      (canvas.stage.clientHeight / 2 - canvas.camera.y) / canvas.camera.zoom,
  };
  diagram.parts.push({ id, type, ...position, attrs: { ...attrs } });
  controls[id] = isPot(type)
    ? Number(attrs.value ?? 512)
    : type === TYPES[3]
      ? 100
      : type === "p5comp-photoresistor"
        ? Number(attrs.value ?? 100)
        : dipCount(type) > 0
          ? attrs.values || Array(dipCount(type)).fill(0)
          : type === "wokwi-membrane-keypad"
            ? []
            : ["wokwi-slide-switch", "p5comp-slide-switch", "p5comp-toggle-switch"].includes(type)
              ? Number(attrs.value || 0)
              : false;
  renderParts();
  canvas.commit(before, true);
  canvas.selectPart(id);
  const element = partElements.get(id);
  Promise.resolve(element?.updateComplete).then(() => {
    canvas.refreshPins();
    canvas.render();
  });
}
$("lesson").onclick = (e) => {
  const before = canvas.checkpoint();
  diagram = classroomCircuit();
  canvas.clearSelection();
  controls = { pot: 512, sonar: 100, b1: false, b2: false };
  selectedWire = -1;
  selectedPart = null;
  renderParts();
  canvas.commit(before, true);
  canvas.cleanup(e.shiftKey ? "simple" : "careful");
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
  inputSimulator.close();
  const candidate = d.diagram || d;
  validateDiagram(candidate);
  stop();
  diagram = candidate;
  controls = d.controls || {};
  if (typeof d.arduino === "string") setCode(arduinoEditor, d.arduino);
  if (d.p5) {
    savedP5 = Object.fromEntries(
      Object.entries(d.p5).map(([api, source]) => [
        api,
        upgradeManagedComms(source,api),
      ]),
    );
    api = ["native", "none", "firmata"].includes(d.api) ? d.api : "webserial";
    $("comms").value = api;
    setCode(
      p5Editor,
      savedP5[api] || commsExample(api, {parser: firmataParserSource, client: firmataClientSource}),
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
  notice("Project opened. Run to start the Arduino.");
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
  const endings = { none: "", lf: "\n", cr: "\r", crlf: "\r\n" };
  writeBytes(
    new TextEncoder().encode(
      $("sendText").value + endings[$("monitorEnding").value],
    ),
  );
};
let monitorBaud = api === "firmata" ? 57600 : 9600;
$("monitorBaud").value = String(monitorBaud);
$("monitorBaud").title =
  "USB serial baud rate. Simulation delivers decoded UART bytes.";
$("monitorBaud").onchange = async () => {
  const next = Number($("monitorBaud").value);
  try {
    if (serial.connected) {
      const port = await serial.releasePort();
      await serial.reconnect(port, next);
    }
    monitorBaud = next;
  } catch (error) {
    $("monitorBaud").value = String(monitorBaud);
    notice(error.message);
  }
};
$("clearLog").onclick = () => {
  lines = [];
  $("log").textContent = "";
};
serial.addEventListener("bytes", (e) => receive(e.detail));
serial.addEventListener("connect", () => {
  discoverPortName(serial.port);
  mode = "usb";
  status(`Connected · ${usbIdentity()} (${boardLabel()})`);
  updateConnection();
  runP5();
});
serial.addEventListener("disconnect", () => {
  serialActivity.clear();
  status("USB disconnected");
  updateConnection();
});
serial.addEventListener("error", (e) => notice(e.detail.message));
let usbBusy = false;
async function connectUSB(port = null) {
  stop();
  await serial.connect({ baudRate: Number($("monitorBaud").value), port });
}
const usbMenu = document.createElement("div");
usbMenu.className = "usb-connection-menu";
usbMenu.setAttribute("popover", "auto");
document.body.append(usbMenu);
$("usb").onclick = () => {
  usbMenu.replaceChildren();
  const add = (label, action) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.disabled = usbBusy;
    button.onclick = async () => {
      usbMenu.hidePopover();
      usbBusy = true;
      try { await action(); } catch (error) { if (error.name !== "NotFoundError") notice(error.message); }
      finally { usbBusy = false; updateConnection(); }
    };
    usbMenu.append(button);
  };
  if (serial.connected) {
    add(`Disconnect ${usbIdentity()}`, async () => { await serial.disconnect(); mode = "simulation"; });
  }
  add(serial.connected ? "Choose a different USB device…" : "Choose USB device…", async () => {
    // Request first, within the click gesture; cancelling preserves the active connection.
    const port = await navigator.serial.requestPort();
    if (port === serial.port) return;
    if (serial.connected) await serial.disconnect();
    await connectUSB(port);
  });
  const rect = $("usb").getBoundingClientRect();
  usbMenu.style.left = Math.min(rect.left, innerWidth - 280) + "px";
  usbMenu.style.top = rect.bottom + 4 + "px";
  usbMenu.showPopover();
};
async function uploadFirmware() {
  if (usbBusy) return;
  if (diagram.parts.some((p) => p.type === "wokwi-arduino-mega")) {
    notice(
      "Mega simulation/compilation is supported; use the reference Code uploader for Mega hardware (STK500v2).",
    );
    return;
  }
  usbBusy = true;
  $("upload").disabled = true;
  $("compileUpload").disabled = true;
  try {
    if (!serial.connected) await connectUSB();
    await getFirmware();
    const port = await serial.releasePort();
    try {
      await flashUno(port, artifact.hex, (p) => {
        status(p);
        log(p);
      });
    } finally {
      await serial.reconnect(port, Number($("monitorBaud").value));
    }
    status(`Uploaded and verified · ${usbIdentity()} (${boardLabel()})`);
    log(`Uploaded and verified · ${usbIdentity()} (${boardLabel()})`);
  } catch (e) {
    notice(e.message);
    log("Upload failed: " + e.message);
    workbench?.editorStatus("arduino", "Upload failed: " + e.message, "error");
  } finally {
    usbBusy = false;
    updateConnection();
  }
}
$("upload").onclick = uploadFirmware;
// Native clipboard events keep editor and browser text shortcuts intact.
const canvasEditing = e => e.composedPath().some(n=>n.matches?.('input,select,textarea,.cm-editor,[contenteditable]:not([contenteditable="false"])'));
document.addEventListener("copy",e=>{
  if(canvasEditing(e))return;
  const ref=workbench?.references.find(r=>r.id===workbench.selectedReferenceId);
  const fragment=ref?{reference:structuredClone(ref)}:{circuit:canvas.copySelection()};
  if(!ref&&!fragment.circuit.parts.length&&!fragment.circuit.connections.length)return;
  const text=JSON.stringify({format:"p5comp-selection-v1",...fragment});
  e.clipboardData.setData("text/plain",text);e.preventDefault();
});
document.addEventListener("paste",e=>{
  if(canvasEditing(e))return;
  let data;try{data=JSON.parse(e.clipboardData.getData("text/plain"));}catch{return;}
  if(data?.format!=="p5comp-selection-v1")return;
  e.preventDefault();
  if(data.reference)workbench.duplicateReference(data.reference,20);
  else if(data.circuit?.parts&&data.circuit?.connections)canvas.pasteSelection(data.circuit);
});
document.addEventListener("keydown", (e) => {
  if (!isObjectDeleteShortcut(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (!workbench?.deleteSelectedReference()) {
    canvas.selectedBend > 0 ? canvas.removeBend() : canvas.deleteSelection();
  }
}, {capture:true});
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.repeat || canvasEditing(e)) return;
  if (!(e.metaKey || e.ctrlKey) || !["z", "y"].includes(e.key.toLowerCase())) return;
  if (workbench.activeView === "draw" || workbench.activeView === "p5") return;
  const redo = e.key.toLowerCase() === "y" || e.shiftKey;
  if (!(redo ? canvas.redoStack : canvas.undoStack).length) return;
  e.preventDefault();
  e.stopPropagation();
  redo ? canvas.redo() : canvas.undo();
}, { capture: true });
document.addEventListener("keydown", (e) => {
  const modifier = e.metaKey || e.ctrlKey;
  if (modifier && e.key === ".") {
    e.preventDefault();
    stop();
    bridge.stop();
    return;
  }
  const editing = e
    .composedPath()
    .some((n) =>
      n.matches?.("input,select,textarea,.cm-editor,[contenteditable]:not([contenteditable=false])"),
    );
  if (
    modifier &&
    e.key === "Enter" &&
    !editing &&
    !e.defaultPrevented &&
    !e.repeat
  ) {
    e.preventDefault();
    if (!running || paused) runArduino();
    return;
  }
  if (editing || e.repeat) return;
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
  if (e.composedPath().some(n => n.matches?.("input,select,textarea,.cm-editor,[contenteditable]:not([contenteditable=false])"))) return;
  const id =
    e.key.toLowerCase() === "a"
      ? "b1"
      : e.key.toLowerCase() === "b"
        ? "b2"
        : null;
  if (id && partElements.has(id)) setControl(id, false);
});
window.addEventListener("blur", () => {
  for (const p of diagram.parts.filter((p) => isMomentarySwitch(p.type)))
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
$("run").classList.remove("primary");
$("run").dataset.running = "false";
$("run").setAttribute("aria-pressed", "false");
$("run").title =
  "Run Arduino + p5 · Shift-click: pause/resume · Option/Alt-click: reset";
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
  setControl,
  setCode,
  stop,
  runP5,
  runArduino,
  commsExample: (api) =>
    commsExample(api, {
      parser: firmataParserSource,
      client: firmataClientSource,
    }),
  seated: (id) => currentContacts().filter(([pin]) => pin.startsWith(id + ":")),
  clearSelection: () => {
    selectedPart = null;
    selectedWire = -1;
    canvas.clearSelection();
    canvas.render();
  },
  selected: () => diagram.parts.find((p) => p.id === selectedPart),
  element: () => partElements.get(selectedPart),
  updatePart: (next, targetId = selectedPart) => {
    const before = canvas.checkpoint();
    if (!targetId || !diagram.parts.some((p) => p.id === targetId))
      throw new Error("This component no longer exists.");
    const previous = diagram.parts.find((p) => p.id === targetId);
    const candidate = structuredClone(diagram);
    candidate.parts[candidate.parts.findIndex((p) => p.id === targetId)] = next;
    if (next.id !== targetId)
      candidate.connections = candidate.connections.map((c) =>
        c.map((v, i) =>
          i < 2 && typeof v === "string" && v.startsWith(targetId + ":")
            ? next.id + v.slice(targetId.length)
            : v,
        ),
      );
    if (next.id !== targetId) {
      for (const field of ["attachments","detachedContacts"])
        if (candidate[field]) candidate[field] = candidate[field].map(pair => pair.map(id=>id.startsWith(targetId+":") ? next.id + id.slice(targetId.length) : id));
      if (candidate.groups) candidate.groups = candidate.groups.map(g=>g.map(id=>id === targetId ? next.id : id));
    }
    validateDiagram(candidate);
    if (next.id !== targetId) {
      controls[next.id] = controls[targetId];
      delete controls[targetId];
      selectedPart = next.id;
    }
    if (
      ([
        "wokwi-slide-switch", "p5comp-slide-switch",
        "p5comp-toggle-switch",
        "p5comp-photoresistor",
      ].includes(next.type) ||
        isPot(next.type)) &&
      next.attrs?.value !== previous.attrs?.value &&
      next.attrs?.value !== undefined
    ) {
      const value = Number(next.attrs.value);
      if (!Number.isFinite(value)) throw new Error("Enter a numeric value.");
      controls[next.id] = [
        "wokwi-slide-switch", "p5comp-slide-switch",
        "p5comp-toggle-switch",
      ].includes(next.type)
        ? value
          ? 1
          : 0
        : Math.max(0, Math.min(1023, value));
      next.attrs.value = controls[next.id];
    }
    if (isMomentarySwitch(next.type) && next.attrs?.pressed !== undefined)
      controls[next.id] = !!next.attrs.pressed;
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
    p5: { webserial: commsExample("webserial") },
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

// All external transports use this same semantic adapter; no arbitrary-eval endpoint.
agentSurface = installAgentSurface(
  createAgentAdapter({
    workspace: key,
    project,
    state: () => ({
      running,
      paused,
      mode,
      p5Running: !!workbench.p5Running,
      selection: {
        parts: [...canvas.selectedParts],
        wires: [...canvas.selectedWires],
      },
      controls: structuredClone(controls),
      topology,
      simulation: agentLatestState,
      console: lines.slice(-200),
      api,
    }),
    applyProject: async (next, { replace = false } = {}) => {
      validateDiagram(next.diagram || next);
      if (
        next.workbench?.references &&
        !Array.isArray(next.workbench.references)
      )
        throw Error("references must be an array.");
      if (
        next.workbench?.files &&
        Object.values(next.workbench.files).some((v) => typeof v !== "string")
      )
        throw Error("Source files must be strings.");
      if (next.arduino != null && typeof next.arduino !== "string") throw Error("Arduino source must be text.");
      if (next.p5 && (typeof next.p5 !== "object" || Object.values(next.p5).some(v => typeof v !== "string"))) throw Error("p5 source must be text.");
      if (next.canvas?.camera && (![next.canvas.camera.x,next.canvas.camera.y,next.canvas.camera.zoom].every(Number.isFinite) || next.canvas.camera.zoom <= 0)) throw Error("Invalid canvas camera.");
      for (const ref of next.workbench?.references || [])
        if (!ref || typeof ref.id !== "string" || !["note","image","video","webcam"].includes(ref.kind) || !Number.isFinite(ref.x) || !Number.isFinite(ref.y) || !(ref.width > 0)) throw Error("Invalid scene reference.");
      const previousProject = project();
      const stable = p => ({ diagram: p.diagram, arduino: p.arduino, p5: p.p5, api: p.api, workbench: p.workbench });
      if (!replace && JSON.stringify(stable(previousProject)) === JSON.stringify(stable(next))) {
        const updatedControls = next.controls || {};
        for (const [id, value] of Object.entries(updatedControls))
          if (JSON.stringify(value) !== JSON.stringify(controls[id])) setControl(id, value);
        controls = structuredClone(updatedControls);
        worker?.postMessage({ type: "controls", controls });
        if (next.canvas) {
          const { camera, color, ...view } = next.canvas;
          Object.assign(canvas, view);
          if (camera) Object.assign(canvas.camera, camera);
          if (color) canvas.newColor = color;
          canvas.view();
        }
        artifact = next.artifact || null;
        persist();
        return { updated: true };
      }
      const resume = running && !replace;
      agentMuteActions = true;
      agentMuteObserve = true;
      try {
        openProject(structuredClone(next));
        bridge.stop();
      } finally {
        agentMuteActions = false;
        agentMuteObserve = false;
      }
      if (resume) {
        agentMuteActions = true;
        try {
          await runArduino();
        } finally {
          agentMuteActions = false;
        }
      }
      return { opened: true };
    },
    setControl,
    drawing: (a) => drawingCommand(workbench.drawing, a),
    exportPDF: async () => { await workbench.export("PDF"); return {downloaded:true,format:"pdf"}; },
    runtime: async (action) => {
      if (action === "start") {
        await runArduino();
        if (!running) throw Error("Simulation did not start. Check console diagnostics.");
        return { running };
      }
      if (action === "stop") {
        stop();
        bridge.stop();
        return { running: false };
      }
      if (action === "p5_start") {
        await runP5();
        return { started: true };
      }
      if (action === "p5_stop") {
        bridge.stop();
        agentSurface?.action("runtime", { action });
        return { stopped: true };
      }
      if (action === "compile") {
        const hex = await getFirmware();
        return { compiled: true, bytes: hex.length };
      }
      if (action === "pause" || action === "resume") {
        if (running && paused !== (action === "pause")) $("pause").onclick();
        return { paused };
      }
      throw Error("Unsupported runtime action.");
    },
    canvas: async (a) => {
      if (["group","ungroup","unplug"].includes(a.action)) {
        if (a.ids) { canvas.clearSelection(); for (const id of a.ids) if (!canvas.selectedParts.has(id)) canvas.selectPart(id,true); }
        if (a.action === "unplug") {
          const before = canvas.checkpoint();
          unplugContacts(diagram,(diagram.attachments || []).filter(([child]) => (a.ids || [...canvas.selectedParts]).includes(child.split(":")[0])));
          canvas.clearSelection(); canvas.commit(before,true);
        } else canvas.groupSelection(a.action === "ungroup");
      }
      if (a.action === "fit") canvas.fit();
      if (a.action === "cleanup") canvas.cleanup(a.mode || "careful");
      if (a.action === "autoroute") {
        if (a.index == null) canvas.cleanup(a.mode || "careful");
        else canvas.autoRoute(a.index, a.mode || "careful");
      }
      if (a.action === "undo") canvas.undo();
      if (a.action === "redo") canvas.redo();
      if (a.action === "select") {
        canvas.clearSelection();
        for (const id of a.ids || []) {
          if (!diagram.parts.some((p) => p.id === id))
            throw Error("Part not found: " + id);
          if (!canvas.selectedParts.has(id)) canvas.selectPart(id, true);
        }
      }
      if (a.action === "view") {
        const view = a.view || {};
        if (view.camera) {
          const c = view.camera;
          if (
            ![c.x, c.y, c.zoom].every(Number.isFinite) ||
            c.zoom < 0.15 ||
            c.zoom > 4
          )
            throw Error("Invalid camera.");
          Object.assign(canvas.camera, c);
          canvas.view();
        }
        if (view.labels != null) canvas.setLabels(!!view.labels);
        if (view.gridMultiplier != null)
          canvas.setGridMultiplier(view.gridMultiplier);
        if (view.gridReference) {
          if (!["breadboard", "arduino", "none"].includes(view.gridReference))
            throw Error("Invalid grid reference.");
          canvas.gridReference = view.gridReference;
          canvas.view();
        }
        persist();
      }
      return { view: canvas.getState(), selection: [...canvas.selectedParts] };
    },
    view: (a) => {
      if (a.inspector) workbench.tab(a.inspector);
      if (a.bottom) workbench.bottomTab(a.bottom);
      if (a.main || a.layout)
        workbench.mainView(
          a.main || workbench.activeView || "circuit",
          a.layout || workbench.layout || "tabs",
        );
      if (a.dock) workbench.dock(a.dock);
      persist();
      return workbench.snapshot();
    },
    serial: async (a) => {
      if (a.action === "read") return lines.slice(-200);
      if (mode !== "simulation" || !running)
        throw Error(
          "Serial API writes require a running simulation. Use the UI for physical devices.",
        );
      const text = String(a.text || "");
      worker.postMessage({
        type: "write",
        bytes: [...new TextEncoder().encode(text)],
      });
      agentSurface?.action("serial", a);
      return { bytes: text.length };
    },
  }),
);
window.physicalP5.agent = window.p5comp;
bridge.addEventListener("status", (e) =>
  agentSurface.emit("p5.status", { message: e.detail }),
);
bridge.addEventListener("runtimeError", (e) =>
  agentSurface.emit("p5.error", e.detail),
);
bridge.addEventListener("console", (e) =>
  agentSurface.emit("p5.console", e.detail),
);
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("button");
  if (!b) return;
  const label = b.getAttribute("aria-label") || b.title || b.textContent.trim();
  if (/camera|capture|share window|snapshot|upload|USB/i.test(label))
    agentSurface.emit("external.intent", { label, replayable: false });
});

document.addEventListener("p5comp:human-p5-stop", () => { if (!agentMuteActions) agentSurface?.action("runtime", { action: "p5_stop" }); });

circuitAudio.mount(document.getElementById("globalSettings"));

updateConnection();
status(`Ready · (${boardLabel()} sim)`);
