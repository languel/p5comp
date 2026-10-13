# Circuit lab dependencies

- AVR8js 0.21.1, copyright Uri Shaked: MIT. Local notice: `public/licenses/avr8js-MIT.txt`. Upstream: https://github.com/wokwi/avr8js.
- Wokwi Elements 1.9.2, copyright Uri Shaked: MIT. Local notice: `public/licenses/wokwi-elements-MIT.txt`. Upstream: https://github.com/wokwi/wokwi-elements. These are visual components; circuit connectivity and sensor models are implemented in this project.
- p5.webserial 1.1.2, copyright Gottfried Haider: LGPL-2.1-or-later, as declared by its npm package. The unmodified, separately loaded source is `public/libraries/p5.webserial.js` (served at `/libraries/p5.webserial.js`). It can be replaced without rebuilding the host application. License text: `public/licenses/LGPL-2.1.txt`. Upstream: https://github.com/gohai/p5.webserial.
- p5.js 1.11.10: see `public/licenses/p5-LGPL.txt`; source comes from the pinned npm dependency. Upstream: https://github.com/processing/p5.js.

The generated classroom firmware links the Arduino AVR core installed by
Arduino CLI (`arduino:avr` 1.8.7 in this checkpoint). The readable classroom
source is `sim/classroom.ino`; rebuild it with `arduino-cli compile --fqbn
arduino:avr:uno` and replace `public/sim/classroom.hex`. The core and its bundled
libraries retain their respective upstream licenses at
https://github.com/arduino/ArduinoCore-avr.

The Uno uploader is adapted from this user's sibling WebFirmata project:
`/Users/liuboto/dev/webfirmata/src/lib/uploader.js`. WebFirmata remains a separate
application. Existing dependencies retain their npm-package notices.

The StandardFirmata example in `public/examples/StandardFirmata.ino` is from
Firmata/Arduino, under LGPL 2.1 or later. Copyright notices and the licensing
header are retained in that file; LGPL text is in `public/licenses/LGPL-2.1.txt`.
jsPDF is MIT-licensed and provides PDF document export.

- Prettier 3.9.10: MIT. Browser JavaScript/HTML/CSS formatting; notice in `public/licenses/prettier-MIT.txt`.
- @wasm-fmt/clang-format 23.1.1: package declares MIT. Browser C++ formatting; package notice in `public/licenses/clang-format-wrapper-MIT.txt`. Its bundled clang-format derives from LLVM.
