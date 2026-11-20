# p5comp developer setup

[Back to p5comp](../README.md) · [Workspace reference](workspace-reference.md)

Run these commands from the repository root.

## Requirements

- Hosted use: a modern browser; the browser compiler supports Uno R3, classic Nano, and Mega 2560 without an installation.
- Local development: Node.js 22 or newer. Arduino CLI is optional, for the advanced local helper.
- Desktop Chrome or Edge on `localhost` or HTTPS (for Web Serial)
- Arduino Uno R3 or Mega 2560 (only for physical-device work)

## Run locally

```sh
npm install
npm run setup:arduino # optional: only if using the advanced local compiler
npm run dev
```

Open `http://127.0.0.1:5173/sim/`, `/ide`, or `/firmata/`.
The development server proxies compilation requests to the local API on port 3001. Set `ARDUINO_CLI` to the Arduino CLI executable path if it is not on
`PATH`.

For a production-style local server:

```sh
npm start
```

This builds the static app and serves it, including `/api/compile`, on port 3001. Set `PORT` to change the server port.

## Development checks

```sh
npm test
npm run build
```

Tests execute the bundled Arduino HEX through AVR8js and verify breadboard
nets, ADC, switches, sonar, LED commands, native streams and the unmodified
p5.webserial library, full catalog coverage, LCD variants and connected-dot
color selection. Uno HelloLED upload and reconnection have been hardware-tested;
Firmata discovery, Mega upload and circuit-section upload still require device
validation. Dependency notices and replacement
library source are in `THIRD-PARTY-NOTICES.md` and `public/licenses/`.

## Deployment and class examples

GitHub Actions runs tests/builds and deploys `main` to GitHub Pages. The static
site runs the emulator, p5 and an AVR GCC WebAssembly compiler without a build
server. Edited Uno, Nano and Mega sketches compile in a browser Worker by default.
The optional local helper accepts validated source files and extra libraries.
Physical upload still requires a Web Serial browser and a connected supported
board; the local helper, when used, is bound to localhost by default.

To publish a class example, place its project JSON in `public/examples/` and add
`{"name":"Class demo", "project":"examples/class-demo.json"}` to
`public/examples/index.json`. The Examples menu loads this manifest on both the
local app and GitHub Pages. Keep image references embedded in that project JSON.

## Further developer documentation

- [Browser compilation](browser-compilation.md)
- [Optional local compiler](local-compiler.md)
- [Agent API and process recording](agents.md)
- [Compiler and motor handoff](HANDOFF-browser-compiler-and-motors.md)
