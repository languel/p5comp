// Actual WASM compiler execution in Node, followed by AVR8js firmware checks.
// The browser UI/worker/cache flow is checked separately in browser QA.
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildInBrowser, verifiedBytes } from "../shared/compile/engine.js";
import { resolveCircuit } from "../sim/circuit.js";
import { UnoRuntime } from "../sim/runtime.js";
import assert from "node:assert/strict";
const base = new URL(
  process.env.COMPILER_ASSET_URL || "http://127.0.0.1:5173/compiler/avr/",
);
const manifest = JSON.parse(
  await readFile(
    new URL("../public/compiler/avr/manifest.json", import.meta.url),
  ),
);
const temp = await mkdtemp(path.join(tmpdir(), "p5comp-wasm-verification-"));
const tools = {};
async function loadTool(name) {
  if (tools[name]) return tools[name];
  const tool = manifest.tools[name];
  const [js, wasm] = await Promise.all([
    verifiedBytes(tool.mjs.url, tool.mjs.sha256),
    verifiedBytes(tool.wasm.url, tool.wasm.sha256),
  ]);
  const file = path.join(temp, name + ".mjs");
  await writeFile(file, js);
  return (tools[name] = {
    factory: (await import(pathToFileURL(file).href)).default,
    wasm,
  });
}
const compile = (board, source, files = {}) =>
  buildInBrowser({ board, source, files }, { base, manifest, loadTool });
const megaOnly = process.argv.includes("--mega-only");
const motorSlugs = [
  "servo-sweep",
  "servo-knob",
  "stepper-library",
  "stepper-acceleration",
  "dc-motor-pwm",
  "gear-motor-ratio",
  "servo-garden",
  "neopixel-chain",
];
async function verify() {
  try {
    for (const board of megaOnly ? [] : ["uno", "nano", "mega"]) {
      for (const slug of motorSlugs) {
        const p = JSON.parse(
          await readFile(
            new URL(`../public/examples/${slug}.json`, import.meta.url),
          ),
        );
        const r = await compile(board, p.arduino);
        assert.equal(r.backend, "browser");
        assert.ok(r.stats.flashBytes > 0);
        const boardPart = p.diagram.parts.find((p) =>
          /^wokwi-arduino-/.test(p.type),
        );
        boardPart.type = "wokwi-arduino-" + board;
        let serial = "";
        const runtime = new UnoRuntime(
          r.hex,
          resolveCircuit(p.diagram),
          p.controls,
          (b) => (serial += String.fromCharCode(b)),
        );
        runtime.advance(4e6);
        const states = runtime.snapshot().parts;
        if (slug.startsWith("servo-"))
          for (const part of p.diagram.parts.filter(
            (p) => p.type === "wokwi-servo",
          ))
            assert.ok(
              states[part.id].pulse > 400 && states[part.id].powered,
              `${board}/${slug}/${part.id}: no servo pulses`,
            );
        if (slug.startsWith("stepper-"))
          assert.ok(
            Math.abs(states.motor.angle) > 1,
            `${board}/${slug}: no motion`,
          );
        if (slug === "dc-motor-pwm") assert.ok(states.motor.rpm > 500);
        if (slug === "neopixel-chain")
          assert.ok(
            states.ring.pixels.some((c) => c.r > 0 || c.g > 0 || c.b > 0),
          );
        if (slug === "gear-motor-ratio")
          assert.ok(
            Math.abs(states.motor.rpm / states.geared.rpm - 100) < 0.001,
          );
        console.log(
          `${board}/${slug}: browser compiler + firmware simulation passed (${r.stats.flashBytes} flash / ${r.stats.ramBytes} RAM)`,
        );
      }
    }
    const lcdSource =
      '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12,11,5,4,3,2);void setup(){lcd.begin(16,2);lcd.print("Browser WASM");}void loop(){}';
    for (const board of megaOnly ? [] : ["uno", "mega"]) {
      const r = await compile(board, lcdSource),
        diagram = {
          parts: [
            {
              id: "b",
              type: "wokwi-arduino-" + board,
              left: 0,
              top: 0,
              attrs: {},
            },
            { id: "lcd", type: "wokwi-lcd1602", left: 400, top: 0, attrs: {} },
          ],
          connections: [
            ["b:5V", "lcd:VDD"],
            ["b:GND.1", "lcd:VSS"],
            ["b:GND.1", "lcd:RW"],
            ...[
              ["12", "RS"],
              ["11", "E"],
              ["5", "D4"],
              ["4", "D5"],
              ["3", "D6"],
              ["2", "D7"],
            ].map(([pin, target]) => ["b:" + pin, "lcd:" + target]),
          ],
        };
      const rt = new UnoRuntime(r.hex, resolveCircuit(diagram), {});
      rt.advance(4e6);
      assert.match(
        String.fromCharCode(...rt.snapshot().parts.lcd.characters),
        /Browser WASM/,
      );
      console.log(board + "/LiquidCrystal firmware simulation passed");
    }
    const megaSource = await readFile(
      new URL("../tests/fixtures/mega-registers.ino", import.meta.url),
      "utf8",
    );
    const megaResult = await compile("mega", megaSource),
      megaDiagram = {
        parts: [
          { id: "b", type: "wokwi-arduino-mega", left: 0, top: 0, attrs: {} },
          {
            id: "pot",
            type: "wokwi-potentiometer",
            left: 0,
            top: 0,
            attrs: {},
          },
        ],
        connections: [
          ["b:5V", "pot:VCC"],
          ["b:GND.1", "pot:GND"],
          ["b:A15", "pot:SIG"],
        ],
      };
    let serial = "";
    const rt = new UnoRuntime(
      megaResult.hex,
      resolveCircuit(megaDiagram),
      { pot: 777 },
      (b) => (serial += String.fromCharCode(b)),
    );
    const extra = ["", "", ""];
    rt.uarts
      .slice(1)
      .forEach(
        (u, i) =>
          (u.onByteTransmit = (b) => (extra[i] += String.fromCharCode(b))),
      );
    rt.advance(16e6);
    assert.match(serial, /,777,0/);
    assert.deepEqual(extra, ["UART1\r\n", "UART2\r\n", "UART3\r\n"]);
    for (const pin of [22, 53]) {
      const [port, bit] = rt.pin(pin);
      assert.equal(port.pinState(bit), 1, `Mega GPIO ${pin} is not HIGH`);
    }
    const samples = [new Set(), new Set(), new Set()];
    for (let i = 0; i < 150; i++) {
      rt.advance(1600);
      [5, 6, 46].forEach((pin, k) => {
        const [port, bit] = rt.pin(pin);
        samples[k].add(port.pinState(bit));
      });
    }
    for (const sample of samples) {
      assert.ok(sample.has(0));
      assert.ok(sample.has(1));
    }
    console.log("Mega: A15, timers, high GPIO and all UARTs compiled and ran");
    if (megaOnly) {
      process.exitCode = 0;
      return;
    }
    const firmata = await readFile(
      new URL("../public/examples/StandardFirmata.ino", import.meta.url),
      "utf8",
    );
    for (const board of ["uno", "mega"]) {
      await compile(board, firmata);
      console.log(`${board}/StandardFirmata compiled`);
    }
    const helpers = await compile(
      "uno",
      '#include "Part.h"\nvoid setup(){pinMode(13, OUTPUT);digitalWrite(13,customValue());}void loop(){}',
      {
        "Part.h": "int customValue();",
        "StudentSketch.cpp": '#include "Part.h"\nint customValue(){return 1;}',
      },
    );
    assert.ok(helpers.hex);
    console.log("C++ helper files compiled");
    const common =
      "#include <Servo.h>\n#include <Stepper.h>\n#include <AccelStepper.h>\n#include <LiquidCrystal.h>\n#include <Adafruit_NeoPixel.h>\n#include <Firmata.h>\n#include <Wire.h>\n#include <SPI.h>\n#include <EEPROM.h>\n#include <SoftwareSerial.h>\nvoid setup(){}void loop(){}";
    for (const board of ["uno", "mega"]) {
      await compile(board, common);
      console.log(`${board}/all common headers compiled`);
    }
    let failed = false;
    try {
      await compile(
        "mega",
        "void setup(){ this is invalid C++; }void loop(){}",
      );
    } catch (e) {
      failed = true;
      assert.match(e.message, /error:|not declared/);
    }
    assert.ok(failed);
    process.exitCode = 0;
    console.log("Invalid C++ produces diagnostics");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
await verify();
