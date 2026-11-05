# Handoff: browser compiler, motor lessons and Settings typography

State: November 5, 2026. Branch: `main`. Live app:
https://languel.github.io/p5comp/.

## Shipped commits

| Commit | Change |
| --- | --- |
| `85dcd61` | Common motor libraries, servo/stepper/DC/gear lessons, twelve-servo garden with Poliplan attachments, resilient JSON loading, editor shortcuts |
| `97eaa77` | SG90 Analog and MG90S catalog profiles with specs and manufacturer references |
| `442c17d` | Browser AVR GCC compiler for Uno, classic Nano and Mega; optional local helper; Mega upload route |
| `21c4591` | Text selectors inherit Settings typography; dropdown menus stay inside the inspector |

These commits were pushed to `origin/main`; their Pages workflows succeeded.
This handoff describes the implementation through `21c4591`.

## Student path

Open the hosted app, load or edit a sketch, and keep **Browser compiler** selected.
No Arduino CLI, Node.js or local server is required. The first edited compile
downloads pinned, hash-verified WASM tools and static board/library inputs; the
browser caches them when available. Compilation happens in a Worker without
sending source to a compiler service. WebGPU is not needed.

Targets: Uno R3, classic Nano ATmega328P and Mega 2560. Bundled libraries: Servo
1.3.0, Stepper 1.1.3, AccelStepper 1.64.0, LiquidCrystal 1.0.7, Adafruit NeoPixel
1.15.5 and Firmata 2.5.9, plus AVR core Wire, SPI, EEPROM and SoftwareSerial.
Compilation support does not imply a simulator model for every peripheral.

Main/additional `.ino`, `.h`, `.hpp` and `.cpp` files are supported. Custom `.c`
files, extra libraries and advanced preprocessing use the optional local helper.
Its setup guide is embedded in circuit Settings and linked from the code editor.
An explicitly saved compiler URL preserves local mode; new projects default to
the browser. A failed browser build does not silently fall back to the helper.

## Validation completed

- 209 unit tests passed for the browser compiler release. Subsequent typography
  commit passed the complete CI workflow, including tests and actual WASM checks.
- Actual WASM compilation and AVR8js execution passed for the seven motor lessons
  and NeoPixel chain on Uno, Nano and Mega. Twelve garden servo channels emitted
  pulses; DC/gear and stepper examples produced simulated motion.
- LiquidCrystal text worked on Uno/Mega. StandardFirmata, all bundled library
  headers, and C++ helper files compiled. Invalid C++ produced source diagnostics.
- Mega checks exercised A15, GPIO 22/53, PWM timers and all four UARTs.
- Production assets served under `/p5comp/` compiled edited Uno and Mega source
  in a real browser while the local compile endpoint was disabled. Invalid code
  displayed its correct line and did not overwrite the previous valid artifact.
- Settings and the code editor showed Browser compiler by default. Local helper
  instructions rendered. Light/dark browser checks confirmed 12px compiler text,
  menu containment, and switching between local/browser modes.
- Build, compiler archive/hash/source checks, all 34 catalog demos, and the
  packaged Poliplan bundle passed. Published compiler manifest and typography CSS
  were reachable after successful Pages deployments.

These are compilation, simulation and browser checks. Physical Uno/Mega USB
flashing and physical motor/attachment behavior have **not** been validated in
this work. No USB Arduino was detected during the compiler implementation.

## Next hardware check

Use the blink/Serial sketch and steps in
[browser compilation](browser-compilation.md#test-with-a-real-uno-or-mega).
Test Uno and Mega separately in desktop Chrome/Edge on the hosted site: choose
the board, grant its port, compile/upload, observe LED blinking, and receive the
9600-baud startup line after reset. Record board model, browser, upload result
and observed output. The circuit uses its diagram's board; the code editor uses
its Board selector. Uno uses STK500v1; Mega uses the shared STK500v2 uploader.
Mega completion does not claim independent flash readback verification.

For a physical servo bank, provide an adequately sized external regulated supply
with shared ground. The garden models an ideal rail and visual attachments, not
motor current, loads, collisions or constrained linkages. Servo.h supports 12
channels on Uno/Nano and 48 on Mega, but the app's 40-part project limit prevents
a complete 48-servo scene. The current garden has twelve servos and 39 parts.

## Maintenance map

- `shared/compile/{client,worker,engine,sketch}.js`: backend selection, Worker
  lifecycle, verified input caching, AVR compile/link/HEX and sketch preprocessing.
- `public/compiler/avr/`: pinned manifest, common headers, separate board
  archives, source bundle and notices. Runtime GNU WASM tools come from the pinned
  upstream CDN URLs, not the repository's static bundles.
- `scripts/build-browser-compiler-assets.mjs`: maintainer-only native rebuild;
  requires the exact toolchain/libraries and `AVR_WASM_PACKAGE`.
- `scripts/verify-browser-compiler.mjs`: actual WASM builds and firmware assertions.
- `sim/main.js`, `ide/main.js`: compilation, cached artifacts and upload flows.
- `sim/GlyphSelect.js`, `sim/workbench.css`: text/glyph sizing and Settings menus.
- `.github/workflows/pages.yml`: tests, production build, WASM checks, asset/demo
  checks and Pages deployment.

Reproduce with `npm ci --ignore-scripts`, `npm test`, and
`PAGES_BASE=/p5comp/ npm run build`. Run `npm run verify:compiler-assets`,
`npm run verify:examples` and `npm run verify:drawing` after building. For actual
WASM validation, serve the app and run `npm run verify:browser-compiler`, or set
`COMPILER_ASSET_URL` to its served `compiler/avr/` directory. Avoid regenerating
compiler archives concurrently with a production build.

See [local helper setup](local-compiler.md), [library coverage](library-support.md),
[motor lessons](motors-and-libraries.md), [servo garden](servo-garden.md) and
[interface conventions](interface-icons.md) for user instructions and limits.
