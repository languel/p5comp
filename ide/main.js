import { initializeSectionUI } from "../shared/ui/sectionUI.js";
import { createEditor } from "../shared/editor/createEditor.js";
import { boardForId, boards } from "../shared/boards/boards.js";
import {
  loadJSON,
  loadText,
  saveJSON,
  saveText,
} from "../shared/persistence/storage.js";
import { P5Bridge } from "../shared/p5/P5Bridge.js";
import { SerialConnection } from "../shared/serial/SerialConnection.js";
import { parseSignals, SignalStore } from "../shared/serial/signals.js";
import { examples } from "./examples.js";
import { AVRUploader } from "../shared/serial/AVRUploader.js";
import { initializeTheme } from "../shared/ui/theme.js";

initializeTheme();
const store = new SignalStore();
const serial = new SerialConnection();
const uploader = new AVRUploader();
const boardSelect = document.querySelector("#boardSelect");
const baudSelect = document.querySelector("#baudSelect");
const connectBtn = document.querySelector("#connectBtn");
const disconnectBtn = document.querySelector("#disconnectBtn");
const runBtn = document.querySelector("#runBtn");
const uploadBtn = document.querySelector("#uploadBtn");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#statusDot");
const serialIndicator = document.querySelector("#serialIndicator");
const serialOutput = document.querySelector("#serialOutput");
const consoleOutput = document.querySelector("#consoleOutput");
const buildOutput = document.querySelector("#buildOutput");
const signalsEl = document.querySelector("#signals");
const signalCount = document.querySelector("#signalCount");
const serialBadge = document.querySelector("#serialBadge");
const p5Frame = document.querySelector("#p5Frame");
const outputViews = {
  serial: serialOutput,
  console: consoleOutput,
  build: buildOutput,
};
const exampleSelect = document.querySelector("#exampleSelect");
const saved = loadJSON("physical-p5.ide.settings", {
  board: "uno",
  baudRate: 9600,
});

boardSelect.value = boards[saved.board] ? saved.board : "uno";
baudSelect.value = String(saved.baudRate ?? 9600);

function currentBoard() {
  return boardForId(boardSelect.value);
}

function addLog(target, message, kind = "") {
  target.querySelector(".output-hint")?.remove();
  const line = document.createElement("p");
  line.className = `log-line ${kind}`;
  line.textContent = message;
  target.append(line);
  while (target.children.length > 400) target.firstElementChild.remove();
  target.scrollTop = target.scrollHeight;
}

function addCompilerOutput(text, kind) {
  for (const message of text.trimEnd().split(/\r?\n/)) {
    const diagnostic = message.match(
      /:(\d+):(\d+):\s*(?:fatal\s+)?(error|warning):/i,
    );
    if (!diagnostic) {
      addLog(buildOutput, message, kind);
      continue;
    }

    buildOutput.querySelector(".output-hint")?.remove();
    const button = document.createElement("button");
    button.type = "button";
    const severity =
      diagnostic[3].toLowerCase() === "warning" ? "warn" : "error";
    button.className = `log-line diagnostic ${severity}`;
    button.textContent = message;
    button.title = `Open Arduino line ${diagnostic[1]}`;
    button.addEventListener("click", () => {
      const lineNumber = Math.max(
        1,
        Math.min(Number(diagnostic[1]), arduinoEditor.state.doc.lines),
      );
      const line = arduinoEditor.state.doc.line(lineNumber);
      const column = Math.max(1, Number(diagnostic[2]));
      const position = Math.min(line.from + column - 1, line.to);
      document.querySelector('[data-editor-tab="arduino"]').click();
      arduinoEditor.dispatch({
        selection: { anchor: position },
        scrollIntoView: true,
      });
      arduinoEditor.focus();
    });
    buildOutput.append(button);
    while (buildOutput.children.length > 400)
      buildOutput.firstElementChild.remove();
  }
  buildOutput.scrollTop = buildOutput.scrollHeight;
}

function setStatus(message, mode = "disconnected") {
  status.textContent = message;
  statusDot.className = `status-dot ${mode}`;
  serialIndicator.textContent =
    mode === "connected" ? "Board connected" : "Waiting for board";
}

function updateConnectionUI(connected) {
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  document.querySelector("#sendBtn").disabled = !connected;
  document.querySelector("#ledBtn").disabled = !connected;
  document.querySelector("#pwmSlider").disabled = !connected;
  document.querySelector("#autoBtn").disabled = !connected;
  bridge.updateState(store.values, connected, "usb");
}

const arduinoEditor = createEditor({
  parent: document.querySelector("#arduinoEditor"),
  value: loadText("physical-p5.ide.arduino", examples.input.arduino),
  language: "cpp",
  onChange: (value) => saveText("physical-p5.ide.arduino", value),
  onRun: runP5,
  onUpload: compileAndUpload,
});
const p5Editor = createEditor({
  parent: document.querySelector("#p5Editor"),
  value: loadText("physical-p5.ide.p5", examples.input.p5),
  language: "javascript",
  onChange: (value) => saveText("physical-p5.ide.p5", value),
  onRun: runP5,
  onUpload: compileAndUpload,
});

const bridge = new P5Bridge(p5Frame, {
  onSend: (name, value) => sendNamed(name, value),
  onSendLine: (text) => sendRaw(text),
  onSerialWrite: (bytes) =>
    serial.write(bytes).catch((e) => addLog(serialOutput, e.message, "error")),
});
bridge.addEventListener("console", (event) => {
  const { level, values } = event.detail;
  addLog(
    consoleOutput,
    `[${level}] ${values.map(formatConsoleValue).join(" ")}`,
    level === "error" ? "error" : level === "warn" ? "warn" : "",
  );
});
bridge.addEventListener("runtimeError", (event) => {
  const detail = event.detail;
  addLog(
    consoleOutput,
    `Error${detail.line ? ` at line ${detail.line}` : ""}: ${detail.message}`,
    "error",
  );
  activateOutput("console");
});

function formatConsoleValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function runP5() {
  consoleOutput.replaceChildren();
  addLog(consoleOutput, "▶ Running sketch", "out");
  bridge.run(p5Editor.state.doc.toString());
  activateOutput("console");
}

async function connectBoard() {
  connectBtn.disabled = true;
  setStatus("Connecting…", "busy");
  try {
    await serial.connect({ baudRate: Number(baudSelect.value) });
  } catch (error) {
    setStatus(error.message, "disconnected");
    addLog(serialOutput, `Connection error: ${error.message}`, "error");
    connectBtn.disabled = false;
  }
}

async function disconnectBoard() {
  disconnectBtn.disabled = true;
  try {
    await serial.disconnect();
  } catch (error) {
    addLog(serialOutput, `Disconnect error: ${error.message}`, "error");
    setStatus(`Disconnect failed: ${error.message}`, "disconnected");
  }
}

async function sendNamed(name, value) {
  const numeric = Number(value);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !Number.isFinite(numeric)) {
    addLog(
      serialOutput,
      "send(name, value) expects a valid name and a finite number.",
      "error",
    );
    return;
  }
  await sendRaw(`${name}: ${numeric}`);
}

async function sendRaw(text) {
  try {
    await serial.writeLine(text);
    addLog(serialOutput, `> ${text}`, "out");
    serialBadge.textContent = String(Number(serialBadge.textContent || 0) + 1);
  } catch (error) {
    addLog(serialOutput, `Write error: ${error.message}`, "error");
  }
}

function renderSignals(values) {
  for (const [name, value] of Object.entries(values).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    let row = signalsEl.querySelector(`[data-signal="${CSS.escape(name)}"]`);
    if (!row) {
      signalsEl.querySelector(".empty-state")?.remove();
      row = document.createElement("div");
      row.className = "signal-row";
      row.dataset.signal = name;
      const top = document.createElement("div");
      top.className = "signal-topline";
      const label = document.createElement("span");
      label.className = "signal-name";
      label.textContent = name;
      const output = document.createElement("span");
      output.className = "signal-value";
      top.append(label, output);
      row.append(top);
      if (/^A\d+$/.test(name)) {
        const bar = document.createElement("div");
        bar.className = "signal-bar";
        const fill = document.createElement("span");
        bar.append(fill);
        row.append(bar);
      }
      signalsEl.append(row);
    }
    row.querySelector(".signal-value").textContent = String(value);
    const fill = row.querySelector(".signal-bar > span");
    if (fill)
      fill.style.width = `${Math.max(0, Math.min(100, (value / 1023) * 100))}%`;
  }
  signalCount.textContent = String(Object.keys(store.values).length);
}

function activateOutput(name) {
  document.querySelectorAll("[data-output-tab]").forEach((button) => {
    const active = button.dataset.outputTab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  for (const [key, view] of Object.entries(outputViews))
    view.classList.toggle("hidden", key !== name);
}

serial.addEventListener("connect", () => {
  setStatus(`${currentBoard().label} connected`, "connected");
  updateConnectionUI(true);
  addLog(serialOutput, `--- connected at ${baudSelect.value} baud ---`);
});
serial.addEventListener("disconnect", () => {
  setStatus("Disconnected", "disconnected");
  updateConnectionUI(false);
  addLog(serialOutput, "--- disconnected ---");
});
serial.addEventListener("line", (event) => {
  const line = event.detail;
  addLog(serialOutput, `< ${line}`, "in");
  serialBadge.textContent = String(Number(serialBadge.textContent || 0) + 1);
  store.update(parseSignals(line));
});
serial.addEventListener("bytes", (event) => bridge.serialBytes(event.detail));
serial.addEventListener("sent", (event) => {
  // The send functions log after successful writes so failures stay visible.
  void event;
});
serial.addEventListener("error", (event) => {
  addLog(serialOutput, `Serial read error: ${event.detail.message}`, "error");
  setStatus("Serial read error", "disconnected");
});
store.addEventListener("change", (event) => {
  renderSignals(event.detail);
  bridge.updateState(event.detail, serial.connected, "usb");
});

connectBtn.addEventListener("click", connectBoard);
disconnectBtn.addEventListener("click", disconnectBoard);
runBtn.addEventListener("click", runP5);
uploadBtn.addEventListener("click", compileAndUpload);
boardSelect.addEventListener("change", () => {
  saveJSON("physical-p5.ide.settings", {
    board: boardSelect.value,
    baudRate: Number(baudSelect.value),
  });
});
baudSelect.addEventListener("change", () => {
  saveJSON("physical-p5.ide.settings", {
    board: boardSelect.value,
    baudRate: Number(baudSelect.value),
  });
});
document.querySelectorAll("[data-editor-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.editorTab;
    document.querySelectorAll("[data-editor-tab]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document
      .querySelector("#arduinoEditor")
      .classList.toggle("hidden", name !== "arduino");
    document
      .querySelector("#p5Editor")
      .classList.toggle("hidden", name !== "p5");
    document.querySelector("#editorLanguage").textContent =
      name === "arduino" ? "Arduino / C++" : "JavaScript / p5.js";
    (name === "arduino" ? arduinoEditor : p5Editor).requestMeasure();
  });
});
document.querySelectorAll("[data-output-tab]").forEach((button) => {
  button.addEventListener("click", () =>
    activateOutput(button.dataset.outputTab),
  );
});
document.querySelector("#clearOutputBtn").addEventListener("click", () => {
  outputViews[
    document.querySelector("[data-output-tab].active").dataset.outputTab
  ].replaceChildren();
});

exampleSelect.addEventListener("change", () =>
  loadExample(exampleSelect.value),
);
document
  .querySelector("#resetExampleBtn")
  .addEventListener("click", () => loadExample(exampleSelect.value));

function loadExample(name) {
  const example = examples[name];
  if (!example) return;
  replaceEditorText(arduinoEditor, example.arduino);
  replaceEditorText(p5Editor, example.p5);
  saveText("physical-p5.ide.arduino", example.arduino);
  saveText("physical-p5.ide.p5", example.p5);
  activateOutput("build");
  buildOutput.replaceChildren();
  addLog(
    buildOutput,
    `Loaded ${exampleSelect.options[exampleSelect.selectedIndex].text}.`,
    "out",
  );
  runP5();
}

function replaceEditorText(editor, text) {
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: text },
  });
}

async function compileAndUpload() {
  if (!serial.connected) {
    activateOutput("build");
    addLog(
      buildOutput,
      "Connect to the board before compiling and uploading.",
      "error",
    );
    return;
  }
  uploadBtn.disabled = true;
  activateOutput("build");
  buildOutput.replaceChildren();
  addLog(buildOutput, `Compiling for ${currentBoard().label}…`, "out");
  setStatus("Compiling…", "busy");
  try {
    const response = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board: boardSelect.value,
        source: arduinoEditor.state.doc.toString(),
      }),
    });
    const result = await response.json();
    if (result.stdout) addCompilerOutput(result.stdout, "out");
    if (result.stderr)
      addCompilerOutput(result.stderr, result.ok ? "warn" : "error");
    if (!response.ok || !result.ok)
      throw new Error(result.stderr || `Compile failed (${response.status}).`);
    addLog(
      buildOutput,
      "Compile complete. Preparing the board for upload…",
      "out",
    );
    setStatus("Uploading…", "busy");
    const selectedPort = await serial.releasePort();
    updateConnectionUI(false);
    try {
      await uploader.flash({
        board: currentBoard(),
        port: selectedPort,
        firmware: result.hex,
        onProgress: (progress) => addLog(buildOutput, progress, "out"),
      });
    } finally {
      await serial.reconnect(selectedPort, Number(baudSelect.value));
    }
    addLog(
      buildOutput,
      "Upload complete. Waiting for the sketch to restart…",
      "out",
    );
    setStatus("Connected", "connected");
  } catch (error) {
    addLog(buildOutput, `Build / upload failed: ${error.message}`, "error");
    setStatus("Upload failed", "disconnected");
  } finally {
    uploadBtn.disabled = false;
  }
}

document.querySelector("#sendBtn").addEventListener("click", () => {
  sendNamed(
    document.querySelector("#sendName").value.trim(),
    document.querySelector("#sendValue").value,
  );
});
let ledValue = false;
const ledButton = document.querySelector("#ledBtn");
ledButton.addEventListener("click", () => {
  ledValue = !ledValue;
  ledButton.textContent = `LED 13: ${ledValue ? "ON" : "OFF"}`;
  sendNamed("LED", Number(ledValue));
});
const pwmSlider = document.querySelector("#pwmSlider");
pwmSlider.addEventListener("input", () =>
  sendNamed("brightness", pwmSlider.value),
);
document
  .querySelector("#autoBtn")
  .addEventListener("click", () => sendRaw("AUTO"));

navigator.serial?.addEventListener("disconnect", (event) => {
  if (event.target === serial.port) {
    serial.port = null;
    serial.isReading = false;
    setStatus("Board disconnected", "disconnected");
    updateConnectionUI(false);
    addLog(serialOutput, "The serial device was disconnected.", "error");
  }
});

runP5();

initializeSectionUI();
