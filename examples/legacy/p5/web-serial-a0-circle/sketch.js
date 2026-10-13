const SERIAL_BAUD_RATE = 9600;
const HANDSHAKE_RETRY_MS = 250;
const HANDSHAKE_MAX_ATTEMPTS = 20;

let port = null;
let reader = null;
let writer = null;
let readTask = null;
let inputBuffer = "";
let handshakeTimer = null;
let handshakeAttempts = 0;
let startRequested = false;
let isConnecting = false;
let isDisconnecting = false;

let statusMessage = "Disconnected";
let analogValue = 0;

function setup() {
  const connectButton = createButton("Connect");
  connectButton.parent("controls");
  connectButton.mousePressed(connectSerial);

  const disconnectButton = createButton("Disconnect");
  disconnectButton.parent("controls");
  disconnectButton.mousePressed(disconnectSerial);

  createCanvas(640, 420).parent("canvas-holder");
}

function draw() {
  background(255);
  noStroke();
  fill(35);
  textAlign(LEFT, TOP);
  textSize(16);
  text(`Status: ${statusMessage}`, 16, 14);
  text(`A0: ${analogValue}`, 16, 40);

  const diameter = map(analogValue, 0, 1023, 24, min(width, height) * 0.72);
  fill(65, 118, 210);
  circle(width / 2, height / 2 + 24, diameter);
}

async function connectSerial() {
  if (port || isConnecting || isDisconnecting) return;
  if (!("serial" in navigator)) {
    statusMessage = window.isSecureContext
      ? "Web Serial is unavailable in this browser. Try Chrome or Edge."
      : "Open this page from localhost or HTTPS to use Web Serial.";
    return;
  }

  isConnecting = true;
  let selectedPort;
  let nextReader;
  let nextWriter;

  try {
    selectedPort = await navigator.serial.requestPort();
    await selectedPort.open({ baudRate: SERIAL_BAUD_RATE });

    if (!selectedPort.readable || !selectedPort.writable) {
      throw new Error("The selected port is not readable and writable.");
    }

    nextReader = selectedPort.readable.getReader();
    nextWriter = selectedPort.writable.getWriter();
    port = selectedPort;
    reader = nextReader;
    writer = nextWriter;
    inputBuffer = "";
    startRequested = false;
    analogValue = 0;
    statusMessage = "Port open; waiting for Arduino handshake…";

    readTask = readLoop(selectedPort, nextReader);
    beginHandshake();
  } catch (error) {
    if (nextReader) {
      try { nextReader.releaseLock(); } catch (_) {}
    }
    if (nextWriter) {
      try { nextWriter.releaseLock(); } catch (_) {}
    }
    if (selectedPort?.readable && selectedPort?.writable) {
      try { await selectedPort.close(); } catch (_) {}
    }
    statusMessage = `Connect failed: ${error.message}`;
  } finally {
    isConnecting = false;
  }
}

function beginHandshake() {
  stopHandshake();
  handshakeAttempts = 0;
  sendHello();
  handshakeTimer = setInterval(() => {
    if (!port || startRequested) {
      stopHandshake();
      return;
    }
    if (handshakeAttempts >= HANDSHAKE_MAX_ATTEMPTS) {
      stopHandshake();
      statusMessage = "No READY response. Check the A0 demo firmware and 9600 baud.";
      return;
    }
    sendHello();
  }, HANDSHAKE_RETRY_MS);
}

function stopHandshake() {
  if (handshakeTimer !== null) {
    clearInterval(handshakeTimer);
    handshakeTimer = null;
  }
}

async function sendHello() {
  if (!writer || startRequested) return;
  handshakeAttempts += 1;
  await sendLine("HELLO");
}

async function sendLine(line) {
  if (!writer) return;
  try {
    await writer.write(new TextEncoder().encode(`${line}\n`));
  } catch (error) {
    statusMessage = `Write failed: ${error.message}`;
  }
}

async function readLoop(activePort, activeReader) {
  const decoder = new TextDecoder();

  try {
    while (port === activePort && reader === activeReader) {
      const { value, done } = await activeReader.read();
      if (done) break;
      if (!value) continue;

      inputBuffer += decoder.decode(value, { stream: true });
      const lines = inputBuffer.split("\n");
      inputBuffer = lines.pop();
      for (const line of lines) {
        const message = line.replace(/\r/g, "").trim();
        if (message) handleSerialLine(message);
      }
    }
  } catch (error) {
    if (port === activePort) statusMessage = `Read failed: ${error.message}`;
  } finally {
    if (reader === activeReader) {
      activeReader.releaseLock();
      reader = null;
    }
    if (port === activePort) statusMessage = "Serial stream closed; disconnect and reconnect.";
  }
}

function handleSerialLine(line) {
  if (line === "READY") {
    stopHandshake();
    if (!startRequested) {
      startRequested = true;
      statusMessage = "Arduino ready; starting A0 stream…";
      sendLine("START");
    }
    return;
  }

  if (line === "OK START") {
    statusMessage = "Streaming A0";
    return;
  }

  if (line.startsWith("A0 ")) {
    const value = Number(line.slice(3));
    if (Number.isFinite(value)) analogValue = constrain(value, 0, 1023);
    return;
  }

  statusMessage = `Arduino: ${line}`;
}

async function disconnectSerial() {
  if (isDisconnecting) return;
  const activePort = port;
  const activeReader = reader;
  const activeWriter = writer;

  if (!activePort) {
    statusMessage = "Disconnected";
    return;
  }

  isDisconnecting = true;
  stopHandshake();
  port = null;
  writer = null;

  try {
    if (activeReader) await activeReader.cancel();
    if (readTask) await readTask;
    if (activeWriter) {
      try {
        await activeWriter.close();
      } finally {
        activeWriter.releaseLock();
      }
    }
    await activePort.close();
    statusMessage = "Disconnected";
  } catch (error) {
    statusMessage = `Disconnect error: ${error.message}`;
    try { activeReader?.releaseLock(); } catch (_) {}
    try { activeWriter?.releaseLock(); } catch (_) {}
    try { await activePort.close(); } catch (_) {}
  } finally {
    readTask = null;
    isDisconnecting = false;
  }
}
