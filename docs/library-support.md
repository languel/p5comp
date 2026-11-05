# Arduino library support

`npm run setup:arduino` installs the AVR core and the six library versions below
on the machine running the compilation helper. The setup manifest is
`scripts/arduino-libraries.json`. The same six library versions are bundled as static inputs for the browser
compiler, which is the default student path. The optional local helper can use
additional compatible libraries installed on its own machine.

| Installed by setup | Version | Supported in the simulator |
| --- | --- | --- |
| Servo | 1.3.0 | Actual timer pulses → powered servo angles; arms, arcs, pen trails and Poliplan artwork |
| Stepper | 1.1.3 | Bipolar coil sequences through the ideal dual H-bridge |
| AccelStepper | 1.64.0 | A4988 STEP/DIR, enable and microstepping; acceleration comes from the firmware |
| LiquidCrystal | 1.0.7 | Parallel HD44780 4/8-bit text; I2C backpacks and the full command set are not implemented |
| Adafruit NeoPixel | 1.15.5 | WS2812 RGB single/ring/strip/matrix, color order and daisy chains; no RGBW |
| Firmata | 2.5.9 | StandardFirmata with the p5 Firmata adapter at 57600 baud; analog/digital lesson verified in simulation |

The AVR core includes **Wire, SPI, EEPROM and SoftwareSerial**. Their headers
compile, but library availability does not create a model for the attached
hardware. General I2C/SPI displays, SD cards, networking, MIDI, IMUs and arbitrary
third-party peripheral protocols are not currently simulated. SoftwareSerial does
not become the host serial connection; that connection uses the board's hardware
UART. The dedicated EEPROM controller and persistence are not modeled.

The optional local compiler uses normal Arduino CLI library discovery. More libraries can be
installed with `arduino-cli lib install "Library Name"`; compatibility depends
on the selected board and library. `npm run verify:arduino` compiles the six
common headers plus AVR core headers and all seven motor lessons for **Uno,
classic Nano and Mega 2560**. This verifies compilation, not external hardware.

Supported simulation behavior also includes GPIO/ADC, PWM, serial, buttons and
switches, potentiometers, sensor controls, LEDs, passive circuit foundations,
relays, buzzers and the other bounded models in
[simulation and lessons](simulation-and-lessons.md). DC and gear motors use an
ideal H-bridge and analogWrite/digitalWrite; no extra motor library is required.
See [motor libraries](motors-and-libraries.md) and [Servo garden](servo-garden.md).

## Additional libraries on this Mac

The following were detected by `arduino-cli lib list` on November 5, 2026.
They are available to local compilation when board-compatible, but are **not**
part of the reproducible classroom setup or a promise of simulation support:

- Adafruit BusIO, CPFS, GFX Library, InternalFlash, NeoMatrix, NeoPXL8, seesaw
  Library, SPIFlash, ST7735 and ST7789 Library, TinyUSB Library, Zero DMA Library,
  ZeroTimer Library, and SdFat - Adafruit Fork.
- Arduino_DebugUtils, Arduino_ESP32_OTA, ArduinoHttpClient, ArduinoJson.
- FastIMU, FlashStorage, GFX Library for Arduino, lvgl, MIDI Library, OneButton,
  OSC, Qmi8658c, SD, SensorLib, TFT_eSPI, WebSockets.
- A local `Mylibrary` entry has no version metadata; its API/compatibility has not
  been verified. Some libraries have multiple installed copies.

Use `arduino-cli lib list` for the current inventory. Setup deliberately pins
only the six classroom libraries, leaving unrelated local libraries alone.

## Editor shortcuts

With focus inside any shared code editor (Arduino, p5, HTML/CSS, helper source,
JSON/properties or note source):

- **Alt+Z** toggles word wrap; the saved preference updates all code editors.
- **Alt+Shift+F** formats the current source. **Cmd/Ctrl+Shift+F** remains an alias.
- **Cmd/Ctrl+Enter** runs/applies where supported.
- **Cmd/Ctrl+Shift+Enter** compiles/uploads from Arduino where supported.
- **Cmd/Ctrl+Shift + / −** adjusts font size.

Formatting uses clang-format for C++ and Prettier for JS/HTML/CSS/Markdown. It is
undoable; LaTeX source is left unchanged. Outside text editors, **D / Alt+Z**
continues to toggle the circuit drawing layer.

The [browser compiler](browser-compilation.md) runs without Arduino CLI. Use the
[optional local helper instructions](local-compiler.md) for additional libraries or
custom C helper sources. Compilation support and device simulation remain separate.
