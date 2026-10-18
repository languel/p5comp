# Field / feedback

Open **Examples → Communications → Field / feedback · two-way generative signals**.
Run the simulation, then move the pot and sonar control and toggle the switch.
The project includes cached Uno firmware, so it also runs on the static site.

This is an original relational drawing inspired by [Casey Reas's Software
Structures](https://whitney.org/exhibitions/software-structures), not a reproduction
of one of its implementations. Agents form breathing springs: nearby pairs attract, close pairs repel, and
two moving eddies keep injecting energy. Damping and a speed cap keep the system
bounded without letting it settle into a static flow field.

## Follow the complete loop

| Source | Arduino / p5 behavior |
| --- | --- |
| Pot, A0 | Arduino reads 0–1023, uses it to scale RGB brightness, and reports it. p5 uses the same reading to change spring tension. |
| Sonar, trigger D4 / echo D3 | Arduino measures distance in cm. p5 maps it to the agents' preferred spring spacing. A missing echo is `-1`, shown as a gap in the plot. |
| Toggle, D7 to GND | Arduino debounces the closed contact. p5 reverses the circulation direction; both states keep moving. |
| Hue slider in p5 | p5 chooses an RGB color affected by motion energy and sends it back to Arduino. |
| RGB, R D10 / G D9 / B D11 | All three pins support PWM. Arduino applies `requested × pot / 1023` and reports the result. |
| D13 LED | Lights while valid p5 color commands have arrived within the last 1.2 simulated seconds. |

The circuit retains the original layout. Its pot power jumpers were corrected,
and RGB blue moved from non-PWM D8 to PWM D11. Ground wires are black.
For physical hardware, use a series current-limiting resistor (typically 220–330 Ω)
on each RGB channel; the authored simulator circuit retains the direct LED wiring.
The RGB LED is common cathode. No physical upload is performed when loading this demo.

## See the data

- **P** or **Plots**: hide/show the raw-data panel.
- **O** or **Side / overlay**: put the panel beside or over the drawing. Narrow
  browser windows use an overlay.
- **R**: restart the generative field without restarting Arduino.
- The Hue slider controls the p5 color family. The pot still determines the
  physical brightness; moving the slider cannot bypass it.

The plots show an eight-second history of received pot, distance, switch, and
applied R/G/B values. The footer compares the current p5 target with the most
recent applied RGB packet. These can differ because the pot scales brightness
and serial messages take time. ACK is the last command sequence Arduino accepted;
round-trip time is measured from a command's browser send to its acknowledgement
in a sensor packet. In simulation it includes the simulator's pacing and serial
buffers, not just USB latency. A disconnected/stale feed is explicitly marked.

## Protocol / classroom modifications

Both sides use **9600 baud**. Fields are whitespace-separated `ID:value` pairs;
their order is free. `POT0` is A0, `DIST0` is sonar distance in cm, and `SW1`
is 1 when the switch is closed. `MS` is Arduino time; `SEQ`/`ACK` identify commands.
The complete sensor packet is validated before updating state; extra numeric
sensor IDs are accepted, but missing/duplicate/malformed fields are rejected.
Commands require SEQ, R, G, and B exactly once. Arduino sends approximately ten telemetry packets
per simulated second; p5 sends at most ten commands per browser second.

```text
Arduino → p5: MS:123 POT0:512 DIST0:42.3 SW1:0 R:128 G:64 B:32 ACK:7\n
p5 → Arduino: SEQ:8 R:255 G:80 B:20\n
```

RGB values are 0–255. The host code sends unscaled color. Arduino performs the
pot multiplication and echoes both its applied output and the accepted sequence.
Messages are newline framed. The parser rejects incomplete or malformed packets;
Arduino bounds its receive buffer and rejects oversized/out-of-range commands.

Try changing the rule in `drawField()` before changing the protocol. For example:
make distance control damping, make the switch erase trails, or change the
eddy strength. `stepSprings()` is the three-force model; `drawField()` renders it. To add a new sensor, extend the Arduino packet and update `acceptLine()` and
its validation together. Keep IDs and units documented.

Standalone sources live in `public/examples/field-feedback/`: `sketch.ino`,
`sketch.js`, and readable `index.html` with embedded CSS. The p5 file contains the
portable communications adapter after the drawing code. It works in p5comp with
its proxy and outside it with Web Serial. Use the normal project ZIP export to
include p5.js and the local p5.webserial library. The in-sketch loader also tries
a CDN if its local p5.webserial file is absent. Disconnect other serial monitors
before opening the physical port. See the [communications guide](arduino-p5-communications.md).

## Reading the serial monitor

Every received snapshot is a single line containing all sensor IDs and applied
outputs. The monitor uses horizontal scrolling instead of wrapping long packets.
**Latest (⥨)** shows the newest RX and TX packets in two fixed rows.
**Stream follow (⟱)** shows all messages chronologically and follows the newest.

**Pause (Ⅱ)** freezes either view; Arduino, p5, and their connection continue.
The paused feed can be scrolled and selected. Incoming messages remain buffered
(up to 500); resume (▷) shows the current data and follows new messages.
All controls have hover labels.

Both switch states keep the form moving: SW1 selects circulation direction. POT0 controls eddy energy as well as spring tension and LED brightness; DIST0 controls spring spacing.
