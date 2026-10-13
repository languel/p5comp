# p5comp: classroom simulator milestone

Discovery and implementation brief, 2026-10-12. The first simulator milestone is now implemented at `/sim/`; earlier discovery statements below describe the starting code.

Current checkpoint: AVR8js worker executes the compiled classroom sketch; real
breadboard nets connect HC-SR04, pot and two buttons. Both p5.webserial and native
Web Serial examples exchange UART bytes in both directions. Circuit edits,
paired editors, project persistence/export and compiler caching are implemented.
Thirty-three automated tests pass. Browser validation covers both serial APIs,
independent buttons, ADC/sonar changes, wire removal/reconnection, pause, export,
and an edited C++ LED threshold changing emulated behavior after compilation.
Physical Uno upload was verified on 2026-10-13 with a 932-byte HelloLED sketch
through browser Web Serial (usbmodem101), including bootloader flash completion
and serial reconnection. Visual LED behavior still requires observation on the
board. Mega/ESP32 upload remains untested. Browser C++ compilation, full Wokwi
compatibility and Artist–Model Studio integration remain future work.

Canvas checkpoint: pan/zoom world coordinates, screen-distance grid/axis snapping,
unrestricted part placement, terminal connection gestures, editable bends and
segments, manual/free-angle routes, context-menu autorouting and palette,
component-aware cleanup, part tinting/original colors, 45° rotation/flips,
label visibility, inactive-body dragging, mixed multi-selection/box selection,
detachable/reconnectable wire ends, a sonar target simulator, pin-pitch grid
spacing/alignment, and circuit undo/redo are implemented.
The UI now has compact glyph transport/canvas tools, hover help, tucked-away
settings, a searchable 51-type element catalog with LCD I²C variants, in-app part
docs and local pin references, custom color popovers, wire-colored terminals,
independent preview/control visibility, and an interface-hide mode. Original component colors are now the default; explicit gray/tint overrides remain.
Connected dots use 1.12 times the breadboard-hole radius in world coordinates,
while endpoint grab targets retain a larger invisible hit area. Legacy class
sketches receive a targeted dark-palette upgrade that preserves serial/student
code. Additional
catalog elements support placement/wiring only; they do not extend the AVR
peripheral models. Docs require a network connection. Desktop and phone-size
browser checks cover search/add, variants, docs, custom colors, hide/show,
light/dark palettes and the original Arduino/p5 UART flow.
The p5comp name and circuit/code/firmata navigation now match across all three
sections. Circuit hints sit in the bottom status bar, wire palettes are contextual,
Shift-click inserts wire bends, and None disables the grid while preserving
terminal alignment. Routing considers native breadboard holes and midpoint lanes,
with stronger overlap/parallel-wire penalties. Code/firmata use compact glyph
controls, hideable inspectors/output, and shared neutral output surfaces.
Simple autorouting permits crossings while retaining overlap penalties; careful
autorouting remains available. Wire-only deletion/undo preserves mounted parts,
and newly mounted native elements refresh terminal geometry after rendering.
Browser regression checks on rotated buttons confirm that remaining wire paths
stay unchanged immediately after keyboard deletion. White is no longer a preset;
custom white remains available. The dark canvas is charcoal for black-wire contrast.
Routing and visual edits preserve a running MCU. Circuit Lab, Mini IDE, and
Firmata share a desaturated light/dark palette with cross-tab preference updates.
Browser checks exercised negative-coordinate placement, geometry editing,
color/tint changes, context routing, undo, and both themes. QA project storage
was isolated from the current classroom project.

## First classroom project

One environment holds an editable Arduino sketch, a circuit, an editable p5 sketch, the visualization, and a visible serial monitor. The same Arduino source and p5 source work against the simulated Uno or a physical Uno R3.

Use the class circuit tested today:

| Part          | Connection                           |
| ------------- | ------------------------------------ |
| HC-SR04       | Trigger D9, Echo D8, VCC 5V, GND     |
| Potentiometer | Wiper A0, outer terminals 5V and GND |
| Button 1      | D2 to GND, INPUT_PULLUP              |
| Button 2      | D3 to GND, INPUT_PULLUP              |

Arduino emits `distance_cm,pot,button1,button2` at 9600 baud. Buttons report 1 when pressed. Distance -1 means no echo. The Uno's built-in LED is on below 20 cm.

## Recovered code to reuse

`/Users/liuboto/dev/arduino/miniide` is **Physical p5** (package name `physical-p5`). It already implements paired C++/JavaScript CodeMirror editors, a p5 iframe, serial connection lifecycle, compiler diagnostics, board profiles, upload, and local persistence. Its separate Firmata entry point should remain separate.

- `shared/editor/createEditor.js`: C++/JavaScript editors and run/upload shortcuts.
- `shared/p5/P5Bridge.js`, `shared/p5/sandbox.js`: p5 execution, console/error reporting, state updates, and messages back to Arduino.
- `shared/serial/SerialConnection.js`: Web Serial reads/writes and upload port handoff.
- `server/index.js`: local Arduino CLI compilation, returning Intel HEX.
- `shared/serial/AVRUploader.js`: current Avrgirl uploader; temporarily overrides navigator.serial.requestPort. Prefer an explicit-port adapter when expanding this.
- `shared/serial/signals.js`: named numeric signal parser. It does not parse today's four-column CSV protocol. Add raw line access and a deliberate CSV example/parser without removing named signals.

`/Users/liuboto/dev/webfirmata` supplies a second useful component:

- `src/lib/uploader.js`: Uno STK500v1 upload, MCU signature checking, HEX validation, and flash readback verification. Extract it rather than the entire Firmata application.
- `public/arduino-integer.svg`: compact board representation if the custom classroom visual style is preferred.

Neither inspected project currently contains AVR8js CPU emulation. WebFirmata's demo sources simulate values; they do not execute a compiled Arduino sketch.

## Wokwi components and licensing

- [AVR8js](https://github.com/wokwi/avr8js) executes compiled AVR instructions and provides configurable AVR peripherals. It does not compile Arduino C++ or supply a circuit editor/part models.
- [Wokwi Elements](https://github.com/wokwi/wokwi-elements) provides visual web components. It does not supply the functional hardware simulation. The components are implemented in TypeScript; the circuit description is JSON.
- Both repositories use MIT licenses. Preserve their copyright/license notices when distributing their code. This finding concerns these two repositories, not a license to copy every part of Wokwi's hosted service.
- [diagram.json](https://docs.wokwi.com/diagram-format) describes parts, attributes, pin connections, and wire routing. Support a documented subset for these classroom parts; reject unsupported parts explicitly. Keep p5 code and our project metadata in an adjacent project envelope.

License files: [AVR8js](https://github.com/wokwi/avr8js/blob/main/LICENSE), [Elements](https://github.com/wokwi/wokwi-elements/blob/main/LICENSE).

## Smallest useful implementation

1. Add a Simulate action independent of Compile + Upload. Keep the initial MCU scope Uno R3 / ATmega328P at 16 MHz.
2. Compile with the existing local Arduino CLI endpoint, then execute that same HEX image with AVR8js in a worker. Bundle a precompiled classroom example so that opening and running it needs no compilation service.
3. Implement only the required component models: button closure/pull-up, pot voltage to ADC, HC-SR04 trigger detection and echo timing, and built-in LED state.
4. Make breadboard connectivity real: five-hole terminal strips, separated center halves, power rails, and wire net merging. Validate shorts, missing supply/ground, disconnected inputs, and incompatible drivers. This is a functional digital/simple-analog model, not a general SPICE solver.
5. Route emulated UART bytes through a common transport API to the serial monitor and p5 sandbox. Route p5 writes back into emulated UART receive. Do not bypass the Arduino program by directly injecting sensor values into p5.
6. Provide a physical Web Serial transport behind the same API. The host owns device permissions and port access; p5 sketches run in an isolated frame. Runtime reads and upload cannot own the physical port simultaneously.
7. Use the explicit-port Uno uploader to flash the compiled artifact, verify it, and reconnect at the sketch's baud rate. Hardware validation remains required.
8. Save/open a project containing Arduino source, p5 source, circuit JSON, simulation controls, and optional cached HEX. Expose explicit agent-facing operations for reading/editing source, parts, connections, running, and collecting diagnostics. Agents should not have to wire pixels with CUA.

For p5, expose complete raw lines/bytes as well as optional named signals. A p5.webserial-compatible adapter can be added deliberately; real Web Serial permission APIs should not be globally patched to impersonate a simulated device. Keep physical and simulated connections visibly identified.

## Compilation boundary

Simulation and p5 execution can run entirely in the browser, with bundled dependencies. Browser USB upload is also already represented in the codebase. Compiling arbitrary `.ino` edits is a separate missing piece for a strictly browser-only product.

The first milestone should reuse local Arduino CLI, with a cached HEX for the default example. That removes dependency on Wokwi servers but still requires a local compilation helper for edited C++. A browser/WASM compiler is a later milestone with its own Arduino core, library, filesystem, license, and performance work. Do not label the first milestone fully browser-only compilation.

## Artist–Model Studio integration

### Two tools, shared visual language

The user confirmed Physical p5 is the recovered project and wants to develop both it and WebFirmata. WebFirmata is a parallel teacher/student signal workbench, rather than a mode that should absorb the Arduino+p5 simulator. Use its visual style as the starting point for the simulator.

- Reuse WebFirmata's compact Uno SVG, typography, theme colors, quiet controls, panel spacing, and plots; inspect `src/style.css` and `src/App.jsx` during implementation.
- Keep the circuit and p5 output prominent in lecture mode. Arduino and p5 editors should be easy to reveal, with a side-by-side development layout when needed.
- Preserve the separation between physical pin configuration and live measurements: modes/terminal information on the board; values and plots beside it.
- Show serial data and its direction in a compact expandable monitor so students can understand communication.
- Keep Run/Reset/Pause, Simulated/USB state, Compile, and Upload explicit. Each tool should show the hardware/workflow it actually uses.
- Share framework-independent transport, uploader, project serialization, and eventually visual components. Do not couple the simulator to Firmata firmware or merge the two applications' workflows.
- Reuse AMS/Underscores editor and theme conventions when embedding the proven module later.

AMS is a suitable eventual host: it already has CodeMirror, p5 program boards, canvas positioning, persistence, agent tools, and frame messaging.

- `src/workbench/codeEditor.js`: reuse its theme/editor conventions and add C++ support when integrating.
- `src/workbench/boardFrames.js`: p5 already runs inside a sandboxed frame with bundled p5 and a token-based AMS message protocol.
- `src/process/boards.js`: document/program board kinds and project representation.

Prove the Uno runtime and virtual serial exchange in Physical p5 first. Keep emulator, net graph, serial transport, compiler client, and uploader independent of the UI so AMS can host them without importing the old entire application. AMS has ongoing uncommitted lesson work; do not disturb it during the standalone milestone.

## Acceptance checks

- The actual compiled classroom Arduino sketch runs, including timers, ADC, GPIO, pulseIn, and USART.
- Moving distance and pot controls changes CSV emitted by that program and updates p5.
- Each button independently reports press/release; pressing both reports `1,1`.
- Below/above 20 cm toggles the emulated LED correctly.
- A p5 command changes an Arduino output, proving communication in both directions.
- Changing Arduino source changes emulated behavior after compilation; this must not be a canned sensor dashboard.
- Removing a wire or supply causes a visible, explainable fault rather than silently preserving the last correct value.
- Restart/reset, pause/resume, and fragmented serial packets behave consistently.
- Export/reload preserves code and wiring; supported diagram.json imports preserve their parts/nets.
- Upload writes and verifies the same firmware on a physical Uno, and the same p5 sketch works after switching transports.

## Current verification

- Physical p5: 7 unit tests pass; production build passes (bundle-size warnings remain).
- WebFirmata: 12 unit tests pass, including simulated STK500 write/readback.
- Arduino CLI 1.5.1 and Arduino AVR core 1.8.7 are installed.
- Today's `class-sensors.ino` compiles for Uno: 4,186 bytes flash, 220 bytes global RAM. Preflight HEX is in `/tmp/physical-p5-classroom-preflight`.
- The recovered Mini IDE was launched locally on http://127.0.0.1:8771/ide and opened in the harness browser.
- No physical firmware was uploaded during this discovery. No new AVR simulator or AMS integration has been implemented yet.

## Unified workspace checkpoint — 2026-10-13

Renamed/moved into `~/dev/arduino/p5comp`, with Git and GitHub Pages CI.
The circuit workspace is the app shell. Right tabs contain paired code editors,
JSON properties and part help; bottom tabs contain simulation controls, upload,
serial and p5 console. The File menu handles whole-project JSON, new projects,
folder imports/saves, reference images, and native SVG/PNG/PDF exports with code.
Project v2 retains v1 fields and stores additional sources/settings/references.
Examples has built-in demos and a local classroom shelf. p5 output supports split,
overlay and a separate window. Multi-file compilation remains a local service;
GitHub Pages supports the cached classroom firmware and frontend only.

Unified-workspace validation: 36 tests pass. Browser checks cover New/save/open,
Arduino+p5 folder import with class/helper tabs, JSON property changes, reference
images, PNG/SVG/PDF downloads, Arduino completion, dock/overlay/redock and native
UART in both directions while p5 is detached. The detached sketch received
`99.5,512,0,0` and sent `LED:1`, turning on the emulated Uno LED. Public Pages
loaded and ran the classroom demo without console errors. The static deploy
uses `/p5comp/` asset paths; the Reference code view links to `miniide.html`.

Toolbar/theme fixes: matched `〈±〉` logo, glyph-only menu triggers with hover
labels, centered editable project name, opaque dropdowns using defined palette
tokens, and theme-matched select backgrounds. Unified CSS no longer overrides
interface hiding. Repeated hide/restore and light/dark menus were browser-tested
without console errors. Menus close outside and when another menu opens.

Element controls: help is a 13-screen-pixel button inside the transformed top-right
corner. Four corner hover zones offer drag rotation snapped to 45°, with attached
terminal geometry and undo preserved. The context palette uses one row of 10-pixel
swatches, a no-tint `ø` circle and custom `+`. Rotation/flips share a glyph row.
Autoroute connections routes only wires attached to selected elements and creates
one undo entry. Browser checks confirmed rotation/undo, palette alignment and
unchanged unrelated wire paths; 37 automated tests pass.

Main views now offer Circuit/p5 render tabs plus horizontal and vertical splits.
The old replacement-window docking was replaced with independent mirrors for
p5 canvas output and the circuit viewport. The original iframe/serial bridge is
retained. p5 pixels stream to the projection window; circuit SVG updates follow
scene/view mutations, preserving camera, grid and connected dots. Each mirror has
fullscreen control. Browser checks confirmed decoded frames in both windows and
continued p5 frame updates while the Circuit tab is active.
