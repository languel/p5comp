import { basePath } from "../shared/basePath.js";
import { initializeSectionUI } from "../shared/ui/sectionUI.js";
import { createEditor } from "../shared/editor/createEditor.js";
import {
  loadJSON,
  loadText,
  saveJSON,
  saveText,
} from "../shared/persistence/storage.js";
import { P5Bridge } from "../shared/p5/P5Bridge.js";
import { SerialConnection } from "../shared/serial/SerialConnection.js";
import { AVRUploader } from "../shared/serial/AVRUploader.js";
import { FirmataClient, PIN_MODES } from "./FirmataClient.js";
import { firmataExamples } from "./examples.js";
import { initializeTheme } from "../shared/ui/theme.js";

initializeTheme();
const serial = new SerialConnection();
const uploader = new AVRUploader();
const boardSelect = document.querySelector("#boardSelect");
const connectBtn = document.querySelector("#connectBtn");
const disconnectBtn = document.querySelector("#disconnectBtn");
const flashBtn = document.querySelector("#flashBtn");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#statusDot");
const serialIndicator = document.querySelector("#serialIndicator");
const pinList = document.querySelector("#pinList");
const pinCount = document.querySelector("#pinCount");
const firmataOutput = document.querySelector("#firmataOutput");
const consoleOutput = document.querySelector("#consoleOutput");
const p5Frame = document.querySelector("#p5Frame");
const samplingSelect = document.querySelector("#samplingSelect");
const exampleSelect = document.querySelector("#exampleSelect");
const saved = loadJSON("physical-p5.firmata.settings", {
  board: "uno",
  sampling: 20,
  aliases: {},
  modes: {},
});
let client = null;
let pinsById = new Map();
let lastWrites = new Map();

boardSelect.value = saved.board === "mega" ? "mega" : "uno";
samplingSelect.value = String(saved.sampling ?? 20);

const editor = createEditor({
  parent: document.querySelector("#p5Editor"),
  value: loadText("physical-p5.firmata.p5", firmataExamples.light),
  language: "javascript",
  onChange: (value) => saveText("physical-p5.firmata.p5", value),
  onRun: runSketch,
});
const bridge = new P5Bridge(p5Frame);
bridge.addEventListener("pinWrite", (event) => {
  const { name, value } = event.detail;
  writePin(name, value, "p5");
});
bridge.addEventListener("console", (event) => {
  const { level, values } = event.detail;
  log(consoleOutput, `[${level}] ${values.map(formatValue).join(" ")}`, level);
});
bridge.addEventListener("runtimeError", (event) => {
  log(consoleOutput, `Error: ${event.detail.message}`, "error");
  activateConsole(true);
});

function formatValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function log(target, text, kind = "") {
  target.querySelector(".output-hint")?.remove();
  const row = document.createElement("p");
  row.className = `log-line ${kind === "error" ? "error" : kind === "warn" ? "warn" : ""}`;
  row.textContent = text;
  target.append(row);
  while (target.children.length > 350) target.firstElementChild.remove();
  target.scrollTop = target.scrollHeight;
}

function setStatus(text, mode = "disconnected") {
  status.textContent = text;
  statusDot.className = `status-dot ${mode}`;
  serialIndicator.textContent =
    mode === "connected" ? "Board connected" : "Waiting for board";
}

function runSketch() {
  consoleOutput.replaceChildren();
  log(consoleOutput, "▶ Running sketch", "out");
  bridge.run(editor.state.doc.toString());
  activateConsole(true);
}

function activateConsole(show) {
  document.querySelector("#consoleTab").classList.toggle("active", show);
  consoleOutput.classList.toggle("hidden", !show);
  firmataOutput.classList.toggle("hidden", show);
}

function persistPinSettings() {
  const aliases = {};
  const modes = {};
  for (const pin of client?.pins ?? []) {
    if (pin.alias) aliases[pin.id] = pin.alias;
    modes[pin.id] = pin.mode;
  }
  saveJSON("physical-p5.firmata.settings", {
    board: boardSelect.value,
    sampling: Number(samplingSelect.value),
    aliases,
    modes,
  });
  bridge.updatePins(client?.pins.map(exposePin) ?? []);
}

function exposePin(pin) {
  return {
    id: pin.id,
    pin: pin.pin,
    mode: PIN_MODES[pin.mode] ?? String(pin.mode),
    value: pin.value,
    alias: pin.alias,
  };
}

function publishPins() {
  bridge.updatePins(client?.pins.map(exposePin) ?? []);
}

function createPinRow(pin) {
  const row = document.createElement("div");
  row.className = "pin-row";
  row.dataset.pin = pin.id;

  const head = document.createElement("div");
  head.className = "pin-head";
  const id = document.createElement("span");
  id.className = "pin-id";
  id.textContent = pin.id;
  const alias = document.createElement("input");
  alias.className = "pin-alias";
  alias.maxLength = 24;
  alias.placeholder = "alias";
  alias.setAttribute("aria-label", `${pin.id} alias`);
  alias.value = pin.alias;
  const mode = document.createElement("select");
  mode.className = "pin-mode";
  mode.setAttribute("aria-label", `${pin.id} mode`);
  for (const capability of pin.capabilities) {
    const modeName = PIN_MODES[capability.mode];
    if (!modeName) continue;
    const option = document.createElement("option");
    option.value = String(capability.mode);
    option.textContent = modeName;
    mode.append(option);
  }
  mode.value = String(pin.mode);
  if (pin.id === "D0" || pin.id === "D1")
    mode.disabled = !document.querySelector("#unlockSerialPins").checked;
  mode.addEventListener("change", async () => {
    try {
      await client.setPinMode(pin.pin, Number(mode.value));
      updatePinRow(pin);
      persistPinSettings();
    } catch (error) {
      log(firmataOutput, `Mode error: ${error.message}`, "error");
      mode.value = String(pin.mode);
    }
  });
  alias.addEventListener("change", () => {
    const value = alias.value.trim();
    const conflicting = client.pins.find(
      (other) => other !== pin && other.alias === value,
    );
    if (
      value &&
      (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ||
        ["__proto__", "constructor", "prototype"].includes(value) ||
        client.pins.some((other) => other.id === value) ||
        conflicting)
    ) {
      log(
        firmataOutput,
        `Alias "${value}" is invalid or already in use.`,
        "error",
      );
      alias.value = pin.alias;
      return;
    }
    pin.alias = value;
    persistPinSettings();
    renderPinNames();
  });
  head.append(id, alias, mode);

  const valueLine = document.createElement("div");
  valueLine.className = "pin-value-line";
  const value = document.createElement("span");
  value.className = "pin-value";
  const control = document.createElement("span");
  control.className = "pin-control-wrap";
  valueLine.append(value, control);
  const bar = document.createElement("div");
  bar.className = "signal-bar";
  const fill = document.createElement("span");
  bar.append(fill);

  row.append(head, valueLine, bar);
  pinList.append(row);
  pinsById.set(pin.id, {
    row,
    mode,
    alias,
    value,
    control,
    controlMode: null,
    controlButton: null,
    controlSlider: null,
    controlReadout: null,
    bar,
    fill,
  });
  updatePinRow(pin);
}

function updatePinRow(pin) {
  const elements = pinsById.get(pin.id);
  if (!elements) return;
  const { mode, value, control, bar, fill } = elements;
  mode.value = String(pin.mode);
  const modeName = PIN_MODES[pin.mode];
  const displayValue = pin.value === null ? "—" : String(pin.value);
  value.innerHTML = "";
  const indicator = document.createElement("i");
  indicator.className = `pin-state ${pin.value ? "on" : ""}`;
  value.append(indicator, document.createTextNode(displayValue));
  bar.classList.toggle("hidden", !(modeName === "ANALOG"));

  if (elements.controlMode !== modeName) {
    control.replaceChildren();
    elements.controlMode = modeName;
    elements.controlButton = null;
    elements.controlSlider = null;
    elements.controlReadout = null;
    if (modeName === "OUTPUT") {
      const button = document.createElement("button");
      button.className = "pin-write";
      button.addEventListener("click", () =>
        writePin(pin.id, pin.value ? 0 : 1, "UI"),
      );
      control.append(button);
      elements.controlButton = button;
    } else if (modeName === "PWM") {
      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "pin-control";
      slider.min = "0";
      slider.max = "255";
      slider.setAttribute("aria-label", `${pin.id} PWM output`);
      slider.addEventListener("input", () =>
        writePin(pin.id, Number(slider.value), "UI"),
      );
      control.append(slider);
      elements.controlSlider = slider;
    } else if (modeName === "INPUT" || modeName === "INPUT_PULLUP") {
      const readout = document.createElement("span");
      readout.className = "pin-disabled";
      control.append(readout);
      elements.controlReadout = readout;
    }
  }

  if (modeName === "OUTPUT") {
    elements.controlButton.textContent = pin.value ? "ON" : "OFF";
  } else if (modeName === "PWM") {
    elements.controlSlider.value = String(pin.value ?? 0);
  } else if (modeName === "ANALOG") {
    fill.style.width = `${Math.max(0, Math.min(100, ((pin.value ?? 0) / 1023) * 100))}%`;
  } else if (modeName === "INPUT" || modeName === "INPUT_PULLUP") {
    elements.controlReadout.textContent =
      pin.value === null ? "waiting" : pin.value ? "HIGH" : "LOW";
  }
}

function renderPinNames() {
  for (const pin of client?.pins ?? []) {
    const elements = pinsById.get(pin.id);
    if (elements) elements.alias.value = pin.alias;
  }
  publishPins();
}

function renderPins() {
  pinList.replaceChildren();
  pinsById = new Map();
  for (const pin of client.pins) createPinRow(pin);
  pinCount.textContent = String(client.pins.length);
  publishPins();
}

async function writePin(id, value, source) {
  const amount = Number(value);
  if (!client || !Number.isFinite(amount)) return;
  const normalized = Math.round(amount);
  if (lastWrites.get(id) === normalized) return;
  lastWrites.set(id, normalized);
  try {
    await client.write(id, normalized);
    log(firmataOutput, `TX  ${source} ${id} ${normalized}`, "out");
  } catch (error) {
    if (lastWrites.get(id) === normalized) lastWrites.delete(id);
    log(firmataOutput, `Write error: ${error.message}`, "error");
  }
}

function attachClient() {
  client?.destroy();
  client = new FirmataClient(serial);
  client.addEventListener("version", (event) => {
    log(
      firmataOutput,
      `Firmata protocol ${event.detail.major}.${event.detail.minor}`,
    );
  });
  client.addEventListener("firmware", (event) => {
    document.querySelector("#firmwareInfo").textContent =
      `${event.detail.name || "Firmata"} ${event.detail.major}.${event.detail.minor}`;
    log(
      firmataOutput,
      `Firmware ${event.detail.name || "StandardFirmata"} ${event.detail.major}.${event.detail.minor}`,
    );
  });
  client.addEventListener("ready", async () => {
    const savedSettings = loadJSON("physical-p5.firmata.settings", {
      aliases: {},
      modes: {},
    });
    for (const pin of client.pins) {
      pin.alias = savedSettings.aliases?.[pin.id] ?? "";
      const wantedMode = savedSettings.modes?.[pin.id];
      if (
        wantedMode !== undefined &&
        pin.capabilities.some((capability) => capability.mode === wantedMode)
      )
        pin.mode = wantedMode;
    }
    renderPins();
    for (const pin of client.pins) {
      try {
        await client.setPinMode(pin.pin, pin.mode);
      } catch (error) {
        log(
          firmataOutput,
          `Could not configure ${pin.id}: ${error.message}`,
          "warn",
        );
      }
    }
    await client.setSamplingInterval(Number(samplingSelect.value));
    persistPinSettings();
    setStatus(`Connected · ${client.pins.length} pins discovered`, "connected");
    log(
      firmataOutput,
      `Discovered ${client.pins.length} pins. Input sampling ${samplingSelect.value} ms.`,
    );
  });
  client.addEventListener("pin", (event) => {
    const pin = event.detail;
    updatePinRow(pin);
    publishPins();
    log(firmataOutput, `RX  ${pin.id} ${pin.value ?? "—"}`);
  });
  client.addEventListener("error", (event) =>
    log(firmataOutput, event.detail.message, "error"),
  );
  client
    .initialize()
    .catch((error) =>
      log(firmataOutput, `Firmata query failed: ${error.message}`, "error"),
    );
}

async function connectBoard() {
  connectBtn.disabled = true;
  setStatus("Connecting…", "busy");
  try {
    await serial.connect({ baudRate: 57600 });
    attachClient();
    updateConnection(true);
    setStatus("Connected · querying board…", "busy");
    log(firmataOutput, "--- serial connected at 57600 baud ---", "out");
    window.setTimeout(() => {
      if (client && !client.capabilities) {
        log(
          firmataOutput,
          "No capability response. Check that StandardFirmata is installed and the board is set to 57600 baud.",
          "error",
        );
      }
    }, 3000);
  } catch (error) {
    setStatus(error.message, "disconnected");
    log(firmataOutput, `Connection error: ${error.message}`, "error");
    connectBtn.disabled = false;
  }
}

async function disconnectBoard() {
  try {
    client?.destroy();
    client = null;
    await serial.disconnect();
    updateConnection(false);
    setStatus("Disconnected");
  } catch (error) {
    log(firmataOutput, `Disconnect error: ${error.message}`, "error");
  }
}

async function flashFirmata() {
  if (!serial.connected || !client) return;
  flashBtn.disabled = true;
  setStatus("Preparing firmware…", "busy");
  let selectedPort;
  client.destroy();
  client = null;
  try {
    const response = await fetch(
      basePath(`firmata/firmware/firmata-${boardSelect.value}.hex`),
    );
    if (!response.ok)
      throw new Error(
        `Firmata firmware is unavailable for ${boardSelect.value}.`,
      );
    const firmware = await response.text();
    selectedPort = await serial.releasePort();
    updateConnection(false);
    await uploader.flash({
      board: { id: boardSelect.value },
      port: selectedPort,
      firmware,
      onProgress: (message) => log(firmataOutput, message, "out"),
    });
    log(firmataOutput, "Firmata firmware uploaded. Reconnecting…", "out");
  } catch (error) {
    log(firmataOutput, `Firmware upload failed: ${error.message}`, "error");
  } finally {
    if (selectedPort && !serial.port) {
      try {
        await serial.reconnect(selectedPort, 57600);
        attachClient();
        updateConnection(true);
      } catch (error) {
        setStatus(`Reconnect failed: ${error.message}`, "disconnected");
        log(firmataOutput, `Reconnect error: ${error.message}`, "error");
      }
    }
    flashBtn.disabled = !serial.connected;
    if (serial.connected && !client?.pins.length)
      setStatus("Reconnected · querying board…", "busy");
  }
}

function loadExample(name) {
  const source = firmataExamples[name];
  if (!source) return;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: source },
  });
  saveText("physical-p5.firmata.p5", source);
  runSketch();
}

function updatePortUnlock() {
  const unlocked = document.querySelector("#unlockSerialPins").checked;
  for (const id of ["D0", "D1"]) {
    const mode = pinsById.get(id)?.mode;
    if (mode) mode.disabled = !unlocked;
  }
}

serial.addEventListener("connect", () => {
  updateConnection(true);
});
serial.addEventListener("disconnect", () => {
  updateConnection(false);
  setStatus("Disconnected");
  client?.destroy();
  client = null;
});
serial.addEventListener("error", (event) =>
  log(firmataOutput, `Serial error: ${event.detail.message}`, "error"),
);
document.querySelector("#runBtn").addEventListener("click", runSketch);
connectBtn.addEventListener("click", connectBoard);
disconnectBtn.addEventListener("click", disconnectBoard);
flashBtn.addEventListener("click", flashFirmata);
exampleSelect.addEventListener("change", () =>
  loadExample(exampleSelect.value),
);
document
  .querySelector("#resetExampleBtn")
  .addEventListener("click", () => loadExample(exampleSelect.value));
samplingSelect.addEventListener("change", async () => {
  saveJSON("physical-p5.firmata.settings", {
    ...loadJSON("physical-p5.firmata.settings", {}),
    board: boardSelect.value,
    sampling: Number(samplingSelect.value),
  });
  if (client) {
    try {
      await client.setSamplingInterval(Number(samplingSelect.value));
      log(
        firmataOutput,
        `Sampling interval set to ${samplingSelect.value} ms.`,
        "out",
      );
    } catch (error) {
      log(firmataOutput, `Sampling update failed: ${error.message}`, "error");
    }
  }
});
boardSelect.addEventListener("change", () => {
  saveJSON("physical-p5.firmata.settings", {
    ...loadJSON("physical-p5.firmata.settings", {}),
    board: boardSelect.value,
  });
});
document
  .querySelector("#unlockSerialPins")
  .addEventListener("change", updatePortUnlock);
document
  .querySelector("#consoleTab")
  .addEventListener("click", () => activateConsole(true));
document.querySelector("#clearOutputBtn").addEventListener("click", () => {
  (consoleOutput.classList.contains("hidden")
    ? firmataOutput
    : consoleOutput
  ).replaceChildren();
});
navigator.serial?.addEventListener("disconnect", (event) => {
  if (event.target === serial.port) {
    client?.destroy();
    client = null;
    serial.port = null;
    updateConnection(false);
    setStatus("Board disconnected");
    log(firmataOutput, "The serial device was disconnected.", "error");
  }
});

function updateConnection(connected) {
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  flashBtn.disabled = !connected;
}

runSketch();

initializeSectionUI();
