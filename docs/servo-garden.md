# Servo garden · twelve moving petals

Open **File → Examples → Motors → Servo garden · twelve moving petals**, then
Run Arduino. Twelve servos sit on a circle with arcs, pens and teal Poliplan
leaves attached to their shafts. The board sends twelve independent, real
Servo.h pulse streams on D2–D13. A0 sets speed; the A1 switch selects a traveling
wave or alternating petals. Firmware and the artwork ship in the static app.

## How many servos?

The standard [Servo library](https://github.com/arduino-libraries/Servo/blob/master/docs/readme.md)
allows **12 on an Uno or classic Nano**, **48 on a Mega 2560**. It generates
pulses with timers; signal wires do not need analogWrite PWM pins. The installed
AVR implementation uses 12 channels per 16-bit timer (one timer on Uno/Nano,
four on Mega). Servo use reserves those timers and can affect analogWrite on
pins associated with them. Twelve long pulse widths can also extend the nominal
20 ms refresh frame; our pattern balances angles around the circle.

This example uses all twelve Uno channels. The app's current project limit is
**40 circuit parts**, independently of the library capacity: this lesson has
39 (Uno, twelve servos, twelve local 5V and GND symbol pairs, pot and switch).
A complete 48-servo Mega scene would exceed that canvas limit. The stock diagram
models a shared ideal 5V rail, not a supply or current budget.

Physical servos need a separate regulated supply sized for their voltage and
combined current, including stall current, with ground shared with the Arduino.
Do not power this bank from USB or the Uno regulator. Neither this motor bank
nor its decorative attachments have been tested on physical hardware.

## Attach an arm, arc or pen

Select a servo, open **Properties**, and choose **Shaft attachment**:

- **Arm**: a straight rigid arm.
- **Arc**: a curved arm whose two ends rotate with the shaft.
- **Pen**: a fine arm with a tip; its world-space trail is enabled by default.
- **None**: remove the attachment. Circuit Undo restores it.

**Length / artwork width**, **Mount angle**, and **Attachment color** adjust
appearance. **Pen trail** also works on arcs or mounted artwork: the pen point
is one attachment length along the local arm axis. **Clear pen trails** removes
all transient trails. Starting/resetting the simulated Arduino or opening a
project clears them too. Pause preserves the trace and shaft position.

Lengths are canvas units, not physical millimeters. The attachment follows the
native shaft pivot, plus component position, rotation and flips. Moving the part
moves its attachment. Fit includes the full attachment sweep. Circuit SVG/PNG
exports include the current attachments and trails. Project JSON/ZIP saves the
attachment settings and artwork, but not transient trail samples (capped at
1200 per pen). These are visual single-axis attachments: no loads, collisions,
linkage constraints or ink/pressure mechanics are simulated.

## Mount your Poliplan artwork

1. Select the target servo in the circuit.
2. Open **Draw** or enable the circuit's drawing layer. Draw an arm, leaf, bow,
   pen or another shape. Use Poliplan Select to select the desired marks.
3. Right-click the drawing and choose **Mount selection on selected servo**.
   Alternatively use **Mount Poliplan selection…** in the servo's Properties.
4. Return to Circuit and run. Adjust the artwork width, mount angle and pivot.

A selected drawing is exported through Poliplan's own SVG exporter and stored
as a project asset. Its **left-center** initially sits on the shaft. Pivot X/Y
are fractions of the artwork's exported rectangle: X=0 is left, X=1 right;
Y=0 is top, Y=1 bottom. X=0.5/Y=0.5 mounts the center. The artwork's original
aspect ratio is preserved. SVG transparency stays transparent.

This mounts a **copy**, leaving the source drawing and its Poliplan undo history
intact. Edit the source and mount it again to refresh an attachment. Remove the
copy using Shaft attachment → None; the original drawing and asset remain.
Missing artwork displays a readable placeholder instead of breaking the circuit.

The example's teal leaf was made with Poliplan's plane tool and exported from
its selection. Its editable source is in Draw near (1900, 1400), at the
bottom-right of the board. The standalone SVG and Arduino source are in
`public/examples/servo-garden/`. Use the sketch in Arduino IDE after installing
Servo.h. `npm run verify:arduino` checks compilation for Uno, Nano and Mega.

## SG90 and MG90S catalog profiles

Search the component picker for **SG90** or **MG90S**, or choose **Servo model**
in a selected servo's Properties. These are positional hardware profiles of the
same `wokwi-servo` symbol and pulse decoder; their standard GND / V+ / PWM pins
and Poliplan attachments remain compatible. The garden alternates six of each.
Properties and the part's `?` reference show the selected model's specs and link.
The example also includes a linked comparison card on the canvas.

| Manufacturer's figures at 4.8 V | SG90 Analog | MG90S |
| --- | --- | --- |
| Mass | 9 g | 13.4 g |
| Body (L × W × H) | 23 × 12.2 × 29 mm | 22.8 × 12.2 × 28.5 mm |
| Gears | POM / plastic | Metal (manufacturer identifies 6061-T6 aluminum) |
| Stall torque | 1.8 kgf·cm | 1.8 kgf·cm |
| Speed per 60° | 0.12 s | 0.10 s |

Sources checked November 5, 2026: [TowerPro SG90 Analog](https://towerpro.com.tw/product/sg90-analog/)
and [TowerPro MG90S](https://towerpro.com.tw/product/mg90s-3/). Values use the
manufacturer's specification lists and their common 4.8 V condition. SG90's
analog page also has a configure table with a different speed; we use its
explicit operating-speed specification (0.12 s). The SG90 Digital product is a
different version. The MG90S page gives additional figures at higher voltages
but lists 4.8 V as operating voltage, so this comparison does not infer a supply
range from those figures. Verify the actual unit's ratings and travel.

Published specs are reference data, not extra physics in the simulator. Both
profiles share the existing ideal 0–180° angle mapping and diagram footprint;
size, gear material, slew speed, current, stall torque and physical travel limits
are not modeled. Selecting a profile does not imply a continuous-rotation servo.
