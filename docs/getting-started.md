# Getting started · signals to feedback

A 15–20 minute lesson using **HelloLED**, **Four signals**, and **Field / feedback**.
Use the simulator first; no board, wiring or installation is required.

## LED from scratch · timeline lesson

Open **File → Examples → Getting started → LED from scratch · recorded lesson**.
The lesson starts with an empty circuit and blank Arduino/p5 source, adds an Uno,
a 330 Ω resistor and an LED, wires pin 13 → resistor → LED → GND, then writes
both sketches incrementally. Arduino sends `1` and `0`; p5 reads each serial
line and uses it to color a circle. The final run uses the actual browser compiler
and AVR simulator. It does not connect to USB.

Press Play in the bottom timeline, or drag its playhead through the build.
Use **Return to live page** (↩) to return to your editable project. The final project is
available for trying the code yourself. In the **Lesson timeline** bottom tab,
use **HTML ↓** for a self-contained playable lesson or **MP4 ↓** for browser-side
FFmpeg export. The included take also has downloadable HTML and MP4 siblings
under `public/lessons/led-from-scratch.*`. Captions are text; there is no voiceover.

The older three-example process recording below is a separate lesson.

## Play the guided recording

Save your current project first: loading a replay replaces the workspace.
Open **File → Examples → Getting started → Guided lesson · signals to feedback**,
or **Help → Getting started → Load guided replay**. The recording controls open
in Settings. Click **Next step** to advance through actions and explanations.
Pause between steps to explore the circuit and p5 canvas. Reopen the recording
controls in Settings under Agents & process.

**Replay all** demonstrates the sequence; enable **Keep original timing** to
leave short viewing gaps. Step-by-step mode is recommended for teaching. The
edited recording caps idle gaps at four seconds and omits autonomous p5 serial
writes: the live p5 sketch generates its own feedback commands. It is an editable
process recording, not a video; exact animation frames and timing vary.

Export it with **Export recording** for another browser. Import the
`.p5comp-process.json` file using **Import recording**. Loading is manual;
this lesson never requests USB, camera or microphone access.

## 1 · HelloLED: one output, one message

Open HelloLED from Getting started and run. Compare the circuit LED with the
p5 circle: both follow Arduino's output. Watch Serial for newline-delimited
`0` and `1` messages.

Find `pinMode`, `digitalWrite`, `delay`, and `Serial.println` in Arduino.
Find `acceptLine` in p5: the received number changes the drawing. Predict what
will happen if you halve the delays, then edit and run. The browser compiler
handles edited Uno code without a local server.

**Check:** is p5 inventing its own blink, or displaying received Arduino state?

## 2 · Four signals: digital, analog and PWM

Open **Four signals · input and output** from Getting started and run.

| Signal | Try | Observe |
| --- | --- | --- |
| Digital input | Hold and release the button | `INPUT_PULLUP` reads LOW when pressed |
| Digital output | Watch the separate LED | Pressed lights it; released turns it off |
| Analog input | Move the pot from about 150 to 900 | A0 reading changes over 0–1023 |
| PWM output | Watch RGB and dashboard | Pot scales brightness while RGB channels crossfade |

Serial sends six CSV values: button, pot, LED, R, G, B. Match each dashboard
reading to its wire and Arduino code. PWM is rapid on/off switching, not a true
analog voltage.

**Check:** which signals enter Arduino, and which leave it? Predict the result
of a high pot value with the button released, then test it.

## 3 · Field / feedback: a complete loop

Open **Field / feedback · two-way generative signals** from Getting started
(also available under Communications), then run.

1. Move the pot: it changes spring tension in p5 and scales applied RGB brightness.
2. Move sonar from far to about 45 cm: preferred spring spacing becomes tighter.
3. Toggle the switch: circulation reverses while the field keeps moving.
4. Move the Hue slider in the p5 canvas: p5 sends RGB commands back to Arduino.
5. Open **Plots** in p5. Compare target color, applied R/G/B and ACK. D13 indicates
   recently accepted color commands; the pot can make applied output dimmer than
   the requested color.

Trace: **sensor → Arduino reading → serial packet → p5 behavior → RGB command
→ Arduino PWM → reported applied output**. Arduino and p5 both participate.

**Check:** why can changing a p5 slider affect the circuit? Why do target color
and applied color differ? Turn the pot low and test your explanation.

## Make one change

Choose one mapping, predict an outcome, change the code, then run and compare:
blink delay, pot-to-brightness, or distance-to-spring spacing. Keep the serial
protocol unchanged for the first experiment. If code fails, read its filename
and line number in Console and fix it before rerunning.

For real hardware, select the correct board and use a USB data cable in desktop
Chrome/Edge. The Field / feedback physical RGB circuit needs one current-limiting
resistor per color channel. Simulation success is not a physical upload test.
