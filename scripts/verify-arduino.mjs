import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const cli = process.env.ARDUINO_CLI || "arduino-cli";
const root = mkdtempSync(join(tmpdir(), "p5comp-library-check-"));
const common = `#include <Servo.h>
#include <Stepper.h>
#include <AccelStepper.h>
#include <LiquidCrystal.h>
#include <Adafruit_NeoPixel.h>
#include <Firmata.h>
#include <Wire.h>
#include <SPI.h>
#include <EEPROM.h>
#include <SoftwareSerial.h>
void setup() {}
void loop() {}
`;
try {
  const sketches = [
    ["common-libraries", common],
    ...[
      "servo-sweep",
      "servo-knob",
      "stepper-library",
      "stepper-acceleration",
      "dc-motor-pwm",
      "gear-motor-ratio",
      "servo-garden",
    ].map((slug) => [
      slug,
      JSON.parse(
        readFileSync(
          new URL(`../public/examples/${slug}.json`, import.meta.url),
        ),
      ).arduino,
    ]),
  ];
  for (const [name, source] of sketches) {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, `${name}.ino`), source);
    for (const board of ["uno", "nano", "mega"]) {
      try {
        execFileSync(cli, ["compile", "--fqbn", `arduino:avr:${board}`, dir], {
          stdio: "pipe",
          timeout: 120000,
        });
      } catch (error) {
        process.stderr.write(error.stderr || error.message);
        throw Error(
          `${name} failed for ${board}. Run npm run setup:arduino for required libraries.`,
        );
      }
      console.log(`${name}: ${board} compiled`);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
