import { readFile, writeFile, readdir } from "node:fs/promises";
import * as elements from "@wokwi/elements";
// ImageData is only needed to initialize the SSD1306's blank display in Node.
globalThis.ImageData ??= class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};
const root = new URL(
  "../node_modules/@wokwi/elements/dist/esm/",
  import.meta.url,
);
const names = {
  "7segment": "7-segment display",
  "arduino-uno": "Arduino Uno R3",
  "arduino-mega": "Arduino Mega",
  "arduino-nano": "Arduino Nano",
  "hc-sr04": "HC-SR04 distance sensor",
  ssd1306: "SSD1306 OLED display",
  ili9341: "ILI9341 TFT display",
  lcd1602: "LCD 16×2",
  lcd2004: "LCD 20×4",
  "ks2e-m-dc5": "Relay (KS2E-M-DC5)",
  "ky-040": "Rotary encoder (KY-040)",
  "ntc-temperature-sensor": "NTC temperature sensor",
  "rgb-led": "RGB LED",
  "ir-remote": "IR remote",
  "ir-receiver": "IR receiver",
  "esp32-devkit-v1": "ESP32 DevKit V1",
  "nano-rp2040-connect": "Arduino Nano RP2040 Connect",
  dht22: "DHT22 temperature / humidity",
  ds1307: "DS1307 real-time clock",
  mpu6050: "MPU6050 accelerometer",
  hx711: "HX711 load-cell amplifier",
  neopixel: "NeoPixel RGB LED",
};
const modeled = new Set([
  "wokwi-arduino-uno",
  "wokwi-potentiometer",
  "wokwi-hc-sr04",
  "wokwi-pushbutton",
  "wokwi-breadboard",
]);
const documented = new Set(
  "biaxial-stepper buzzer ks2e-m-dc5 servo stepper-motor ds1307 ir-receiver microsd-card resistor arduino-mega arduino-nano arduino-uno franzininho 7segment ili9341 lcd1602 lcd2004 led led-bar-graph led-ring neopixel rgb-led dip-switch-8 ir-remote membrane-keypad potentiometer pushbutton pushbutton-6mm ky-040 slide-potentiometer slide-switch analog-joystick dht22 gas-sensor hc-sr04 hx711 mpu6050 ntc-temperature-sensor photoresistor-sensor pir-motion-sensor".split(
    " ",
  ),
);
const entries = [];
for (const file of (await readdir(root)).filter((f) =>
  f.endsWith("-element.js"),
)) {
  const source = await readFile(new URL(file, root), "utf8"),
    type = source.match(/customElement\('([^']+)'\)/)?.[1],
    cls = source.match(/export \{ (\w+) \}/)?.[1];
  if (!type || !cls) continue;
  const Constructor =
    elements[cls] ||
    Object.values(elements).find(
      (e) => typeof e === "function" && e.name === cls,
    );
  if (!Constructor) throw new Error(`Missing export ${cls}`);
  const instance = new Constructor(),
    short = type.replace(/^wokwi-/, ""),
    name =
      names[short] ||
      short
        .split("-")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
  const group = /arduino|esp32|franzininho|rp2040/.test(short)
    ? "Boards"
    : /lcd|segment|ssd|ili|led|neopixel/.test(short)
      ? "Displays"
      : /servo|stepper|buzzer|dc5/.test(short)
        ? "Actuators"
        : /sensor|sr04|dht|mpu|hx711|joystick|pir|temperature/.test(short)
          ? "Sensors"
          : /switch|button|potentiometer|keypad|ky-040|dialer|remote/.test(
                short,
              )
            ? "Inputs"
            : "Basic";
  const item = {
    type,
    name,
    group,
    modeled: modeled.has(type),
    docs:
      type === "wokwi-ssd1306"
        ? "board-ssd1306"
        : documented.has(short)
          ? type
          : null,
    pins: instance.pinInfo?.map((p) => p.name) || [],
    source: file,
  };
  if (short === "lcd1602" || short === "lcd2004") {
    instance.pins = "i2c";
    item.variants = [
      {
        name: "I2C",
        attrs: { pins: "i2c" },
        pins: instance.pinInfo.map((p) => p.name),
      },
    ];
  }
  entries.push(item);
}
entries.push({
  type: "wokwi-breadboard",
  name: "Breadboard",
  group: "Basic",
  modeled: true,
  docs: null,
  pins: [],
  source: null,
});
entries.sort(
  (a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
);
await writeFile(
  new URL("../sim/elements.json", import.meta.url),
  JSON.stringify(entries, null, 2) + "\n",
);
console.log(`${entries.length} registered element types`);
