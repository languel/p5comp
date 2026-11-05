# Browser AVR compiler inputs

Generated for Uno R3 / classic Nano (ATmega328P) and Mega 2560 (ATmega2560).
The exact versions and SHA-256 hashes are in manifest.json. sources.zip contains
the Arduino core/variants and library source used for the generated archives.
The common.zip includes readable GCC/avr-libc headers with their source notices.
The board bundles contain compiled archives, startup objects and linker scripts.

- Arduino AVR core 1.8.8 and Wire, SPI, EEPROM, SoftwareSerial: ArduinoCore-avr,
  primarily LGPL-2.1-or-later. https://github.com/arduino/ArduinoCore-avr
- Servo 1.3.0: LGPL-2.1-or-later. https://github.com/arduino-libraries/Servo
- Stepper 1.1.3: LGPL-2.1-or-later. https://github.com/arduino-libraries/Stepper
- AccelStepper 1.64.0: GPL-3.0 (upstream also offers commercial licensing).
  https://www.airspayce.com/mikem/arduino/AccelStepper/
- LiquidCrystal 1.0.7: LGPL-2.1-or-later. https://github.com/arduino-libraries/LiquidCrystal
- Adafruit NeoPixel 1.15.5: LGPL-3.0-or-later. https://github.com/adafruit/Adafruit_NeoPixel
- Firmata 2.5.9: LGPL-2.1-or-later. https://github.com/firmata/arduino
- avr-libc 2.0.0 startup code, libraries and headers retain their BSD-style and
  per-file licenses: https://github.com/avrdudes/avr-libc
- GCC 7.3.0 libgcc: GPL-3.0 with GCC Runtime Library Exception. Arduino's AVR
  toolchain source/build patches: https://github.com/arduino/toolchain-avr
  GNU GCC source: https://ftp.gnu.org/gnu/gcc/gcc-7.3.0/

The WebAssembly compiler tools themselves are downloaded at runtime from pinned
@horang-corp/avr-gcc-wasm@0.2.0 URLs on jsDelivr, verified against the manifest's
SHA-256 hashes, and cached in this browser. They are not redistributed in these
static bundles. Their package declares GCC/binutils components GPL-3.0-or-later:
https://github.com/horang-corp/avr-gcc-wasm/blob/main/THIRD_PARTY_NOTICES.md

Toolchain project and distribution:
https://github.com/horang-corp/avr-gcc-wasm
https://www.npmjs.com/package/@horang-corp/avr-gcc-wasm/v/0.2.0

License texts: https://www.gnu.org/licenses/gpl-3.0.html,
https://www.gnu.org/licenses/lgpl-2.1.html,
https://www.gnu.org/licenses/lgpl-3.0.html,
https://www.gnu.org/licenses/gcc-exception-3.1.html.
The original notices and source in sources.zip take precedence for each file.
Generated objects can be rebuilt/replaced using scripts/build-browser-compiler-assets.mjs.
