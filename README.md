# p5comp

A browser-based Arduino and p5.js learning environment:

- `/sim/` — build a circuit, execute Arduino firmware in AVR8js, and connect it to p5 without hardware.
- `/ide` — edit Arduino and p5 sketches, monitor named serial signals, compile and upload.
- `/firmata/` — discover Uno/Mega pins and control them with the browser or p5.

## Requirements

- Node.js 18 or newer
- Arduino CLI with the `arduino:avr` core installed (for compiling Arduino sketches)
- Desktop Chrome or Edge on `localhost` or HTTPS (for Web Serial)
- Arduino Uno R3 or Mega 2560 (only for physical-device work)

## Run locally

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/sim/`, `/ide`, or `/firmata/`.
The development server proxies compilation requests to the local API on port 3001. Set `ARDUINO_CLI` to the Arduino CLI executable path if it is not on
`PATH`.

For a production-style local server:

```sh
npm start
```

This builds the static app and serves it, including `/api/compile`, on port 3001. Set `PORT` to change the server port.

## Circuit lab

Select **Run Arduino + p5**. The bundled classroom sketch runs immediately
without hardware or a compiler service. Use the distance and potentiometer
sliders, hold either button, or hold A / B outside an editor. The checkbox
beside distance simulates no echo. The p5 preview receives CSV from the Uno's
emulated UART: `distance_cm,pot,button1,button2`. Pressed buttons report 1.
The LED responds below 20 cm; p5's LED buttons send commands back to Arduino.

Choose **p5.webserial** or **navigator.serial** in the preview toolbar.
Each example has its own editable source. **Load API example** in Live code
restores the selected example. p5.webserial is the actual locally bundled
library; it wraps Web Serial. Both use a frame-local port facade carrying
the same UART bytes. The host owns physical device selection, so sketches
remain isolated and never replace the host's real `navigator.serial`.
The facade supports the stream APIs used in these lessons, not every Web
Serial option; modem/reset signals are currently no-ops.

Open **Live code** to edit ordinary Arduino C++ and p5 JavaScript. **Compile +
run** compiles edited Arduino source with the local Arduino CLI endpoint.
**Run p5** restarts only the visualization. Compiled HEX is cached with its
source and saved in the project. The browser executes compiled AVR instructions
in a worker; sensor controls affect ADC/GPIO/echo timing, rather than supplying
values directly to p5. Pause freezes simulated time while p5 can keep drawing.

The three sections are **circuit**, **code**, and **firmata**, with shared
compact navigation, control sizing and theme colors. Connection hints appear
in the circuit status bar below the canvas.

The canvas toolbar uses glyphs with native hover titles. Grid, snapping, labels,
and routing live under the gear; transport and project actions share one compact
header. Hide the interface with the eye glyph (or Tab while the canvas has focus),
then restore it with the floating panel glyph. The p5 preview and input controls
can hide independently. Project actions tuck into the menu on narrow screens.

**+** opens a searchable picker with live previews of every registered component
in `@wokwi/elements` 1.9.2 (50 library elements, plus our breadboard). LCD 16×2 and
20×4 also expose their I²C variants. Every element can be placed, selected,
transformed, tinted, wired at its native terminals, and saved. A filled dot in
the picker means the classroom runtime models its behavior; a hollow dot means
placement and wiring only. Adding a display or another MCU does not emulate it.
The live circuit status counts unmodeled components.

A selected element exposes **?** (also in its context menu) for an in-app docs
drawer. Wokwi pages open directly in that drawer; parts without an official page
get a local pin/property reference and a source link. Help includes the native
pinout. The bundled SSD1306 is an eight-pin module, while Wokwi's current linked
reference covers the four-pin I²C board; the drawer identifies that difference.
Documentation needs network access; the catalog and pin references are local.
The bundled p5 demo follows light/dark theme changes. Early saved copies of that
demo receive a palette-only upgrade, preserving serial and student logic; custom
artwork is not rewritten.

Wire colors live in the context menu rather than the canvas toolbar. Presets
include red, gold, yellow, green, blue, purple, gray, blackish, brownish
and pinkish. The last **+** swatch and Shift-click on a color swatch open the
in-app hue/brightness/hex picker.
White remains available as a custom color. The dark canvas uses charcoal gray
so black wires remain distinguishable from its background.
**Autoroute simple** allows crossings while avoiding overlapping parallel
segments. **Autoroute** also discourages crossings. Both use breadboard gaps
and avoid component bodies. Wire deletion and undo preserve mounted components
so rotated terminals keep their positions without requiring a pan.
Connected terminal dots and endpoint handles use the wire's color. Visible dots
are 12% wider than a breadboard hole and scale with canvas zoom; selected
endpoints keep a larger invisible hit target. At a terminal
shared by different colors, the selected wire wins; otherwise the most recently
attached wire supplies the dot's color.

The circuit lives on an infinite canvas. Drag empty space or Space-drag to pan;
scroll pans, Ctrl/Command-scroll zooms around the pointer. Zoom buttons and
**Fit** (F) are also available. **Expand** gives the circuit the full workspace
width. Parts can move to negative coordinates and beyond the current viewport;
new parts appear in the current view. Drag any inactive part of a component;
pot dials, button faces and the Uno reset button remain interactive. **Labels**
toggles component labels. Shift-click toggles parts; Ctrl/Command-click toggles wires. Shift-click on
a wire inserts a bend at the clicked position;
Shift-drag empty space or use **Select** to draw a selection box. Drag a selected
part or wire to move the group; Delete removes selected objects (the Uno is kept).

**Grid** uses the actual header/hole spacing, with **½ pin**, **1 pin**, or
**2 pins**. Choose a breadboard or Arduino reference and **On holes** or
**Between holes** alignment. The breadboard and Uno use matching 9.5 canvas-unit
pitch; the Uno's gap between digital header groups is preserved. The grid and
snapping share the same origin and spacing. Native Wokwi parts retain their
provided terminal coordinates; snapping also considers nearby terminals.
**None** hides the grid and disables grid snapping while retaining terminal-axis
alignment. Breadboard remains the default. These settings save with the project.

Click a terminal and then another, or drag between them, to connect. Click empty
space while drawing to place intermediate bends; Escape cancels. **Connect pins**
shows every terminal and enables keyboard terminal selection with Enter. With
**Orthogonal** on, quick connections route as rectangular paths. Disable it to
draw a direct line. **Snap** uses screen-distance snapping to the grid and
neighboring axes; Alt bypasses snapping and rectangular constraints, while Shift
locks the dominant axis.

Select a wire to expose its bends and segment midpoints. Drag a bend, drag a
segment sideways, or drag a midpoint to add a bend. Double-click a line or use
**Add bend here** in its context menu to insert a point. Delete removes the
selected bend (or the selected objects). Grab a connected terminal, or select a
wire and drag either endpoint circle, to unplug it. Drop it on another terminal
to reconnect, or on empty space to leave a free end. Use **Connect pins** to add
another wire to an occupied terminal. Free ends persist as `free:x,y` endpoint
strings and are excluded from electrical nets. Moving a part keeps its attached
wire ends bound to their terminals.

Right-click a line for **Autoroute**, straight-line conversion, bend editing,
deletion, and color choices. **Cleanup wires** routes the whole circuit.
Routing uses a bounded Manhattan search with component clearance, bend penalties
and crossing/overlap costs. Breadboard hole clearance and midpoint lanes guide
routes between rows/columns; exact overlaps and close parallel wires carry
additional costs. It prefers cleaner routes; it does not guarantee a
globally optimal layout. Breadboard surfaces remain routable. Overlapping parts
can require manual adjustment. Routes use world-coordinate waypoints in the
connection's fourth array entry; Wokwi's string route commands remain unsupported.

The inspector accepts arbitrary wire colors and per-part tints. Right-click a
part for tint presets, **Gray tint**, or **Original colors**. Original colors are the default; gray and custom tints remain explicit overrides. The part context menu also rotates the selection in 45° steps and flips
it horizontally or vertically; terminals transform with the body. **Simulate**
beside a distance sensor opens a draggable target, numeric distance entry and
no-echo control. Its changes feed the actual emulated sonar timing and UART. Circuit undo/
redo (Command/Ctrl-Z, Shift-Command/Ctrl-Z) includes topology and geometry edits;
editor undo remains separate. Geometry and appearance changes persist without
restarting the Uno. Electrical edits restart it.

Use **Connections** to select/remove wires.
Breadboard strips join five holes per column, the two center halves remain
separate, and each power rail is continuous. Wiring changes restart the Uno.
**Reset circuit** restores the wiring and controls, keeping your code.

Projects autosave in browser storage. **Save project** exports wiring, both
p5 sources, Arduino code, controls and cached firmware; **Open project** restores
them. A complete starter is at `/sim/classroom.physical-p5.json`.

The first supported circuit is Uno R3 / ATmega328P at 16 MHz, HC-SR04 on D9/D8,
pot on A0, buttons on D2/D3 with `INPUT_PULLUP`, and built-in LED 13. Additional
instances of those inputs and breadboards are simulated. All catalog parts can
be placed and wired, with behavior limited to these classroom models. JSON uses
a documented subset of Wokwi's part/connection names; arbitrary Wokwi projects,
Wokwi string wire-route metadata, I2C/SPI devices, ESP32, and general analog circuit solving
are not implemented. Disconnected digital inputs follow configured pull-ups;
unpulled floating inputs resolve low. Missing pot power reads zero; missing
sonar power/trigger produces no echo. Supply shorts and conflicting sensor
drivers are rejected. This model does not calculate current or output contention.

The default project can run from a static local/HTTPS host with no remote
simulation service. Editing Arduino C++ still needs the local compiler helper;
there is no browser C++ compiler or offline service-worker cache yet.

**Connect USB Uno** selects a physical port in a compatible browser. **Upload
compiled sketch** uses the shared explicit-port STK500v1 uploader, checks the
MCU signature and verifies flash by readback before reconnecting. This new lab's
shared uploader was hardware-tested from the code section on 2026-10-13:
HelloLED compiled to 932 bytes, flashed an Uno on usbmodem101, and reconnected.
The browser adapter passes HEX bytes instead of a filesystem path, and the
bundled STK500 driver receives local variable declarations for strict-mode
compatibility. Circuit-section upload and Mega upload need their own device
validation. ESP32 upload is outside this milestone.

Implementation boundaries: `sim/circuit.js` resolves nets, `sim/runtime.js`
models Uno peripherals, `sim/worker.js` runs the CPU, and
`shared/p5/serialProxy.js` / `P5Bridge.js` connect p5 to either host transport.
`window.physicalP5` exposes project/state reads, code edits, input controls,
diagram edits and run/stop for future agent and Artist–Model Studio integration.
It is a page API, not a registered WebMCP tool yet.

All three views share `shared/ui/palette.css` and the same light/dark preference;
theme changes propagate between open tabs. The p5 sandbox exposes `window.theme`
and follows host chrome colors. Authored sketches keep their own drawing colors;
the circuit starter adapts its drawing to the theme. Optional
`/sim/?workspace=name` isolates project storage for separate demos or QA.

## code

Use the **Dark mode** toggle in either app's header to switch themes; your
preference is saved in the browser and shared between both apps.

Choose the board and connect to its USB serial port. Edit the Arduino sketch
and select **Compile + Upload**; compilation runs through Arduino CLI on the
local server and the resulting AVR image is sent through Web Serial. The p5
editor runs in an isolated iframe. Sketches and editor settings persist in
browser local storage.

Arduino can print one or more named numeric values per line, for example:

```cpp
Serial.print("A0: ");
Serial.print(analogRead(A0));
Serial.print(" D4: ");
Serial.println(digitalRead(4));
```

The p5 sketch reads the most recent values from `signals.A0` and
`signals.D4`. Use `send("LED", 1)` to send `LED: 1` to Arduino, or
`sendLine("anything")` to experiment with raw text. The serial monitor remains
available for inspecting both directions.

## firmata

The app includes StandardFirmata 2.5.9 firmware builds for Uno R3 and Mega
2560 in `public/firmata/firmware/`. Select **Flash Firmata** to upload the
matching image, or connect to a board that already runs StandardFirmata.
Firmware flashing temporarily releases the selected port and reconnects after
the upload.

After discovery, choose a mode for each pin. Pin aliases are optional; physical
names such as `D11` and `A0` always work in p5. For example:

```js
const light = pins.A0.value ?? 0;
pins.D11.write(map(mouseX, 0, width, 0, 255));
```

`D0` and `D1` are reserved for USB serial by default. Unlock them only when
your circuit does not need the board's USB serial connection.

To rebuild the bundled firmware, compile the Arduino CLI's
`Firmata/examples/StandardFirmata` sketch for `arduino:avr:uno` and
`arduino:avr:mega`, then replace the corresponding files under
`public/firmata/firmware/`.

## Development checks

```sh
npm test
npm run build
```

Tests execute the bundled Arduino HEX through AVR8js and verify breadboard
nets, ADC, switches, sonar, LED commands, native streams and the unmodified
p5.webserial library, full catalog coverage, LCD variants and connected-dot
color selection. Uno HelloLED upload and reconnection have been hardware-tested;
Firmata discovery, Mega upload and circuit-section upload still require device
validation. Dependency notices and replacement
library source are in `THIRD-PARTY-NOTICES.md` and `public/licenses/`.

## Unified p5comp workspace

The app lives at `~/dev/arduino/p5comp`. Start it with `PORT=8771 npm start`
and open `/`. `/sim/` opens the same unified workspace; the earlier code and
Firmata views remain under Reference.

The right inspector has Arduino, p5, Properties and Help tabs. The bottom has
Simulation, Upload, Serial and Console tabs. File opens/saves the whole project,
creates a blank project, imports Arduino/p5 folders, adds image references, and
exports PNG/SVG/PDF. Project JSON version 2 retains legacy fields and adds
source-file names, helpers/classes, references, settings and output docking.
Older classroom projects continue to load.

Folder imports prioritize `p5comp.json`, then `.ino`, `sketch.js` and helper
sources, plus `diagram.json`. Missing code/diagram receives a blank starter.
Folder saving needs File System Access; JSON download works in other browsers.
Multi-file Arduino compilation writes `.ino`, `.h`, `.hpp`, `.cpp` and `.c`
files to the local compiler's sketch folder. p5 helper JS runs before sketch.js.
CodeMirror supplies language-aware completion plus Arduino/p5 vocabulary.

Select a component to edit its JSON, then Apply JSON. Keep ids unchanged;
positions, rotation and attrs follow the same canvas validation. Image references
are draggable and retain opacity, width and blend. File exports use native SVG
geometry, with optional code below PNG/SVG and paginated code in PDF.

Examples includes classroom sensors, HelloLED, StandardFirmata (hardware only),
and a browser-local shelf for saved class demos. Export those projects to share
with students; browser-local shelf entries are not published automatically.

GitHub Actions runs tests/builds and deploys `main` to GitHub Pages. The static
site runs the compiled classroom emulator and p5 without a server. Edited Arduino
C++ needs a compiler URL in Settings (local helper or a configured service).
GitHub Pages itself cannot execute Arduino CLI. The local helper accepts only
validated source filenames; physical upload still requires a Web Serial browser
and a connected Uno. The compiler helper is bound to localhost by default.

To publish a class example, place its project JSON in `public/examples/` and add
`{"name":"Class demo", "project":"examples/class-demo.json"}` to
`public/examples/index.json`. The Examples menu loads this manifest on both the
local app and GitHub Pages. Keep image references embedded in that project JSON.

### Main views and projection

The main workspace has Circuit / p5 render tabs and a Tabs / Horizontal split /
Vertical split selector. This layout is saved with the project. The ↗ buttons
open independent **mirror windows** for the p5 render or circuit; the original
editor remains in place and continues to use the same Arduino/serial session.
Move these windows to a second screen and use their fullscreen button for a
lecture or installation. p5 mirrors canvas pixels (not separate sketch execution
or interactive HTML controls). The circuit mirror follows the current viewport,
pan/zoom, parts, wire colors and reference images. Closing a mirror leaves the
editor running. Mirror windows are local browser windows and require popup support.

### Editors and p5 project files

The chip / `p5⋆` tabs select the main views. The inspector uses `∞` (Arduino),
`p5.js`, properties and help glyphs. Dropdowns show a compact selected glyph;
open them for glyphs with readable labels. Settings includes themed checkboxes,
editor font size and Follow theme, Subdued light/dark, GitHub light/dark palettes.

- **⌘/Ctrl Enter**: compile/run Arduino or run p5 from its editor.
- **⌘/Ctrl Shift Enter**: compile/upload from an Arduino editor, after connecting USB.
- **⌘/Ctrl Shift + / −**: adjust editor font size (8–32 px).
- **⌘/Ctrl Shift F**: tidy the current C++/JavaScript/HTML/CSS source. C++ uses
  lazy-loaded browser clang-format WASM; other sources use Prettier.

Arduino's compile/run and USB compile/upload controls live in its tab. Compiler
output and upload progress appear in the bottom Console; Serial remains separate.
p5 has explicit run/stop controls and a debounced Auto-run checkbox, **off by
default** and reset when opening a project. Formatting is a normal undoable edit.

p5 file tabs include editable `index.html` and `style.css`. The asset glyph opens
library references, image previews, imports/removal and current-project localStorage
metadata. Folder import preserves HTML/CSS and nested image/media/font/JSON assets
(up to 4 MB each); these are embedded in project JSON and restored as files on
folder save. p5 loaders and `fetch()` resolve imported asset paths inside the
sandbox. HTML script URLs load additional libraries; the bundled p5 and
p5.webserial libraries and project source files are not loaded twice. HTML styles,
CSS source and imported CSS image URLs apply to the preview. Browser security
restrictions still apply to external URLs. Project storage inspection concerns
this project's key rather than unrelated browser storage.

Upload reset uses a DTR pulse with RTS released and short bootloader sync retries.
The compile/upload action calls the uploader directly rather than relying on the
legacy hidden upload button's enabled state. If one USB port is already granted,
Connect reuses it; multiple granted ports still open the browser chooser.

### ZIP, component properties and passive simulation

File → Download project ZIP includes the full `p5comp.json` manifest,
`circuit/diagram.json`, `ino/<sketch>/<sketch>.ino` with Arduino helpers, and
`p5/` with JS, HTML, CSS, assets and bundled p5/p5.webserial libraries. Extract it
and use Open folder to restore the full project; the Arduino sketch folder can
also be opened directly in Arduino IDE.

Double-click a component body or its label to edit its display label. Properties
has Name / ID and Label fields plus the component's declared Wokwi attributes.
Press Enter or leave a field to apply it. Changing the ID updates attached wire
endpoints. JSON can edit `attrs` directly; the play glyph or ⌘/Ctrl Enter applies
it as an undoable edit. Arduino and p5 editors retain ⌘/Ctrl Enter to run.

LEDs follow actual simulated Uno digital output states, including correct polarity
and disconnected wiring. Series resistors affect current and LED brightness;
resistor values update their color bands. Properties and component hover show
current/power readings. This is a **classroom series-path model**, with a default
2 V LED forward voltage (`attrs.forwardVoltage` can override it), rather than a
full analog/SPICE solver for parallel networks or transistor circuits. Unmodeled
components remain marked as visual-only in the picker. No-resistor/overcurrent
warnings appear in the LED hover tip. These states come from simulation, not
measurement of a connected physical board.
