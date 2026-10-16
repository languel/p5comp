import { foundationCatalog } from "./foundationCatalog.js";
import { extraCatalog } from "./extraCatalog.js";
import { isBreadboard } from "./breadboard.js";
import catalog from "./elements.json" with { type: "json" };
catalog.push(...extraCatalog, ...foundationCatalog);
const legacyBoard = catalog.find((e) => e.type === "wokwi-breadboard");
Object.assign(legacyBoard, {
  name: "Breadboard long",
  modelDescription:
    "63 columns · continuous power rails · automatic terminal seating",
  attrs: { size: "full" },
});
catalog.push(
  {
    ...legacyBoard,
    type: "wokwi-breadboard-half",
    name: "Breadboard medium",
    modelDescription:
      "30 columns · continuous power rails · automatic terminal seating",
    attrs: {},
  },
  {
    ...legacyBoard,
    type: "wokwi-breadboard-mini",
    name: "Breadboard mini",
    modelDescription:
      "17 columns · no power rails · automatic terminal seating",
    attrs: {},
  },
);
for (const info of catalog)
  if (
    [
      "wokwi-led",
      "wokwi-resistor",
      "wokwi-pushbutton",
      "wokwi-pushbutton-6mm",
    ].includes(info.type)
  ) {
    info.modeled = true;
    info.modelDescription = info.type.includes("pushbutton")
      ? "Momentary contacts: 1.l/1.r always joined, 2.l/2.r always joined; press joins 1 and 2"
      : "Classroom series LED/resistor model";
  }
for (const info of catalog) {
  const models = {
    "wokwi-arduino-mega":
      "ATmega2560 · 256 KB flash · 8 KB SRAM · 70 GPIO/16 ADC · timers 0–5 and UARTs 0–3",
    "wokwi-dip-switch-8":
      "Eight independent bidirectional contacts · click switches or use simulator",
    "wokwi-membrane-keypad":
      "Scanned 4×3 / 4×4 matrix · multiple keys · no diodes (ghosting possible)",
    "wokwi-slide-potentiometer": "Powered analog slider · 0–1023",
    "wokwi-slide-switch": "SPDT · middle pin 2 selects 1 or 3",
    "wokwi-small-sound-sensor":
      "Deterministic sound-level input · AO/DO threshold · no microphone required",
    "wokwi-big-sound-sensor":
      "Deterministic sound-level input · AO/DO threshold · no microphone required",
    "wokwi-photoresistor-sensor":
      "Lux → LDR divider voltage and digital threshold · rl10/gamma attributes",
    "wokwi-pir-motion-sensor":
      "Motion triggers timed OUT · delay/inhibit/retrigger · emulated time",
    "wokwi-led-bar-graph":
      "Ten independent series LED channels · individual anode/cathode pins",
    "wokwi-neopixel": "WS2812 800 kHz · GRB/RGB order · DIN/DOUT chaining",
    "wokwi-led-ring":
      "WS2812 800 kHz · configurable pixels · DIN/DOUT chaining",
    "wokwi-neopixel-matrix":
      "WS2812 800 kHz · row-major rows×cols · up to 256 pixels",
    "wokwi-stepper-motor":
      "Ideal bipolar full/half steps or A4988 driver · steps and angle · no mechanical load",
    "wokwi-biaxial-stepper":
      "Two independent bipolar coil sequences · inner/outer angle",

    "wokwi-arduino-nano":
      "ATmega328P at 16 MHz · A6/A7 analog inputs · upload not hardware-tested",
    "wokwi-rgb-led":
      "Common cathode by default; attrs.common=anode supported · series-path model",
    "wokwi-7segment":
      "Single digit · common cathode by default; attrs.common=anode supported",
    "wokwi-servo":
      "Powered servo · pulse-width decoding (544–2400 µs) · no mechanical load",
    "wokwi-buzzer":
      "Digital tone activity/frequency visualization · no audio yet",
    "wokwi-lcd1602":
      "HD44780 parallel 4/8-bit text · no I2C backpack or custom characters yet",
    "wokwi-lcd2004":
      "HD44780 parallel 4/8-bit text · no I2C backpack or custom characters yet",
  };
  if (models[info.type]) {
    info.modeled = true;
    info.modelDescription = models[info.type];
  }
}
export const ELEMENTS = catalog;
export const elementByType = new Map(catalog.map((e) => [e.type, e]));
export function elementPins(part) {
  const info = elementByType.get(part.type);
  if (!info) return [];
  const variant = info.variants?.find((v) =>
    Object.entries(v.attrs).every(([k, value]) => part.attrs?.[k] === value),
  );
  return variant?.pins || info.pins;
}
let presets = [];
export function setComponentPresets(definitions = []) {
  if (!Array.isArray(definitions))
    throw new Error("Components must be an array.");
  presets = definitions.map((d) => {
    const base = elementByType.get(d.base);
    if (
      !base ||
      typeof d.name !== "string" ||
      !d.name.trim() ||
      !d.attrs ||
      typeof d.attrs !== "object" ||
      Array.isArray(d.attrs)
    )
      throw new Error(
        "Each component needs a name, valid base type, and attrs object.",
      );
    return {
      ...base,
      name: d.name,
      group: "Custom",
      attrs: { ...base.attrs, ...d.attrs },
    };
  });
}
export function searchElements(query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return [...presets, ...catalog]
    .flatMap((info) => [
      info,
      ...(info.variants || []).map((v) => ({
        ...info,
        name: info.name + " (" + v.name + ")",
        attrs: v.attrs,
        pins: v.pins,
      })),
    ])
    .filter((info) =>
      words.every((w) =>
        `${info.name} ${info.type} ${info.group}`.toLowerCase().includes(w),
      ),
    );
}
export function terminalColors(connections, selectedWire = -1) {
  const colors = new Map();
  connections.forEach((c, i) => {
    for (const id of c.slice(0, 2)) {
      if (id.startsWith("free:")) continue;
      const list = colors.get(id) || [];
      list.push({
        color: /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c[2]) ? c[2] : "#788fa5",
        index: i,
      });
      colors.set(id, list);
    }
  });
  return new Map(
    [...colors].map(([id, list]) => [
      id,
      list.find((c) => c.index === selectedWire)?.color || list.at(-1).color,
    ]),
  );
}
