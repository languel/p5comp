import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const cli = process.env.ARDUINO_CLI || "arduino-cli";
const run = (args) => execFileSync(cli, args, { stdio: "inherit" });
const libraries = JSON.parse(
  readFileSync(new URL("./arduino-libraries.json", import.meta.url)),
);
run(["core", "update-index"]);
run(["core", "install", "arduino:avr"]);
run(["lib", "update-index"]);
for (const [name, version] of Object.entries(libraries))
  run(["lib", "install", `${name}@${version}`]);
console.log(
  "Arduino AVR core and classroom libraries ready. Wire, SPI, EEPROM and SoftwareSerial come with the AVR core.",
);
