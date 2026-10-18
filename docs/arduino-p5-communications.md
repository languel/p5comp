# Arduino ↔ p5 communications

Start with **Examples → Communications → Serial basics · two-way LED (minimal)**.
It needs only an Uno and its built-in LED. Upload the Arduino sketch, connect the
p5 sketch, and click **Toggle LED**. Arduino reports the LED state, so the p5
circle shows the received value, not an independent animation.

The standalone sources are [sketch.ino](../public/examples/serial-basics/sketch.ino),
[sketch.js](../public/examples/serial-basics/sketch.js), and
[index.html](../public/examples/serial-basics/index.html). Copy sketch.js into a
p5 2.x editor; no extra library is needed for this native Web Serial example.
The two buttons and read callback are deliberately explicit. Reload the preview
to release/reconnect its port. The full adapter below supplies connection controls,
auto-connect, and a reusable message handler for larger projects.

HelloLED demonstrates a simple incoming `0`/`1` stream. Four Signals demonstrates
six comma-separated values. Both use the configurable communications block and
fixed canvas colors. The app's theme does not affect their drawing code.

## Choose a transport

**p5.webserial** gives familiar calls such as `readUntil('\n')` and `println()`.
The generated sketch uses an existing library, then tries `./p5.webserial.js`,
then its pinned jsDelivr URL. All loading code lives inside sketch.js, so one
copy/paste works outside p5comp. ZIP exports include the local library.

**navigator.serial** uses the browser API directly. It has no extra dependency;
the adapter handles text decoding, message boundaries, and read/write locks.
Both adapters use **9600 baud by default**. Neither specifies the message format:
that is the protocol you design. Firmata is a separate binary protocol, requires
StandardFirmata firmware, and defaults to **57600 baud**.

Inside p5comp, the app owns the physical port or simulator and supplies a proxy
to p5. Outside it, Connect Arduino opens the browser's real chooser. Disconnect
p5comp and Arduino Serial Monitor before connecting from a different page.
Safari does not support direct USB serial, including through p5.webserial.
Use a Web Serial browser such as Chrome or Edge, HTTPS or a localhost server.

## Configure the full adapter

These constants are near the beginning of the marked communications block:

```js
const SERIAL_BAUD_RATE = 9600;
const SERIAL_AUTO_CONNECT = false;
const SERIAL_CONTROLS = 'always';
const SERIAL_SHORTCUT = 's';
```

Match the baud rate to `Serial.begin()` in Arduino. The minimal sketch names its
constant `BAUD_RATE`; the full adapter names it `SERIAL_BAUD_RATE`. When using
physical USB inside p5comp, match the Serial panel's baud selector too.

Auto-connect only opens a **previously permitted, uniquely identified port**.
It never opens a chooser during startup. With no permitted device, or multiple
permitted devices, it leaves Connect visible for you to choose. The full adapter
keeps the app's existing selected connection when running inside p5comp.

Controls remain visible while disconnected or displaying an error. Once connected:

| SERIAL_CONTROLS | Behavior |
| --- | --- |
| `'always'` | Show Connect/Disconnect. |
| `'hover'` | Reveal when the pointer enters the bottom-right control area or the control receives keyboard focus. |
| `'hidden'` | Reveal using the shortcut. |

**Alt+Shift+S** toggles the controls while connected. Click the sketch first if
its preview is inside an iframe. The shortcut ignores text fields. Change
SERIAL_SHORTCUT to another letter if needed. Hide controls only after testing
the connection, so failures are easy to see.

Switching native ↔ p5.webserial preserves these settings. Switching to/from
Firmata restores the transport's default baud rate. Rebuilding the managed
block preserves literal settings; keep drawing and parsing code outside it.

## Start with one value per line

Arduino's `println()` ends a message. A browser read can contain part of a
message or several messages; do not assume one USB chunk equals one message.
The adapter assembles complete lines and calls your handler:

```js
let sensorValue = 0;

function acceptLine(serialLine) {
  const nextValue = Number(serialLine.trim());
  if (Number.isFinite(nextValue)) sensorValue = nextValue;
}
```

On Arduino:

```cpp
Serial.println(analogRead(A0));
```

Use sensorValue in draw(). Sending a sample every 20–100 milliseconds is a useful
starting point for classroom visualizations. Sending the same value repeatedly
is fine. Avoid diagnostic prose on the data stream unless your parser handles it.

## Add fields or message types

Four Signals sends `button,pot,led,r,g,b`. Parse a complete row, check its shape,
then update the drawing:

```js
function acceptLine(serialLine) {
  const fields = serialLine.trim().split(',').map(Number);
  if (fields.length !== 6 || !fields.every(Number.isFinite)) return;
  [buttonState, potValue, ledState, redValue, greenValue, blueValue] = fields;
}
```

For independent messages, give each line a name. For example Arduino can send
`pot,512` or `button,1`:

```js
function acceptLine(serialLine) {
  const [name, rawValue] = serialLine.trim().split(',');
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (name === 'pot') potValue = value;
  if (name === 'button') buttonState = value;
}
```

For structured messages, send one JSON object per line and use
`JSON.parse(serialLine)` in try/catch. Keep field names stable and document units:
`{"type":"distance","cm":42.5}` is clearer than an unexplained number.

## Send commands back

The minimal demo writes one ASCII character, `0` or `1`; Arduino ignores other
characters. That is enough for its single LED. The full adapter can send named
newline-terminated commands:

```js
arduinoComms.sendLine('LED:1');
arduinoComms.sendLine('LED:0');
```

Collect characters in Arduino and act when the newline arrives:

```cpp
String command;

void readCommands() {
  while (Serial.available()) {
    char next = Serial.read();
    if (next == '\n') {
      command.trim();
      if (command == "LED:1") digitalWrite(LED_BUILTIN, HIGH);
      if (command == "LED:0") digitalWrite(LED_BUILTIN, LOW);
      command = "";
    } else if (command.length() < 64) {
      command += next;
    }
  }
}
```

Call readCommands() from loop(). Reporting the resulting LED state back lets p5
confirm what Arduino did. Keep the message format separate from presentation:
connect → receive a complete message → validate → update state → draw.

### HelloLEDp5: a minimal blink-rate control

Open **File → Examples → Communications → HelloLEDp5**. This is a separate
example; the original HelloLED stays unchanged. Run the circuit and p5, then
move the slider: p5 sends one integer plus a newline (milliseconds between LED
toggles). Arduino uses `millis()` rather than `delay()` so it keeps receiving
updates while blinking. It reports `0` or `1` after each toggle, and p5 displays
the actual returned LED state rather than a second blinking animation.

The interval ranges from 50 to 2000 ms; a complete on/off cycle takes twice the
interval. Both sketches use 9600 baud. The LED plugs directly into D13/GND,
as in HelloLED. Standalone sources are in `public/examples/helloled-p5/`.
Outside p5comp use a Web Serial browser (Chrome/Edge), upload the Arduino sketch,
close other serial clients, then click Connect Arduino in p5. Safari is unsupported.

**Field / feedback** remains in Communications as the richer sensor/artwork demo.

## Shipped examples and the Simulation diagram

Circuit controls are discovered from components and wiring automatically. The p5
side is built from declared variables: use `@receive name`, `@send name`, and an
optional `@param` range. These are ordinary comments, ignored by p5js.org. They do
not change serial messages or add a second transport. See the
[signal annotation guide](p5-parameters.md) for explicit component mappings.

| Example | Arduino → p5 | p5 → Arduino |
| --- | --- | --- |
| HelloLED | `led` | — |
| Four signals | `button`, `pot`, `led`, `rgb` | — |
| PWM · meter and signal probe | `button`, `pot`, `led`, `rgb` | — |
| Plotter · multiple signals | `button`, `pot`, `led`, `rgb` | — |
| Serial basics | `led` | `desiredLed` |
| HelloLEDp5 | `led` | `interval` |
| Field / feedback | `sensor.pot`, `sensor.cm`, `sensor.hold` | `requestedRGB` |

Four signals and its instrument variants report their measured/output state over
serial. Their PWM animation is generated on Arduino; p5 visualizes the received
RGB values. They are intentionally one-way demonstrations. Serial basics,
HelloLEDp5 and Field / feedback demonstrate commands traveling back to Arduino.
Examples with transport set to **none** are circuit-only lessons and have no p5
serial arrows. A catalog test checks that every serial-enabled example exposes
its signals and that the exposed readings follow real received packets.
