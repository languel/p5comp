# Physical p5 — Arduino + p5 Mini IDE and Firmata Lab

## Status

Prototype specification.

## Purpose

Build a minimal browser-based physical-computing environment for introductory Arduino + p5.js creative coding.

The project has two closely related entry points that share the same Web Serial, p5 runtime, editor, canvas, console, board-selection, and upload infrastructure:

1. **Arduino + p5 Mini IDE**
   - Students edit and upload a normal Arduino `.ino` sketch.
   - The Arduino sends named values over serial.
   - The browser exposes those values to p5 as a live `signals` object.
   - p5 can send simple named values back to the Arduino.
   - The goal is to make the full sensor → serial → browser → image → serial → actuator loop visible and understandable.

2. **p5 Firmata Lab**
   - The Arduino runs a fixed Firmata firmware.
   - The browser discovers board capabilities.
   - The user interactively assigns pin modes.
   - Inputs are monitored live.
   - Outputs can be controlled from the UI or from p5.
   - No Arduino source editing is required during normal use.

These should remain separate entry points rather than one large application with a complicated mode switch:

```text
/ide
/firmata
```

They should look and behave like siblings.

---

# 1. Design Goals

## 1.1 Primary goals

- Browser-first.
- No Arduino IDE required on student machines.
- No Arduino Cloud Agent / daemon.
- Desktop Chrome or Edge as the supported browser target.
- Web Serial for USB communication.
- Initial hardware support:
  - Arduino Uno R3
  - Arduino Mega 2560
- Later:
  - ESP32 family through a separate upload backend such as `esptool-js`.
- p5.js global mode.
- Minimal UI.
- Canvas remains visually dominant.
- Serial/data flow remains legible to students.
- Avoid hiding the existence of serial communication behind an overly abstract hardware API.
- Allow students to move quickly from sensor values to visual behavior.
- Preserve the possibility of later integrating the subsystem into projects such as:
  - `underscores`
  - `artistmodelstudio`
  - `genereti`

## 1.2 Non-goals for the first implementation

- Full replacement for the Arduino IDE.
- Multi-file Arduino projects.
- Library manager.
- Full Arduino board ecosystem.
- In-browser Arduino compilation via WASM.
- Full Firmata protocol coverage.
- Complex project filesystem.
- Account system or cloud persistence.
- Mobile browser support.
- Safari support.

---

# 2. Conceptual Model

## 2.1 Mini IDE

```text
Arduino sketch                 p5 sketch
      │                            │
      │ compile + upload           │ live run
      ▼                            ▼
 Arduino Uno / Mega ── USB serial ── Browser
                                   │
                                   ├─ named signals
                                   ├─ signal monitor
                                   ├─ serial console
                                   ├─ p5 canvas
                                   └─ commands back to Arduino
```

The central teaching loop is:

```text
sensor
  ↓
Arduino
  ↓
serial
  ↓
browser
  ↓
p5
  ↓
visual / interactive behavior
  ↓
serial
  ↓
Arduino
  ↓
LED / PWM / actuator
```

## 2.2 Firmata Lab

```text
                        Browser
                           │
              ┌────────────┴────────────┐
              │                         │
      pin configuration              p5 code
              │                         │
              └────────────┬────────────┘
                           │
                        Firmata
                           │
                           ▼
                        Arduino
                           │
              ┌────────────┼────────────┐
              │            │            │
            inputs       outputs     actuators
```

The Mini IDE teaches Arduino programming and serial communication.

The Firmata Lab treats the Arduino as a dynamically configurable physical I/O interface.

---

# 3. Shared Technology

## 3.1 Browser

Supported:

- Desktop Chrome
- Desktop Edge

Required browser features:

- Web Serial
- ES modules
- iframe sandboxing
- `postMessage`
- local persistence through `localStorage` or IndexedDB

The application must run in a secure context:

- `https://`
- or `http://localhost`

## 3.2 p5.js

Use normal p5 global mode.

Example:

```js
function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(255);
  circle(width / 2, height / 2, 100);
}
```

Avoid introducing a framework-specific p5 wrapper API unless needed.

## 3.3 Code editor

Use CodeMirror 6 initially.

Requirements:

- syntax highlighting
- line numbers
- basic autocomplete if inexpensive
- error-line highlighting
- keyboard shortcuts
- local persistence

Do not start with Monaco unless a concrete need appears.

## 3.4 Serial

Use the browser Web Serial API directly.

Core API wrapper:

```js
class SerialConnection {
  async connect(options)
  async disconnect()
  async write(data)

  onBytes(callback)
  onLine(callback)

  get connected()
}
```

The transport layer should know nothing about Arduino signals or Firmata.

---

# 4. Shared UI Shell

Suggested desktop layout:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Physical p5      Board ▾    Connect    Upload/Run     ● status       │
├───────────────────────┬───────────────────────────────┬───────────────┤
│                       │                               │               │
│ editor                │                               │ monitor       │
│                       │           p5 canvas           │               │
│ Arduino | p5          │                               │ inputs        │
│                       │                               │ outputs       │
│                       │                               │               │
├───────────────────────┴───────────────────────────────┴───────────────┤
│ Serial | p5 Console | Build                                           │
└───────────────────────────────────────────────────────────────────────┘
```

The canvas should get the largest share of screen space.

On narrower displays:

```text
[ Arduino ] [ p5 ] [ Serial ]
```

may replace side-by-side editor panes.

---

# 5. Arduino + p5 Mini IDE

# 5.1 Core Interaction

The Mini IDE combines:

- Arduino editor
- p5 editor
- p5 canvas
- named signal monitor
- raw serial monitor
- browser → Arduino output controls
- compile/upload
- build output

The Arduino source controls what signals exist.

The browser discovers those signals dynamically from text arriving over serial.

---

# 6. Named Signal Protocol

## 6.1 Arduino → browser

Use a deliberately permissive, human-readable text protocol.

Examples:

```text
D4: 0 A4:799 A0: 561
A0=561, A4=799
D4 1 A4 -3.5 ; A0:7
temperature: 21.4 accel_x: -0.37
```

The protocol is not limited to physical pin names.

Valid names may represent:

```text
A0
D4
temperature
distance
accel_x
touch_1
```

A name consists of:

```text
letter or underscore
followed by letters, digits, or underscores
```

A value may be:

- integer
- negative integer
- decimal
- negative decimal

Separators may be arbitrary non-name / non-number characters such as:

```text
:
=
,
;
space
```

## 6.2 Parser

Reference implementation:

```js
const SIGNAL_RE =
  /([A-Za-z_][A-Za-z0-9_]*)[^A-Za-z0-9_+\-.]+([+-]?\d+(?:\.\d+)?)/g;

function parseSignals(line) {
  const result = {};

  for (const match of line.matchAll(SIGNAL_RE))
    result[match[1]] = Number(match[2]);

  return result;
}
```

Behavior:

```js
parseSignals("D4: 0 A4:799 A0: 561");

// {
//   D4: 0,
//   A4: 799,
//   A0: 561
// }
```

If a line contains no valid pairs, return an empty object.

Maintain one persistent live dictionary:

```js
const signals = {};
```

On each valid line:

```js
Object.assign(signals, parseSignals(line));
```

This means signals retain their most recently received value.

---

# 7. Signal Monitor

Create a signal row lazily the first time a name appears.

Example:

```text
INPUTS

A0  376
██████░░░░░░░░

A4  668
██████████░░░░

D4    0
░░░░░░░░░░░░░
```

Default ranges:

```text
A* → 0–1023
D* → 0–1
```

For arbitrary names:

- show the numeric value immediately
- optional v1 behavior:
  - no bar
- possible later behavior:
  - auto-range from observed values
  - user-defined min/max
  - aliases
  - smoothing
  - small history graph

The monitor must update without requiring the p5 sketch to know which signals exist.

---

# 8. Browser → Arduino Protocol

Use the same named-value idea in the opposite direction.

p5 API:

```js
send("LED", 1);
send("brightness", 127);
send("speed", 0.4);
```

Wire format:

```text
LED: 1
brightness: 127
speed: 0.4
```

Expose two browser APIs:

```js
send(name, value)
sendLine(text)
```

`send()` is the normal teaching API.

`sendLine()` exposes raw serial output for experimentation.

Example Arduino logic:

```cpp
if (Serial.available()) {
  String line = Serial.readStringUntil('\n');
  line.trim();

  // student decides how to interpret it
}
```

Do not require a helper library in v1.

A small Arduino-side helper library may be added later.

Possible later API:

```cpp
io.read();

if (io.has("LED"))
  digitalWrite(13, io["LED"]);

io.send("A0", analogRead(A0));
```

---

# 9. p5 Runtime API — Mini IDE

Built-in globals available to the student sketch:

```js
signals
send(name, value)
sendLine(text)
serialConnected
```

Example:

```js
function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(255);

  let x = map(
    signals.A0 ?? 0,
    0, 1023,
    0, width
  );

  let size = map(
    signals.A4 ?? 0,
    0, 1023,
    10, 300
  );

  circle(x, height / 2, size);
}
```

Potential shorthand later:

```js
signal("A0", 0)
```

Equivalent to:

```js
signals.A0 ?? 0
```

Keep `signals` as the primary model because it is explicit and simple.

---

# 10. p5 Sandbox

Do not run student p5 code directly in the main application window.

Use an isolated iframe.

```text
main application
      │
      ├─ Web Serial
      ├─ editors
      ├─ signals
      │
      ▼
 sandbox iframe
      │
      └─ p5.js
```

Parent → iframe:

```js
{
  type: "signals",
  values: {
    A0: 624,
    A4: 415,
    D4: 1
  }
}
```

iframe → parent:

```js
{
  type: "send",
  name: "LED",
  value: 1
}
```

The iframe must expose the current signals object to user code.

Running p5 code may recreate the iframe entirely.

This provides a predictable reset model for live coding.

---

# 11. p5 Console

Capture inside the iframe:

```js
console.log()
console.warn()
console.error()
```

Forward them to the parent UI.

Bottom-pane tabs:

```text
[ Serial ] [ p5 Console ] [ Build ]
```

Do not mix serial output, JavaScript errors, and compiler messages into one log.

---

# 12. Arduino Editor

One `.ino` file only in v1.

Features:

- Arduino/C++ syntax highlighting
- line numbers
- local persistence
- compile/upload shortcut
- compiler error navigation

Default sketch:

```cpp
void setup() {
  Serial.begin(9600);
}

void loop() {
}
```

Keyboard:

```text
Cmd/Ctrl + Enter
  run p5

Cmd/Ctrl + Shift + Enter
  compile + upload Arduino
```

---

# 13. Initial Board Definitions

```js
const boards = {
  uno: {
    id: "uno",
    label: "Arduino Uno R3",
    fqbn: "arduino:avr:uno",
    uploadProtocol: "stk500v1",
    baudRate: 115200
  },

  mega: {
    id: "mega",
    label: "Arduino Mega 2560",
    fqbn: "arduino:avr:mega",
    uploadProtocol: "stk500v2",
    baudRate: 115200
  }
};
```

Baud-rate details for bootloader upload should live in board configuration rather than UI code.

The runtime serial baud used by a student's sketch is conceptually separate from bootloader upload baud.

For initial classroom demos, runtime serial may default to:

```text
9600
```

Add a simple baud selector later if needed.

---

# 14. Compilation Architecture

Do not compile Arduino code in the browser in v1.

Use a small compile service around `arduino-cli`.

```text
browser
   │
   │ source + board
   ▼
POST /api/compile
   │
   ▼
arduino-cli
   │
   ▼
firmware.hex
   │
   ▼
browser
```

Request:

```json
{
  "board": "uno",
  "source": "void setup() { ... }"
}
```

Response:

```json
{
  "ok": true,
  "hex": "...",
  "stdout": "...",
  "stderr": ""
}
```

Development compile command:

```bash
arduino-cli compile \
  --fqbn arduino:avr:uno \
  --output-dir build \
  sketch/
```

Server responsibilities:

1. create temporary sketch directory
2. write source
3. invoke `arduino-cli`
4. capture stdout/stderr
5. locate `.hex`
6. return firmware
7. remove temporary build artifacts

The server must never execute arbitrary shell fragments provided by the browser.

Board selection must map to a fixed allowlisted FQBN.

---

# 15. Browser Upload

Create a generic uploader abstraction:

```js
await uploader.flash({
  board,
  port,
  firmware
});
```

Architecture:

```text
Uploader
   │
   ├─ AVRUploader
   │    ├─ STK500v1 → Uno R3
   │    └─ STK500v2 → Mega 2560
   │
   └─ later:
        ESP32Uploader
             └─ esptool-js
```

Use an existing browser-side AVR uploader implementation initially.

Do not implement STK500 from scratch until necessary.

---

# 16. Upload Lifecycle

The application must own the lifecycle around flashing:

```text
serial monitor connected
        │
        ▼
release reader
        │
        ▼
close / transition serial connection
        │
        ▼
trigger bootloader reset if required
        │
        ▼
flash firmware
        │
        ▼
board resets
        │
        ▼
wait for sketch startup
        │
        ▼
reopen runtime serial
        │
        ▼
resume signal parsing
```

Normal UI:

```text
UPLOAD
```

should mean:

```text
compile
+
flash
+
reconnect
```

Optional advanced controls later:

```text
Compile
Upload
```

---

# 17. Mini IDE Example — Input Lab

Default Arduino example:

```cpp
int switchPin = 4;
int photoPin = A4;
int potPin = A0;

void setup() {
  pinMode(switchPin, INPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.print("D4: ");
  Serial.print(digitalRead(switchPin));

  Serial.print(" A4: ");
  Serial.print(analogRead(photoPin));

  Serial.print(" A0: ");
  Serial.println(analogRead(potPin));

  delay(20);
}
```

Default p5 example:

```js
function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(
    signals.D4 ? 0 : 255
  );

  let x = map(
    signals.A0 ?? 0,
    0, 1023,
    0, width
  );

  let y = map(
    signals.A4 ?? 0,
    0, 1023,
    0, height
  );

  fill(
    signals.D4 ? 255 : 0
  );

  circle(x, y, 50);
}
```

---

# 18. Mini IDE Example — Lissajous

A second included example should map analog values to frequencies.

Concept:

```js
const divisor = 100;

const fx =
  (signals.A4 ?? 0) / divisor;

const fy =
  (signals.A0 ?? 0) / divisor;
```

Potential controls:

- frequency divisor
- smoothing
- inertia
- quantization / snap

Example interpretation:

```text
A4 → x frequency
A0 → y frequency
D4 → invert colors
```

This demonstrates that Arduino inputs can become continuous generative parameters rather than simply moving UI widgets.

---

# 19. p5 Firmata Lab

The Firmata Lab shares:

- Web Serial
- p5 editor
- sandboxed p5 runtime
- p5 canvas
- p5 console
- board selector
- connection controls
- firmware upload infrastructure
- visual style

It removes the normal Arduino source editor from the primary workflow.

The board runs fixed Firmata firmware.

---

# 20. Firmata Firmware

Provide precompiled firmware:

```text
firmware/
  firmata-uno.hex
  firmata-mega.hex
```

Primary setup action:

```text
FLASH FIRMATA
```

Because firmware is precompiled, Firmata mode does not require the compile server.

Development may initially rely on manually pre-flashed StandardFirmata.

After the Firmata client is stable, add one-click flashing.

---

# 21. Firmata Connection

On connect:

1. open Web Serial
2. initialize Firmata parser
3. request protocol / firmware version
4. query capabilities
5. query analog mapping
6. build board model
7. populate pin UI

Useful Firmata messages:

```text
REPORT_VERSION
REPORT_FIRMWARE
CAPABILITY_QUERY
CAPABILITY_RESPONSE
ANALOG_MAPPING_QUERY
ANALOG_MAPPING_RESPONSE
```

Do not hard-code Uno pin capabilities into the main UI if they can be discovered from Firmata.

---

# 22. Firmata Client

Core interface:

```js
class FirmataClient {
  async connect(port)
  async disconnect()

  async queryCapabilities()
  async queryAnalogMapping()

  setPinMode(pin, mode)

  digitalRead(pin)
  digitalWrite(pin, value)

  analogRead(pin)
  analogWrite(pin, value)

  onPinChange(callback)

  get firmware()
  get version()
  get pins()
}
```

Internally support only the protocol subset needed for v1.

---

# 23. Firmata Protocol Subset

Receive:

```text
DIGITAL_MESSAGE
ANALOG_MESSAGE
REPORT_VERSION
REPORT_FIRMWARE
CAPABILITY_RESPONSE
ANALOG_MAPPING_RESPONSE
```

Send:

```text
SET_PIN_MODE
REPORT_DIGITAL
REPORT_ANALOG
DIGITAL_MESSAGE
ANALOG_MESSAGE
```

Also support required SysEx framing and parsing.

Later additions may include:

```text
SERVO
I2C
SONAR
STEPPER
```

These are explicitly outside the first implementation.

---

# 24. Digital Port Shadow State

Standard Firmata digital writes operate on an entire 8-bit port rather than a single pin.

Maintain a shadow register:

```js
const digitalPorts = [];
```

Example:

```js
digitalWrite(5, 1);
```

must:

1. determine the Firmata digital port
2. update the bit corresponding to pin 5
3. preserve other output bits
4. send the full port state

This detail must remain invisible to student code.

---

# 25. Firmata Pin Model

Example internal representation:

```js
{
  id: "D11",
  number: 11,
  analogChannel: null,

  capabilities: [
    "INPUT",
    "OUTPUT",
    "PWM"
  ],

  mode: "PWM",
  value: 173,

  alias: "led"
}
```

Analog pin:

```js
{
  id: "A0",
  number: 14,
  analogChannel: 0,

  capabilities: [
    "INPUT",
    "OUTPUT",
    "ANALOG"
  ],

  mode: "ANALOG",
  value: 742,

  alias: "light"
}
```

---

# 26. Firmata Pin Configuration UI

Example:

```text
PIN   NAME       MODE              VALUE

D2    button     INPUT             ● 1

D3    led        PWM               ─────●── 187

D4               INPUT_PULLUP      ● 0

D5               OUTPUT            [ ON ]

A0    light      ANALOG INPUT      713
                                      █████████░░

A1    knob       ANALOG INPUT      321
                                      ████░░░░░░░
```

Each row contains:

- physical pin
- optional alias
- supported-mode selector
- current mode
- current value
- appropriate monitor/control

---

# 27. Firmata Modes — v1

Expose only modes reported as supported by each pin.

Initial mode set:

```text
INPUT
INPUT_PULLUP
OUTPUT
ANALOG
PWM
```

Later:

```text
SERVO
I2C
SONAR
STEPPER
```

Pins D0/D1 on Uno/Mega should be treated carefully because they correspond to hardware serial RX/TX.

By default show:

```text
D0 RX   reserved
D1 TX   reserved
```

An advanced option may unlock them.

---

# 28. Firmata Input UI

For digital modes:

```text
INPUT
INPUT_PULLUP
```

show:

```text
0 / 1
```

plus a simple indicator.

For analog:

```text
742
███████████░░░░
```

Later:

- history sparkline
- smoothing
- calibration
- user-defined range

---

# 29. Firmata Output UI

For digital output:

```text
[ OFF / ON ]
```

For PWM:

```text
0 ───────●──────── 255
             173
```

Changing a UI control immediately sends the appropriate Firmata message.

The UI must also update if p5 writes to the same output.

---

# 30. Firmata Aliases

Aliases should be supported early.

Example:

```text
A0  → light
D4  → button
D11 → led
```

Student p5 code may then use:

```js
pins.light.value
pins.button.value
pins.led.write(180)
```

Direct pin names remain valid:

```js
pins.A0.value
pins.D4.value
pins.D11.write(180)
```

Aliases are optional.

---

# 31. Firmata p5 API

Primary global:

```js
pins
```

Optional helper:

```js
pin(name)
```

Examples:

```js
pins.A0.value
pins.D4.value

pins.D13.write(1)
pins.D11.write(128)
```

With aliases:

```js
pins.light.value
pins.button.value
pins.led.write(200)
```

Dynamic access:

```js
pin("light").value
```

Example pin object:

```js
pins.light = {
  id: "A0",
  pin: 14,
  mode: "ANALOG",
  value: 723,

  write(value) {
    // bridged to parent Firmata client
  }
};
```

---

# 32. Shared State Between Firmata UI and p5

The pin panel and p5 code represent the same live state.

If p5 runs:

```js
pins.led.write(182);
```

the UI PWM slider must move to:

```text
182
```

If the user drags the UI slider to:

```text
70
```

then:

```js
pins.led.value
```

must become:

```js
70
```

For outputs:

```text
most recent write wins
```

No ownership locking in v1.

---

# 33. Firmata Sampling Rate

Provide one board-level control:

```text
Input sampling: 20 ms
```

Suggested UI range:

```text
10–1000 ms
```

The p5 canvas continues at normal animation frame rate.

Sensor state simply retains the latest value received from the board.

A 20–33 ms default is appropriate for interactive classroom use.

---

# 34. Firmata Diagnostics

The normal user does not need to see raw Firmata bytes.

Instead provide an optional diagnostics pane:

```text
Firmata 2.x
StandardFirmata

sampling: 20 ms

RX  ANALOG A0 613
RX  DIGITAL D4 1
TX  PWM D11 174
```

This replaces the human-readable raw serial monitor used by the Mini IDE.

---

# 35. Shared p5 Runner

Both `/ide` and `/firmata` use the same sandbox mechanism.

The only difference is the injected hardware API.

Mini IDE:

```js
signals
send()
sendLine()
```

Firmata:

```js
pins
pin()
```

The core p5 execution system should not know which hardware mode is active.

Suggested bridge:

```js
class P5Bridge {
  mount(iframe)
  run(source)
  reset()

  postState(state)
  onMessage(callback)
}
```

---

# 36. Shared Editor Persistence

Persist locally:

```text
Mini IDE
  Arduino source
  p5 source
  selected board
  layout state

Firmata Lab
  p5 source
  selected board
  pin aliases
  pin modes
  sampling interval
```

Use:

- `localStorage` initially
- IndexedDB only if project storage grows beyond trivial text settings

Add explicit:

```text
Reset Example
```

so classroom machines can return to a known state easily.

---

# 37. Error Handling

## Serial

Display clear states:

```text
disconnected
connecting
connected
uploading
reconnecting
error
```

Errors should distinguish:

- browser does not support Web Serial
- user cancelled device selection
- port already in use
- serial device disconnected
- upload failed
- reconnect failed

## Compile

Show:

```text
Build failed
line 17: 'foo' was not declared in this scope
```

Where possible, clicking the compiler error should move the Arduino editor to that line.

## p5

Show runtime errors in the p5 console without crashing the parent app.

---

# 38. Example Set

Ship a small curated set.

## Mini IDE examples

### 1. Input Lab

- digital button
- photocell
- potentiometer
- p5 position / size mapping

### 2. Lissajous

- two analog inputs
- generative frequency mapping
- optional smoothing / inertia / quantization

### 3. Drawing

- sensor-controlled brush
- switch toggles drawing
- analog input controls scale / stroke

### 4. Browser → Arduino

- mouse X controls PWM LED
- mouse click controls digital LED
- Arduino sensors affect p5 simultaneously

## Firmata examples

### 1. Light → Circle

```js
function draw() {
  let x = map(
    pins.light.value,
    0, 1023,
    0, width
  );

  circle(x, height / 2, 50);
}
```

### 2. Mouse → LED PWM

```js
function draw() {
  let v = map(
    mouseX,
    0, width,
    0, 255
  );

  pins.led.write(v);
}
```

### 3. Bidirectional

- analog sensor changes visual frequency
- mouse motion controls LED PWM
- button changes palette

---

# 39. Suggested Repository Structure

```text
physical-p5/
│
├─ package.json
├─ vite.config.js
├─ README.md
│
├─ shared/
│  ├─ serial/
│  │  ├─ SerialConnection.js
│  │  └─ lineBuffer.js
│  │
│  ├─ p5/
│  │  ├─ P5Runner.js
│  │  ├─ P5Bridge.js
│  │  └─ sandbox.html
│  │
│  ├─ editor/
│  │  └─ createEditor.js
│  │
│  ├─ boards/
│  │  └─ boards.js
│  │
│  ├─ persistence/
│  │  └─ storage.js
│  │
│  └─ ui/
│     ├─ layout.js
│     └─ components.js
│
├─ ide/
│  ├─ index.html
│  ├─ main.js
│  │
│  ├─ serial/
│  │  ├─ signals.js
│  │  └─ send.js
│  │
│  ├─ arduino/
│  │  ├─ compiler.js
│  │  ├─ uploader.js
│  │  └─ avrUploader.js
│  │
│  └─ examples/
│     ├─ input-lab/
│     │  ├─ sketch.ino
│     │  └─ sketch.js
│     ├─ lissajous/
│     └─ drawing/
│
├─ firmata/
│  ├─ index.html
│  ├─ main.js
│  │
│  ├─ FirmataClient.js
│  ├─ FirmataParser.js
│  ├─ pins.js
│  ├─ bridge.js
│  │
│  ├─ firmware/
│  │  ├─ uno.hex
│  │  └─ mega.hex
│  │
│  └─ examples/
│     ├─ light-circle.js
│     ├─ pwm-led.js
│     └─ bidirectional.js
│
└─ server/
   ├─ index.js
   └─ compile.js
```

This structure is intentionally modest.

Do not over-componentize the prototype.

---

# 40. Implementation Sequence

## Phase 0 — Existing Prototype

Already demonstrated:

- Web Serial connection
- line buffering
- permissive named-value parser
- persistent signal dictionary
- dynamic signal monitor
- p5 visualization
- serial output controls
- live sensor-driven generative behavior

Keep this behavior intact while restructuring.

---

## Phase 1 — Shared p5 Runner

Implement:

1. CodeMirror p5 editor
2. sandbox iframe
3. p5 source execution
4. parent ↔ iframe bridge
5. `signals` injection
6. `send()` bridge
7. p5 console capture
8. Cmd/Ctrl + Enter run
9. local persistence

At the end of Phase 1, the current serial prototype should work with editable live p5 code.

---

## Phase 2 — Mini IDE Arduino Editor

Implement:

1. Arduino CodeMirror editor
2. Uno / Mega board selector
3. build tab
4. compile API client
5. compile server using `arduino-cli`
6. compiler error display
7. local source persistence

At the end of Phase 2:

```text
Arduino source → Compile → firmware.hex
```

works, but upload may still be manual.

---

## Phase 3 — AVR Browser Upload

Implement:

1. Uno STK500v1 upload adapter
2. Mega STK500v2 upload adapter
3. release active serial reader before flashing
4. upload progress
5. board reset handling
6. runtime serial reconnect
7. combined Upload button

At the end:

```text
edit Arduino
→ Upload
→ board restarts
→ signals reappear
→ p5 continues
```

---

## Phase 4 — Firmata Core

Initially flash StandardFirmata manually.

Implement:

1. Firmata byte parser
2. version query
3. firmware query
4. capability query
5. analog mapping query
6. board/pin model
7. digital input reporting
8. analog input reporting

Render discovered pins in the UI.

---

## Phase 5 — Firmata Outputs

Implement:

1. digital output
2. digital port shadow state
3. PWM output
4. pin mode selector
5. input pullup where supported
6. output controls
7. synchronized UI state

---

## Phase 6 — Firmata + p5

Implement:

1. expose `pins`
2. aliases
3. `pins.x.value`
4. `pins.x.write(value)`
5. UI ↔ p5 synchronization
6. examples
7. sampling-rate control

At this point the Firmata Lab is useful for class.

---

## Phase 7 — One-click Firmata Flashing

Add:

```text
FLASH FIRMATA
```

using precompiled firmware and the same AVR browser uploader.

No compile service required.

---

# 41. Future ESP32 Support

Keep ESP32 outside the first release but make the uploader architecture compatible with it.

Later:

```text
Uploader
   ├─ AVR
   │   ├─ Uno
   │   └─ Mega
   │
   └─ ESP32
       └─ esptool-js
```

The Mini IDE compile server adds ESP32 board FQBNs.

Named serial signals and the p5 runtime require no change.

Firmata support on ESP32 should be evaluated separately rather than assumed.

---

# 42. Future Integration with Larger Livecoding Projects

This project should remain usable standalone.

Later, the useful reusable modules are:

```text
SerialConnection
SignalParser
SignalStore
ArduinoCompilerClient
AVRUploader
FirmataClient
P5Runner
P5Bridge
PinStore
```

These can be integrated into larger environments such as `underscores` or `artistmodelstudio`.

The conceptual interface for the creative layer should stay small.

Mini IDE:

```js
signals.A0
signals.temperature

send("LED", 1)
```

Firmata:

```js
pins.A0.value
pins.light.value

pins.led.write(180)
```

That boundary should remain stable even if the surrounding UI changes substantially.

---

# 43. Acceptance Criteria — Mini IDE MVP

The Mini IDE MVP is complete when a student can:

1. open the page in desktop Chrome/Edge
2. select Uno R3 or Mega 2560
3. connect the board
4. see named values such as:

```text
D4: 1 A0: 631 A4: 422
```

5. see inputs automatically appear in the monitor
6. edit p5 code
7. press Run
8. access those inputs through:

```js
signals.D4
signals.A0
signals.A4
```

9. send a value back through:

```js
send("LED", 1)
```

10. edit Arduino source
11. press Upload
12. have the browser compile and flash the board
13. have serial reconnect automatically
14. continue receiving signals without reloading the page

---

# 44. Acceptance Criteria — Firmata Lab MVP

The Firmata Lab MVP is complete when a student can:

1. connect an Uno R3 or Mega running the supplied Firmata firmware
2. see the board detected
3. see available pins and capabilities
4. set a digital pin to input
5. set a digital pin to output
6. set a PWM-capable pin to PWM
7. set an analog pin to analog input
8. monitor input values live
9. toggle digital outputs from the UI
10. control PWM from the UI
11. assign aliases such as:

```text
A0 → light
D11 → led
```

12. use p5 code such as:

```js
pins.light.value
```

13. write output from p5:

```js
pins.led.write(180)
```

14. see p5-driven output changes reflected in the pin UI
15. see UI-driven output changes reflected in `pins.*.value`
16. flash the supplied Firmata firmware from the browser

---

# 45. Guiding Constraint

Keep both applications small enough that a student can understand the path from hardware to code.

The system should expose:

```text
Arduino / pin
→ serial protocol
→ browser state
→ p5
```

without requiring students to manage operating-system serial ports, install a daemon, or use a separate desktop IDE.

The abstractions should remove setup friction while preserving the conceptual structure of the physical-computing system.
