# Simulation and lesson canvas

`Examples → Nano · displays / RGB / servo / buzzer` runs the bundled compiled Nano sketch offline. The same ATmega328P runtime now supports Uno and classic Nano. Nano compilation uses `arduino:avr:nano:cpu=atmega328`; A6/A7 are analog-only. Nano physical upload has not been tested. Mega, Leonardo, RP2040 and ESP32 remain placement-only; their CPUs/pin maps are not equivalent to Uno.

## Models currently implemented

- Existing distance sensor, potentiometer, momentary buttons, breadboard contacts, LEDs and series resistors.
- RGB LED: three series-path LED channels, common cathode by default; `attrs.common: "anode"` inverts polarity. Each channel should have its own resistor.
- Seven-segment: single digit A–G/DP, shared COM pins, cathode default or `common: "anode"`. Multiplexed multi-digit behavior is pending.
- Servo: pulse widths measured from emulated CPU cycles, 544–2400 µs mapped to 0–180°. Requires V+/GND. No mechanics, current draw or torque model.
- Buzzer: `tone()` activity and frequency shown visually; sound output is pending. Pin 1 signal, pin 2 ground.
- LCD1602/LCD2004: parallel HD44780 4/8-bit text, DDRAM addressing, clear/home and display on/off. Requires VDD/VSS. I2C backpacks, reads/busy flag, custom glyphs, cursor/scroll/entry-mode commands and electrical backlight/contrast are pending.

The resistor/LED model is a classroom series-path model, not a general SPICE solver. PWM brightness averaging, LED strips, OLED/TFT SPI/I2C controllers, motor/stepper drivers and remaining sensor protocols are future work. The picker hover text describes model scope; hollow circles mean visuals/wiring only.

## Canvas lesson objects

File → Add image / video imports local media (up to 24 MB each); browser codec support determines which videos play. Video controls stay interactive; drag the title strip to move an object. Properties provides width, position, opacity and blend. These objects move/zoom with the circuit. They are saved in project JSON and ZIP; large media can exceed browser localStorage quota, so save a project file when the storage warning appears. Long-term large media storage needs IndexedDB or project-folder references.

File → Add lesson note supports GitHub-flavored Markdown or sanitized HTML. This follows Artist–Model Studio's Markdown/raw-HTML lesson format; scripts, forms, style injection and executable embeds are removed. Double-click a note to edit. Notes and media have their own property controls; circuit box selection/undo does not yet include them.

Exports include note text and the current decoded frame of a video, not a playable video in PNG/PDF. Markdown styling is simplified to text in vector exports. Project JSON/ZIP retains the editable note source and complete video.

## Custom components

File → Component editor currently defines reusable presets:

```json
[{ "name": "10k resistor", "base": "wokwi-resistor", "attrs": { "value": "10000" } }]
```

Saved presets appear under Custom in the searchable element picker and travel with the project. They reuse the base component's pins and simulation. They do not introduce a new electrical model or arbitrary executable code.

For a new behavior, add net extraction in `sim/circuit.js`, implement its deterministic decoder in `sim/peripherals.js` (called on AVR GPIO changes), and map the returned state onto the Wokwi element in `sim/main.js`. Add a compiled-firmware regression to `tests/peripherals.test.js`. A future dedicated component editor should separate symbol/pin geometry, declarative attributes, electrical behavior and protocol tests, with sandboxed execution for custom code.

## Interaction details

Double-click a sonar to open its distance simulator. It chooses a viewport position with minimal overlap with the sensor, and its header can be dragged. While paused, the main play button resumes; the separate pause button keeps its pause glyph and is disabled.
