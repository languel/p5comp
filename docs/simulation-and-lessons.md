# Simulation and lesson canvas

`Examples → Nano · displays / RGB / servo / buzzer` runs the bundled compiled Nano sketch offline. The same ATmega328P runtime now supports Uno and classic Nano. Nano compilation uses `arduino:avr:nano:cpu=atmega328`; A6/A7 are analog-only. Nano physical upload has not been tested. Mega 2560 is now modeled with its own GPIO map, 256 KB flash, 8 KB SRAM, 16 single-ended ADC channels, timers 0–5, external/pin-change interrupts and USARTs 0–3. The editor/p5 serial transport uses USART0; the secondary UART registers are emulated but do not yet bridge external UART devices on the canvas. Differential ADC modes, SPI/I2C bus devices and watchdog behavior are not included. Leonardo, RP2040 and ESP32 remain placement-only. Mega compile uses `arduino:avr:mega`; circuit hardware upload remains guarded because its STK500v2 path is separate from the Uno uploader.

## Models currently implemented

- Existing distance sensor, rotary/slider potentiometers, momentary buttons, breadboard contacts, LEDs and series resistors.
- DIP switch: eight independent bidirectional contacts. Slide switch: SPDT pin 2 connects to 1 or 3. Both can switch inputs or series LED paths.
- Matrix keypad: 4×3 or 4×4 scanned row/column contacts, simultaneous keys and real undioded-matrix ghosting. Click the native keys or use the input simulator; releasing/closing the popup releases held keys.
- Photoresistor: lux-to-resistance divider using `rl10`/`gamma`, AO voltage, DO high when dark; powered only with VCC/GND. [Reference](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor).
- Small/big sound sensors: deterministic 0–1023 sound-level slider, analog voltage and digital threshold. `threshold` is in raw ADC units, default 512; `activeLow` optionally inverts DO. Settings → Audio input and output can feed microphone, test-tone or file RMS levels to these models. They do not model sample-by-sample microphone voltage or acoustic physics.
- PIR: simulate motion to trigger OUT for `delayTime` seconds, then ignore triggers for `inhibitTime`. Retrigger extends the hold unless `retrigger` is `"0"`. Timing follows emulated CPU time, so pause freezes it. [Reference](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor).
- RGB LED: three series-path LED channels, common cathode by default; `attrs.common: "anode"` inverts polarity. Each channel should have its own resistor.
- LED bar graph: ten independent anode/cathode series channels, with per-channel resistor/current behavior.
- NeoPixel single/ring/strip/matrix: WS2812 GRB (or `colorOrder` RGB permutations), reset latch, DIN/DOUT daisy chains and up to 256 pixels per item. Matrix mapping is row-major. Incomplete frames leave the previous complete frame visible; SK6812 RGBW is not implemented. The two catalog sketches use Adafruit NeoPixel 1.15.5; cached HEX runs offline. To recompile, install **Adafruit NeoPixel** using Arduino Library Manager / `arduino-cli lib install "Adafruit NeoPixel"`. [Library source](https://github.com/adafruit/Adafruit_NeoPixel).
- Relay: powered SPDT module, IN controls isolated COM/NO/NC contacts. Default NPN/active-high; `transistor: "pnp"` or `activeLow: true` enables active-low. This logical model has no coil current, contact bounce or inductive transients.
- Stepper: ideal bipolar full/half-step coil sequence, plus A4988 STEP/DIR, enable, reset/sleep and 1–16× microstep decoding. Driver outputs must connect to the motor coil terminals to move it. Biaxial stepper supports independent inner/outer coils. No torque, acceleration, missed steps, driver current-limit or supply-droop model. A4988 and relay visuals are original p5comp symbols because the installed Wokwi Elements package does not ship those visuals.
- Seven-segment: single digit A–G/DP, shared COM pins, cathode default or `common: "anode"`. Multiplexed multi-digit behavior is pending.
- Servo: pulse widths measured from emulated CPU cycles, 544–2400 µs mapped to 0–180°. Requires V+/GND. No mechanics, current draw or torque model.
- Buzzer: `tone()` activity and frequency shown visually; sound output is pending. Pin 1 signal, pin 2 ground.
- LCD1602/LCD2004: parallel HD44780 4/8-bit text, DDRAM addressing, clear/home and display on/off. Requires VDD/VSS. I2C backpacks, reads/busy flag, custom glyphs, cursor/scroll/entry-mode commands and electrical backlight/contrast are pending.

The resistor/LED model is a classroom series-path model, not a general SPICE solver. PWM brightness averaging, OLED/TFT SPI/I2C controllers and remaining sensor protocols are future work. The picker hover text describes model scope; hollow circles mean visuals/wiring only.

## Example catalog

The Examples menu contains separate DIP, keypad, slider/switch, photo/PIR, sound, NeoPixel chain, NeoPixel matrix, relay, stepper and Mega lessons. They include compiled firmware and saved routed wire geometry; labels are visible. Colors distinguish ground, supply, data and paired signals. Each sketch focuses on a small number of concepts, with code comments explaining the pin mapping. Shift-click **Cleanup wires** for simple routing that allows crossings while avoiding shared wire segments; ordinary cleanup retains the careful router.

## Canvas lesson objects

File → Add image / video imports local media (up to 24 MB each); browser codec support determines which videos play. Video controls stay interactive; drag the title strip to move an object. Properties provides width, position, opacity and blend. These objects move/zoom with the circuit. They are saved in project JSON and ZIP; large media can exceed browser localStorage quota, so save a project file when the storage warning appears. Long-term large media storage needs IndexedDB or project-folder references.

File → Add note or Add element → Note creates a blank note with no label, focused for typing directly on the canvas. Double-click a note body to edit its source in place; click away or press ⌘/Ctrl Enter to render it, or Escape to cancel the edit. Selecting the note also opens its source in the Properties CodeMirror editor. Double-click the title to edit its name. Choose Markdown, HTML, or LaTeX / KaTeX, edit the name/source, and see the canvas update live (⌘/Ctrl Enter also applies). Markdown and HTML support inline `$...$` / `\(...\)` and display `$$...$$` / `\[...\]` math; LaTeX mode accepts a bare KaTeX expression. Code blocks stay literal. Scripts, forms, style injection and executable embeds are removed from HTML; KaTeX does not permit trusted commands. Notes retain width, position, opacity and blend controls. Notes and media remain outside circuit box selection/undo.

Exports include note text and the current decoded frame of a video, not a playable video in PNG/PDF. Markdown styling is simplified to text in vector exports. Project JSON/ZIP retains the editable note source and complete video.

## Custom components

File → Component editor currently defines reusable presets:

```json
[{ "name": "10k resistor", "base": "wokwi-resistor", "attrs": { "value": "10000" } }]
```

Saved presets appear under Custom in the searchable element picker and travel with the project. They reuse the base component's pins and simulation. They do not introduce a new electrical model or arbitrary executable code.

For a new behavior, add net extraction in `sim/circuit.js`, implement its deterministic decoder in `sim/peripherals.js` (called on AVR GPIO changes), and map the returned state onto the Wokwi element in `sim/main.js`. Add a compiled-firmware regression to `tests/peripherals.test.js`. A future dedicated component editor should separate symbol/pin geometry, declarative attributes, electrical behavior and protocol tests, with sandboxed execution for custom code. Extended output protocols live in `sim/outputModels.js`; analog/contact models in `sim/inputModels.js`; AVR board register maps in `sim/avrBoards.js`.

## Interaction details

Double-click a sonar to open its distance simulator. It chooses a viewport position with minimal overlap with the sensor, and its header can be dragged. Escape closes sonar and input simulator popups, including when a field inside has focus. While paused, the main play button resumes; the separate pause button keeps its pause glyph and is disabled.

These are intentionally bounded classroom models. Active-part supplies are checked against the 5V/GND nets; switched relay/DIP load paths currently cover passive LED/resistor branches, not dynamically switched active-part power. The stepper driver does not simulate a high-voltage power stage. None of the new hardware upload combinations were physically tested in this change.

Breadboards keep their original light color across themes. Change **Board color** in Properties (or the component color menu); mini, medium and long boards are grouped under Breadboards with size-specific previews.

Notes have independent Background, Text color, Font size, Width and Height properties. A blank height fits content; drag the lower-right corner to resize the frame. Notes scroll when their content exceeds the frame. These attributes are saved in the project.

Double-click a part label to rename it; double-click its body to edit its value or open its simulator. Parts without a quick value editor open Properties. For notes, double-click the title to edit the name or the body to edit source directly on the canvas.

Color swatches share an opacity-enabled picker adapted from Artist Model Studio. Use Opacity or an eight-digit hex value (`#RRGGBBAA`); alpha is retained for note paper/text, workbench/output backgrounds, boards and wires.

### Starter examples

Examples → Getting started contains **HelloLED** (LED directly in the adjacent Uno D13/GND headers, serial-linked p5 indicator) and **Four signals · input and output**. The latter uses a D2 INPUT_PULLUP pushbutton, a separate D12 LED with 220 Ω resistor, an A0 potentiometer, and a common-cathode RGB LED with one 220 Ω resistor per D9/D10/D11 channel. The button controls the digital LED; the pot sets RGB brightness while the three PWM outputs crossfade continuously. `analogWrite` produces PWM, not a true analog voltage. The p5.webserial dashboard receives six CSV values at 9600 baud: button, pot, LED, R, G, B. Both projects include compiled Uno firmware and readable routed connections.

Bundled examples are grouped into Getting started, Inputs, Outputs, Boards and Reference. Catalog entries use a `folder` field; browser-saved projects appear under My examples.


### Simple p5comp parts and updated defaults

The picker includes a simple three-terminal potentiometer, two-terminal SPST toggle, two-terminal photoresistor and capacitor. The pot provides a powered 0–1023 analog value. The switch opens/closes its two contacts. The photoresistor has a lux slider and `rl10`/`gamma` attributes; combine it with a fixed resistor to make an ADC voltage divider. The capacitor has editable capacitance and now supports transient charging/discharging. See [electronics foundations](electronics-foundations.md) for the analog solver, new basic components, scope, generator and audio limits.

General catalog demos now use Uno; Boards includes Uno, Nano and Mega examples. Four signals uses a medium breadboard, with LEDs seated in holes and current-limiting resistors across its center gap. Ground wiring is black. Resistor rotation handles accept either a click (45 degrees) or drag.

Example `index.html` files are formatted with embedded `<style>` blocks. CSS remains available as a separate file when a project needs it. Starter p5 drawings use one replaceable communications adapter. Transport switches and p5 reruns request serial cleanup before replacing the preview; pending reads finish and reader/writer locks are released. The serial monitor remains owned by the host.

### Plug-in terminals and moving assemblies

Pins placed in breadboard holes or Uno/Mega female sockets automatically connect.
Small terminal dots indicate contact; snapping helps align the mating pins even
when the workbench grid differs. Male headers do not mate with other male headers.
The Nano uses exposed pins by default. Other terminal roles can be specified with
`attrs.connector: "socket" | "pin" | "contact"`, or per pin through
`attrs.connectors`, e.g. `{ "VCC": "socket" }`. Contact-only terminals require wires.

Dragging a host board carries its inserted components. Dragging an inserted
component pulls it out without moving the host, and breaks its socket contacts.
Ordinary authored wires stay attached and stretch. Drag a contact dot away to
unplug a single terminal, or choose **Unplug component** from the component context
menu. A disconnected dot stays disconnected until the part is pulled away and
reinserted. These operations support undo/redo and save in the project.

For independent rigid assemblies, select components and use **Group selection**
(⌘/Ctrl G), or **Ungroup** (⌘/Ctrl Shift G). Manual groups move together regardless
of socket insertion. Socket contacts and manual groups are separate: ungrouping
alone does not electrically unplug a component. Complex connections still use
ordinary wires.

Select any circuit component (including the Arduino) and press ⌘/Ctrl Delete
(or ⌘/Ctrl Backspace) to remove it without confirmation. Circuit deletion can be
undone and removes attached links while preserving unselected parts. Click a note,
image, video or capture overlay and use the same shortcut to remove that scene
item; deleting a capture also releases its stream. Inside code editors and text
inputs, the shortcut keeps its normal text-editing behavior.

Canvas clipboard: ⌘/Ctrl C copies selected components and their internal wires, manual groups, and socket attachments. ⌘/Ctrl V creates fresh IDs with a 20-unit offset. Explicitly selected wires to objects outside the selection become free ends; ordinary external hookups are not copied. Component paste and Option/Alt-drag duplication participate in circuit undo. Dragging a mounted host duplicates its mounted children too. Option/Alt-drag a component body to duplicate and move it in one gesture.

Selected notes, images, video and capture frames also support copy/paste and Option/Alt-drag. Captures duplicate their configuration, not a live device stream. Text fields, inline note editing and CodeMirror keep native text copy/paste. Clipboard fragments are portable JSON text, so they can be pasted into another p5comp workspace. Media changes retain the existing persistence behavior and are outside the circuit undo stack.

Capture overlays use a compact top control bar, including close, that appears on hover (or keyboard focus). Its webcam source selector lists video devices; browsers reveal camera names after permission is granted. Changing the source replaces the stream and releases the previous camera. The separate window-share control remains the route for Desk View and other windows. Camera permission and source switching must be initiated in the human UI.

Main Circuit and p5 tabs have independent subtle running glows; reduced-motion preferences use a static glow. The p5 render label is `p5`, and the circuit-code inspector uses the shared chip glyph.
