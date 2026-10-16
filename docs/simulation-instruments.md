# PWM and instruments

Settings → PWM / simulation refresh sets visual updates from 10–120 Hz (60 Hz by default), saved globally in this browser. It does not change the Arduino timer's actual PWM frequency. LED and RGB LED brightness averages high time over each refresh interval; slower digital blinking remains visible.

Add instruments through the element picker. The catalog includes Instruments → PWM · meter and signal probe.

- Multimeter V: connect V+ and COM across two nodes. Shows DC or averaged PWM voltage.
- Multimeter mA: insert V+ and COM in series with a resistor/LED path. Uses a 0.1 Ω simulated shunt. Over 200 mA shows OL; check for a parallel connection across a supply. This is the classroom DC/series-path model, not a general SPICE ammeter.
- Multimeter Ω: disconnect power first. Measures equivalent resistance of resistor networks, closed switches, and powered-pot divider legs. LIVE indicates an energized network, OL an open circuit. Semiconductor resistance and capacitor transients are not modeled.
- Signal probe: connect SIG to a digital signal and GND to its reference. Shows voltage, frequency, duty cycle, and the last 50 ms of pin transitions. Voltage works on modeled resistor/pot nodes too; edge timing requires a connected Arduino digital pin. Probe sampling does not load the circuit.

The instruments persist as normal diagram parts. Changing multimeter mode updates its electrical model and restarts a running simulation.

## Sketches and canvas media

Each code toolbar has a sketch library: built-in examples, browser-local saved sketches, JSON import/export, and loading only the selected language into the current project. p5 exports include HTML/CSS, auxiliary JavaScript and assets. These libraries are separate from whole-project examples.

Code-toolbar transports toggle run/stop independently; the main transport starts/stops Arduino and p5 together. Communication helpers use comment dividers inside the existing managed-block markers so changing API replaces the block cleanly.

File → Add image / video adds a frameless media reference by default. Properties offers an editable label and label visibility. Corner handles resize images, videos and webcam frames. Assets can be placed with their add-to-canvas button or dragged onto the circuit. Double-click media to focus its properties.

File → Add webcam adds an inactive frame. Start camera requests browser camera permission (no audio); Stop camera releases its tracks. Snapshot saves a PNG into project assets. Streams are never serialized or automatically restarted when reopening a project; removing the frame or opening a different project releases its stream.

## Plotter and power references

Add **Plotter** from Instruments. Connect GND to the circuit reference and CH1–CH8 to any modeled voltage nodes. Connected channels appear automatically; floating channels leave gaps. It observes without loading the circuit. This first version plots electrical voltages, rather than arbitrary p5/serial data streams.

In Properties set `timeWindow` (0.1–120 seconds), `layout` (`overlay` or `stack`), `autoNormalize`, and fixed `min`/`max` volts. Overlay auto scale shares a range; stacked auto scale fits each channel independently. The bounded trail uses simulation time: pause freezes it and a simulation restart clears it. The Instruments example **Plotter · multiple signals** includes RGB PWM traces and a 5V reference.

**GND · ground reference** and **VCC · 5V reference** in Basic are global net symbols tied to the simulated Arduino ground and 5V supply. Wire a nearby symbol to a probe/meter instead of running a wire back to the board. They are electrical connections, not decorative labels; joining VCC to GND triggers the existing short-circuit error. They currently require the usual single simulated Arduino.
