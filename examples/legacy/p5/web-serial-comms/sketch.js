let port;
let reader;
let writer;
let readTask;
let inputBuffer = "";
let isConnecting = false;
let isDisconnecting = false;
const SERIAL_BAUD_RATE = 9600;

let connectBtn, disconnectBtn, cmdInput, logDiv;

function setup() {
  noCanvas();

  connectBtn = createButton("Connect");
  connectBtn.mousePressed(connectSerial);

  disconnectBtn = createButton("Disconnect");
  disconnectBtn.mousePressed(disconnectSerial);

  createDiv("");

  cmdInput = createInput("");
  cmdInput.attribute("placeholder", "Type command, e.g. /digitalWrite 8 1");
  cmdInput.elt.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const cmdline = cmdInput.value().trim();
      if (cmdline) {
        sendLine(cmdline);
        cmdInput.value("");
      }
    }
  });

  logDiv = createDiv("");
  logDiv.id("log");

  cmdlog("WebSerial demo ready.");
  cmdlog("Use the webserialio.ino command firmware at 9600 baud.");
  if (!("serial" in navigator)) {
    cmdlog("This browser does not support Web Serial.");
  }
}

function cmdlog(msg) {
  const t = new Date().toLocaleTimeString();
  logDiv.elt.textContent += `[${t}] ${msg}\n`;
  logDiv.elt.scrollTop = logDiv.elt.scrollHeight;
}

async function connectSerial() {
  if (port || isConnecting || isDisconnecting) return;

  if (!("serial" in navigator)) {
    const contextHint = window.isSecureContext
      ? "Use a browser with Web Serial support, such as Chrome or Edge."
      : "Open this page from localhost or HTTPS; Web Serial is unavailable on file:// pages.";
    cmdlog(contextHint);
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
      throw new Error("The selected serial port is not readable and writable.");
    }

    nextReader = selectedPort.readable.getReader();
    nextWriter = selectedPort.writable.getWriter();
    port = selectedPort;
    reader = nextReader;
    writer = nextWriter;
    inputBuffer = "";

    cmdlog(`Connected at ${SERIAL_BAUD_RATE} baud.`);
    readTask = readLoop(selectedPort, nextReader);
  } catch (err) {
    if (nextReader) {
      try { nextReader.releaseLock(); } catch (_) {}
    }
    if (nextWriter) {
      try { nextWriter.releaseLock(); } catch (_) {}
    }
    if (selectedPort?.readable && selectedPort?.writable) {
      try { await selectedPort.close(); } catch (_) {}
    }
    cmdlog("Connect failed: " + err.message);
  } finally {
    isConnecting = false;
  }
}

async function disconnectSerial() {
  if (isDisconnecting) return;
  const activePort = port;
  const activeReader = reader;
  const activeWriter = writer;

  if (!activePort) {
    cmdlog("Not connected.");
    return;
  }

  isDisconnecting = true;
  port = null; // Stop new writes and tell the read loop to exit after cancellation.
  writer = null;
  try {
    if (activeReader) {
      await activeReader.cancel();
    }
    if (readTask) {
      await readTask;
    }

    if (activeWriter) {
      try {
        await activeWriter.close();
      } finally {
        activeWriter.releaseLock();
      }
    }

    await activePort.close();
    cmdlog("Disconnected.");
  } catch (err) {
    cmdlog("Disconnect error: " + err.message);
  } finally {
    if (reader === activeReader) reader = null;
    if (writer === activeWriter) writer = null;
    readTask = null;
    isDisconnecting = false;
  }
}

async function sendLine(cmdline) {
  if (!writer) {
    cmdlog("Not connected.");
    return;
  }
  try {
    await writer.write(new TextEncoder().encode(cmdline + "\n"));
    cmdlog("> " + cmdline);
  } catch (err) {
    cmdlog("Write failed: " + err.message);
  }
}

async function readLoop(activePort, activeReader) {
  const textDecoder = new TextDecoder();
  try {
    while (port === activePort && reader === activeReader) {
      const { value, done } = await activeReader.read();
      if (done) break;
      if (value) {
        inputBuffer += textDecoder.decode(value, { stream: true });
        let lines = inputBuffer.split("\n");
        inputBuffer = lines.pop();

        for (let cmdline of lines) {
          cmdline = cmdline.replace(/\r/g, "").trim();
          if (cmdline.length) {
            handleSerialLine(cmdline);
          }
        }
      }
    }
  } catch (err) {
    if (port === activePort) {
      cmdlog("Read error: " + err.message);
    }
  } finally {
    if (reader === activeReader) {
      activeReader.releaseLock();
      reader = null;
    }
    if (port === activePort) {
      cmdlog("Serial input stream closed.");
    }
  }
}

function handleSerialLine(cmdline) {
  cmdlog("< " + cmdline);

  // Optional parsing hook:
  // RESULT digitalRead 2 1
  // RESULT analogRead A0 523
  // REPORT digital 2 0
  // REPORT analog A0 700
  const parts = cmdline.split(/\s+/);
  if (parts[0] === "RESULT") {
    const type = parts[1];
    const pin = parts[2];
    const value = parts[3];
    console.log({ kind: "result", type, pin, value });
  } else if (parts[0] === "REPORT") {
    const mode = parts[1];
    const pin = parts[2];
    const value = parts[3];
    console.log({ kind: "report", mode, pin, value });
  }
}

///////////////////////////////////////////////////
///// ARDUINO CODE
///////////////////////////////////////////////////
///// UPLOAD THE FOLLOWING TO ARDIUINO VIA IDE
///////////////////////////////////////////////////
// /////////
// /*
//   Minimal serial command protocol for p5.js + Web Serial

//   Commands:
//     /digitalWrite <pin> <0|1>
//     /digitalRead <pin>
//     /analogWrite <pin> <0-255>
//     /analogRead <pin>          // e.g. A0
//     /report digital <pin> <ms>
//     /report analog <pin> <ms>
//     /stopReport

//   Responses:
//     OK ...
//     RESULT ...
//     REPORT ...
//     ERR ...
// */

// String inputLine = "";

// bool reporting = false;
// String reportMode = "";   // "digital" or "analog"
// int reportPin = -1;
// unsigned long reportInterval = 200;
// unsigned long lastReport = 0;

// int parsePin(String token) {
//   token.trim();
//   token.toUpperCase();

//   if (token.startsWith("A")) {
//     int n = token.substring(1).toInt();
// #if defined(A0)
//     return A0 + n;
// #else
//     return n;
// #endif
//   }

//   return token.toInt();
// }

// void sendError(const String &msg) {
//   Serial.print("ERR ");
//   Serial.println(msg);
// }

// void handleCommand(String line) {
//   line.trim();
//   if (line.length() == 0) return;

//   if (line.startsWith("/")) {
//     line.remove(0, 1);
//   }

//   int s1 = line.indexOf(' ');
//   String cmd = (s1 == -1) ? line : line.substring(0, s1);
//   String rest = (s1 == -1) ? "" : line.substring(s1 + 1);
//   cmd.trim();

//   if (cmd == "digitalWrite") {
//     int s = rest.indexOf(' ');
//     if (s == -1) {
//       sendError("usage digitalWrite <pin> <0|1>");
//       return;
//     }
//     String pinTok = rest.substring(0, s);
//     String valTok = rest.substring(s + 1);
//     int pin = parsePin(pinTok);
//     int val = valTok.toInt();

//     pinMode(pin, OUTPUT);
//     digitalWrite(pin, val ? HIGH : LOW);

//     Serial.print("OK digitalWrite ");
//     Serial.print(pinTok);
//     Serial.print(" ");
//     Serial.println(val ? 1 : 0);
//     return;
//   }

//   if (cmd == "digitalRead") {
//     int pin = parsePin(rest);
//     pinMode(pin, INPUT);
//     int v = digitalRead(pin);

//     Serial.print("RESULT digitalRead ");
//     Serial.print(rest);
//     Serial.print(" ");
//     Serial.println(v);
//     return;
//   }

//   if (cmd == "analogWrite") {
//     int s = rest.indexOf(' ');
//     if (s == -1) {
//       sendError("usage analogWrite <pin> <0-255>");
//       return;
//     }
//     String pinTok = rest.substring(0, s);
//     String valTok = rest.substring(s + 1);
//     int pin = parsePin(pinTok);
//     int val = constrain(valTok.toInt(), 0, 255);

//     pinMode(pin, OUTPUT);
//     analogWrite(pin, val);

//     Serial.print("OK analogWrite ");
//     Serial.print(pinTok);
//     Serial.print(" ");
//     Serial.println(val);
//     return;
//   }

//   if (cmd == "analogRead") {
//     int pin = parsePin(rest);
//     int v = analogRead(pin);

//     Serial.print("RESULT analogRead ");
//     Serial.print(rest);
//     Serial.print(" ");
//     Serial.println(v);
//     return;
//   }

//   if (cmd == "report") {
//     // report digital 2 200
//     // report analog A0 100
//     int s1r = rest.indexOf(' ');
//     if (s1r == -1) {
//       sendError("usage report <digital|analog> <pin> <ms>");
//       return;
//     }
//     String mode = rest.substring(0, s1r);
//     String rest2 = rest.substring(s1r + 1);

//     int s2r = rest2.indexOf(' ');
//     if (s2r == -1) {
//       sendError("usage report <digital|analog> <pin> <ms>");
//       return;
//     }

//     String pinTok = rest2.substring(0, s2r);
//     String msTok = rest2.substring(s2r + 1);

//     if (mode != "digital" && mode != "analog") {
//       sendError("report mode must be digital or analog");
//       return;
//     }

//     reportMode = mode;
//     reportPin = parsePin(pinTok);
//     reportInterval = max(1, (int)msTok.toInt());
//     reporting = true;
//     lastReport = 0;

//     if (reportMode == "digital") {
//       pinMode(reportPin, INPUT);
//     }

//     Serial.print("OK report ");
//     Serial.print(reportMode);
//     Serial.print(" ");
//     Serial.print(pinTok);
//     Serial.print(" ");
//     Serial.println(reportInterval);
//     return;
//   }

//   if (cmd == "stopReport") {
//     reporting = false;
//     reportMode = "";
//     reportPin = -1;
//     Serial.println("OK stopReport");
//     return;
//   }

//   sendError("unknown_command");
// }

// void setup() {
//   Serial.begin(9600);
//   while (!Serial) { ; }
//   Serial.println("READY");
// }

// void loop() {
//   while (Serial.available() > 0) {
//     char c = (char)Serial.read();
//     if (c == '\n') {
//       handleCommand(inputLine);
//       inputLine = "";
//     } else if (c != '\r') {
//       inputLine += c;
//     }
//   }

//   if (reporting && millis() - lastReport >= reportInterval) {
//     lastReport = millis();

//     if (reportMode == "digital") {
//       int v = digitalRead(reportPin);
//       Serial.print("REPORT digital ");
//       Serial.print(reportPin);
//       Serial.print(" ");
//       Serial.println(v);
//     } else if (reportMode == "analog") {
//       int v = analogRead(reportPin);
//       Serial.print("REPORT analog ");
//       Serial.print(reportPin);
//       Serial.print(" ");
//       Serial.println(v);
//     }
//   }
// }
