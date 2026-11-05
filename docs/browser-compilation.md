# Browser compilation

Students can open the website, edit Arduino code, compile, simulate, and upload
from a Web Serial browser without installing Arduino CLI or starting a server.
**Browser compiler** is the default in the circuit workbench and Code editor.
Supported targets are **Uno R3, classic Nano (ATmega328P), and Mega 2560**.
The local compiler remains an optional advanced setting, not a student prerequisite.

## What happens

The first edited build downloads a pinned AVR GCC/binutils WASM toolchain from
jsDelivr and this app's static Arduino core/library inputs. It verifies their
SHA-256 hashes and caches the inputs in this browser using Cache Storage, when
available. Compilation runs in a dedicated Web Worker; source is not sent to a
compiler service. The worker is terminated after a build, error, cancellation or
timeout, releasing its compiler memory. WebGPU is not required.

Unchanged examples can still use their cached HEX immediately. Editing a sketch
triggers compilation; successful HEX is saved with the matching project source.
Console output identifies the compiler and reports flash/static RAM usage. Leave
additional RAM for the stack/heap. Invalid code and missing includes report errors
in the normal console. Failed builds never upload a previous HEX as new firmware.

The initial download requires network access. Cached inputs can be reused without
the tool CDN; clearing site data or using a fresh browser requires another download.
Cache Storage restrictions may prevent persistent caching, in which case inputs
are fetched again on a later build. Full offline app availability is separate.
Use HTTPS or localhost (also required for Web Serial / integrity verification).

## Boards and libraries

Each target has its own board variant, startup object, device archive, memory map
and compiled core/library archives. Mega uses AVR6 / ATmega2560, SRAM starting at
0x200, 8 KB SRAM and a 253,952-byte application flash budget (bootloader reserved).
Uno uses 32,256 bytes; classic Nano uses 30,720 bytes. The packaged AVR core is
1.8.8 and the compiler ABI/toolchain is GCC 7.3.0 Arduino7.

Included: Servo 1.3.0, Stepper 1.1.3, AccelStepper 1.64.0, LiquidCrystal 1.0.7,
Adafruit NeoPixel 1.15.5, Firmata 2.5.9, plus Wire, SPI, EEPROM and SoftwareSerial.
These headers/libraries compile; attached device simulation still depends on the
[simulation models](simulation-and-lessons.md). No extra libraries are downloaded
based on sketch includes. More libraries can use the optional local helper.

Browser projects support the main `.ino`, additional `.ino` files, `.h`/`.hpp`
headers and `.cpp` translation units. Ordinary top-level Arduino function
prototypes are generated with the C++ syntax parser. Templates, namespaces,
advanced types and member definitions should provide explicit declarations.
Pure `.c` helper translation units currently use the local helper: the shipped
browser frontend is C++, while the core/library C objects are precompiled.

## Test with a real Uno or Mega

No motors need to be attached for this check. Use the Code section (`/ide`),
choose the board in its **BOARD** menu, keep **Compiler → Browser compiler**,
connect the board with a USB data cable, and grant the port when prompted.

```cpp
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("p5comp browser build is running");
}
void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
}
```

Click **Compile + Upload**. Verify the board's built-in LED blinks and Serial at
9600 baud receives the message after reset. Test Uno and Mega separately, selecting
the correct board before each upload. The circuit workbench also uploads: its
board comes from the diagram. Uno uses STK500v1; Mega uses the shared STK500v2
uploader. Close other serial monitors before connecting. Compilation/simulation
checks are automated; physical upload remains a separate device validation.

## Optional local compiler

Settings → Compiler → **Local helper (advanced)** selects the existing Arduino
CLI service. The setup guide is embedded in circuit Settings and also available
at [local compiler setup](local-compiler.md). A saved project with an explicitly
configured compiler URL retains that local choice; new projects use the browser.
No failed browser build silently sends student source to another compiler.

## Maintainer rebuild and validation

`public/compiler/avr/manifest.json` records tool URLs, hashes, board inputs and
library versions. The generated ZIPs are tracked so static Pages builds need no
Arduino CLI. `npm run verify:compiler-assets` checks all hashes and packaged files.
`npm run verify:browser-compiler` runs the actual WASM toolchain and checks compiled
firmware in AVR8js; serve the app first (`npm run dev`), or set
`COMPILER_ASSET_URL` to a served `compiler/avr/` directory.

To regenerate core/library archives, install the exact AVR core/toolchain and
libraries listed in the manifest. The native compiler builds only these static
inputs; student source is still compiled in WASM at runtime. Obtain the pinned
`@horang-corp/avr-gcc-wasm@0.2.0` package with `npm pack`, extract it, and set
`AVR_WASM_PACKAGE` to that directory. Then run `npm run build:compiler-assets`.
The script reads Arduino CLI's configured data/user paths, enforces the six
library versions, and emits board archives, headers, metadata and source ZIP.

Notices and sources are in `compiler/avr/NOTICE.md` and `sources.zip` in the
static deployment. Runtime compiler modules are fetched from the upstream npm
package, not redistributed by this site. [Toolchain upstream](https://github.com/horang-corp/avr-gcc-wasm).
