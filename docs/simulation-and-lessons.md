# Simulation and lesson canvas

`Examples → Nano · displays / RGB / servo / buzzer` runs the bundled compiled Nano sketch offline. The same ATmega328P runtime now supports Uno and classic Nano. Nano compilation uses `arduino:avr:nano:cpu=atmega328`; A6/A7 are analog-only. Nano physical upload has not been tested. Mega 2560 is now modeled with its own GPIO map, 256 KB flash, 8 KB SRAM, 16 single-ended ADC channels, timers 0–5, external/pin-change interrupts and USARTs 0–3. The editor/p5 serial transport uses USART0; the secondary UART registers are emulated but do not yet bridge external UART devices on the canvas. Differential ADC modes, SPI/I2C bus devices and watchdog behavior are not included. Leonardo, RP2040 and ESP32 remain placement-only. Mega compile uses `arduino:avr:mega`; circuit hardware upload remains guarded because its STK500v2 path is separate from the Uno uploader.

## Models currently implemented

- Existing distance sensor, rotary/slider potentiometers, momentary buttons, breadboard contacts, LEDs and series resistors.
- DIP switch: eight independent bidirectional contacts. Slide switch: SPDT pin 2 connects to 1 or 3. Both can switch inputs or series LED paths.
- Matrix keypad: 4×3 or 4×4 scanned row/column contacts, simultaneous keys and real undioded-matrix ghosting. Click the native keys or use the input simulator; releasing/closing the popup releases held keys.
- Photoresistor: lux-to-resistance divider using `rl10`/`gamma`, AO voltage, DO high when dark; powered only with VCC/GND. [Reference](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor).
- Small/big sound sensors: deterministic 0–1023 sound-level slider, analog voltage and digital threshold. `threshold` is in raw ADC units, default 512; `activeLow` optionally inverts DO. These are lesson models, not live microphone input, waveform capture, or acoustic physics.
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

File → Add lesson note supports GitHub-flavored Markdown or sanitized HTML. This follows Artist–Model Studio's Markdown/raw-HTML lesson format; scripts, forms, style injection and executable embeds are removed. Double-click a note to edit. Notes and media have their own property controls; circuit box selection/undo does not yet include them.

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
