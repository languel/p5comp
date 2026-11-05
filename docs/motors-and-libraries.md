# Motors and Arduino libraries

Run `npm run setup:arduino` once on the machine running the compilation helper.
It installs the Arduino AVR core plus the explicit library versions in
`scripts/arduino-libraries.json`: Servo, Stepper, AccelStepper, LiquidCrystal,
Adafruit NeoPixel and Firmata. This command may replace other installed versions
of these libraries. Wire, SPI, EEPROM and SoftwareSerial ship with the AVR core.
Set `ARDUINO_CLI` to select a CLI executable. Compilation uses normal Arduino
library discovery, so additional CLI-installed libraries can also be included.
There is no library download during a compile request.

`npm run verify:arduino` compiles the common headers and all seven motor lessons
for Uno, classic Nano and Mega. Compilation support does not imply that every
library's peripheral protocol is simulated; see the simulation support guide.
For example, Wire and SPI compile, but I2C/SPI displays are not implemented.

File → Examples → Motors contains:

| Lesson | Library / behavior |
| --- | --- |
| Servo · Servo.h sweep | Servo.attach/write, automatic back-and-forth movement |
| Servo · potentiometer position | A0 controls angle with Servo.h |
| Stepper · Stepper.h and H-bridge | Four-wire bipolar motor, whole turns and reversal |
| Stepper · AccelStepper acceleration | A4988 STEP/DIR, non-blocking acceleration |
| DC motor · speed and direction | PWM at D5, direction D7/D8, stop before reversal |
| Gear motor · compare shaft speeds | Same PWM/direction, 100:1 output-shaft reduction |
| [Servo garden · twelve moving petals](servo-garden.md) | Twelve Servo.h channels, geometric patterns and Poliplan attachments |

Each lesson includes editable Arduino source, cached compiled Uno firmware for
static/offline simulation, and a standalone `public/examples/<lesson>/sketch.ino`.
The existing Outputs → Stepper A4988 example still demonstrates manual STEP/DIR.
For the library APIs see [Servo](https://github.com/arduino-libraries/Servo),
[Stepper](https://docs.arduino.cc/libraries/stepper/) and
[AccelStepper](https://www.airspayce.com/mikem/arduino/AccelStepper/).

The component picker includes DC motor, DC gear motor and Dual H-bridge motor
driver. Driver VCC and VMOT must connect to the modeled 5V rail, GND to board
GND. ENA gates OUT1/2; IN1/2 set their polarity. ENB gates OUT3/4; IN3/4 set
their polarity. Enables accept real firmware PWM. DC motor +/− terminals must
both be wired. Swapping them reverses rotation. Stepper coils connect A+/A− to
OUT1/2 and B+/B− to OUT3/4. ENA/ENB are held HIGH in the Stepper.h lesson.

DC output angle integrates the actual high/low PWM intervals in emulated CPU
time. RPM is averaged over each simulation report interval, not wall time.
`noLoadRPM` is the ideal full-duty motor speed at 5V (6000 by default).
`gearRatio` divides the gear motor's output-shaft speed (100 by default).
Both attributes are editable in Properties. The model has no inertia, torque,
current, stall, efficiency or arbitrary motor-supply voltage simulation. A disabled
bridge or equal input polarity stops immediately. These are classroom models.

Physical motors require a rated driver, suitable motor power, common ground and
the driver's recommended protection and decoupling. Never attach bare motor coils
to Arduino GPIO. The ideal 5V bridge symbol is not a particular commercial module;
follow your real driver's pinout, supply ratings and current limits. These lessons
have been compiled and simulated; physical motor hardware has not been tested.

## Missing files and HTML responses

Examples and the compiler reject HTML fallback/error pages with a readable
message instead of a JSON parser exception. Missing, empty, malformed and
unreachable example files leave the current project intact. Invalid source-file
fields are checked before opening a project. Missing or empty p5 `index.html`
is restored to the default document. If a fresh session cannot fetch its starter,
the app opens an empty usable workspace and displays a recovery notice. Authored
p5 runtime errors continue to appear in the preview status and Console.

For the complete supported baseline, additional libraries detected locally and
editor shortcuts, see [Arduino library support](library-support.md).
