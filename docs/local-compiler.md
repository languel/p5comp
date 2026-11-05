# Optional local compiler helper (advanced)

Students normally select **Browser compiler**. Uno R3, classic Nano (ATmega328P)
and Mega 2560 compile inside the browser; Arduino CLI is not required for that.
The first compile downloads compiler files and caches them on this browser.

Use the optional local helper for extra libraries, custom C helper files, advanced
Arduino preprocessing, or a fallback when browser compilation is unavailable.
The local compiler runs with the permissions of the account that starts it; use
trusted sketches. It listens only on your own machine (127.0.0.1).

## Install once on your computer

1. Install Node.js 22 LTS (or newer supported Node) and Git.
2. Install Arduino CLI from [Arduino's installation guide](https://docs.arduino.cc/arduino-cli/installation/).
   Check that `arduino-cli version` works in a terminal.
3. Open a terminal and run:

```sh
git clone https://github.com/languel/p5comp.git
cd p5comp
npm ci --ignore-scripts
npm run setup:arduino
```

The setup command installs the Arduino AVR core and our pinned Servo, Stepper,
AccelStepper, LiquidCrystal, NeoPixel and Firmata libraries. It requires internet
access and may replace other installed versions of these six libraries. Other
libraries can be added with Arduino CLI or Arduino IDE's Library Manager.

## Start and select it

```sh
cd p5comp
npm start
```

Keep that terminal open. Visit **http://127.0.0.1:3001/**. In Settings, change
**Compiler → Local helper**. The default compiler endpoint on this local page is
`/api/compile`, served by the same app. Compile/run or compile/upload as usual.
Physical uploading still uses your browser's Web Serial permission.

For development, `npm run dev` starts the editor at http://127.0.0.1:5173/ and
the helper at http://127.0.0.1:3001/. The dev editor proxies `/api/compile`.

The hosted GitHub Pages editor can also be configured to contact a running local
helper: select **Local helper** and enter
`http://127.0.0.1:3001/api/compile` as its Compiler URL. The helper allows the
`https://languel.github.io` origin. Your browser may require local-network access
permission or block the connection; using the helper's own local page avoids
this hosted-to-local connection. Custom hosted origins need a corresponding CORS
configuration in the helper; this is not an internet-facing compilation service.

## Troubleshooting

- **Helper unreachable:** start the terminal command again; confirm
  http://127.0.0.1:3001/api/health returns `{"ok":true}`. Check the Compiler URL.
- **arduino-cli not found:** fix your terminal PATH, or set `ARDUINO_CLI` to its
  executable path before `npm start` / `npm run dev`.
- **Board/core missing:** rerun `npm run setup:arduino`.
- **Library missing:** install it with `arduino-cli lib install "Library Name"`;
  confirm that the library supports the selected AVR board.
- **Compiler returned HTML:** the URL is pointing to a web page, not the helper's
  `/api/compile` endpoint. Use the endpoint above.
- **Upload fails:** use a USB data cable, select the correct board and port, and
  close other serial monitors. Compilation and USB upload are separate steps.
- **No helper desired:** switch back to **Browser compiler**. It never requires
  this terminal or an Arduino CLI installation.

To stop the helper, press Ctrl+C in its terminal. To update the checkout, save
work and use `git pull`, then `npm ci --ignore-scripts` and restart it.
