import { isBreadboard, boardSpec, breadboardPins } from "./breadboard.js";
import { resistance } from "./passiveStates.js";
import { elementByType, elementPins } from "./elements.js";
import { freePoint } from "./partGeometry.js";
export const isAVRBoard = (type) =>
  ["wokwi-arduino-uno", "wokwi-arduino-nano"].includes(type);
export const isMomentarySwitch = (type) =>
  ["wokwi-pushbutton", "wokwi-pushbutton-6mm"].includes(type);
export const TYPES = [
  "wokwi-arduino-uno",
  "wokwi-breadboard",
  "wokwi-potentiometer",
  "wokwi-hc-sr04",
  "wokwi-pushbutton",
];

export function classroomCircuit() {
  const parts = [
    { id: "uno", type: TYPES[0], left: 35, top: 220, attrs: {} },
    { id: "bb", type: TYPES[1], left: 390, top: 245, attrs: {} },
    { id: "pot", type: TYPES[2], left: 395, top: 115, attrs: {} },
    { id: "sonar", type: TYPES[3], left: 700, top: 110, attrs: {} },
    {
      id: "b1",
      type: TYPES[4],
      left: 505,
      top: 155,
      attrs: { color: "green" },
    },
    {
      id: "b2",
      type: TYPES[4],
      left: 585,
      top: 155,
      attrs: { color: "green" },
    },
  ];
  const connections = [
    ["uno:5V", "bb:bp.1", "#bc7770"],
    ["uno:GND.2", "bb:bn.1", "#707875"],
    ["pot:GND", "bb:1t.a", "#707875"],
    ["pot:SIG", "bb:2t.a", "#997aa6"],
    ["pot:VCC", "bb:3t.a", "#bc7770"],
    ["bb:1t.e", "bb:bn.3", "#707875"],
    ["bb:3t.e", "bb:bp.5", "#bc7770"],
    ["uno:A0", "bb:2t.e", "#997aa6"],
    ["sonar:VCC", "bb:25t.a", "#bc7770"],
    ["sonar:GND", "bb:28t.a", "#707875"],
    ["bb:25t.e", "bb:bp.25", "#bc7770"],
    ["bb:28t.e", "bb:bn.28", "#707875"],
    ["uno:9", "sonar:TRIG", "#bb9b61"],
    ["uno:8", "sonar:ECHO", "#77a3a4"],
    ["b1:1.l", "bb:11t.a", "#7799ac"],
    ["b1:2.l", "bb:12t.a", "#707875"],
    ["uno:2", "bb:11t.e", "#7799ac"],
    ["bb:12t.e", "bb:bn.12", "#707875"],
    ["b2:1.l", "bb:18t.a", "#997aa6"],
    ["b2:2.l", "bb:19t.a", "#707875"],
    ["uno:3", "bb:18t.e", "#997aa6"],
    ["bb:19t.e", "bb:bn.19", "#707875"],
  ].map((c) => [...c, []]);
  return { version: 1, editor: "physical-p5", parts, connections };
}

export function validateDiagram(d) {
  if (!d || !Array.isArray(d.parts) || !Array.isArray(d.connections))
    throw new Error("Project needs parts and connections arrays.");
  if (d.parts.length > 40 || d.connections.length > 300)
    throw new Error("Classroom project limit: 40 parts / 300 wires.");
  const ids = new Set();
  for (const p of d.parts) {
    if (!/^[a-zA-Z][\w-]{0,30}$/.test(p.id) || ids.has(p.id))
      throw new Error("Part IDs must be unique simple names.");
    ids.add(p.id);
    if (
      p.attrs != null &&
      (typeof p.attrs !== "object" || Array.isArray(p.attrs))
    )
      throw new Error("attrs must be a JSON object.");
    if (
      p.label != null &&
      (typeof p.label !== "string" || p.label.length > 100)
    )
      throw new Error("Label must be text under 100 characters.");
    if (!elementByType.has(p.type))
      throw new Error(`Unsupported part: ${p.type}`);
    if (p.type === "wokwi-resistor") resistance(p.attrs?.value);
    if (
      !Number.isFinite(p.left) ||
      !Number.isFinite(p.top) ||
      Math.abs(p.left) > 1e9 ||
      Math.abs(p.top) > 1e9
    )
      throw new Error("Part positions must be finite canvas coordinates.");
    if (p.rotate != null && (!Number.isFinite(p.rotate) || p.rotate % 45 !== 0))
      throw new Error("Rotation must be in 45 degree increments.");
  }
  for (const c of d.connections) {
    if (
      !Array.isArray(c) ||
      c.length < 2 ||
      typeof c[0] !== "string" ||
      typeof c[1] !== "string"
    )
      throw new Error("Invalid connection.");
    for (const endpoint of c.slice(0, 2))
      if (!freePoint(endpoint) && !ids.has(endpoint.split(":")[0]))
        throw new Error(`Unknown part in ${endpoint}`);
  }
  return d;
}

export function partPins(p) {
  if (p.type === TYPES[0])
    return [
      "5V",
      "GND.1",
      "GND.2",
      "GND.3",
      ...Array.from({ length: 14 }, (_, i) => String(i)),
      ...Array.from({ length: 6 }, (_, i) => "A" + i),
    ];
  if (isBreadboard(p.type)) return breadboardPins(p).map((p) => p.name);
  if (p.type === TYPES[2]) return ["GND", "SIG", "VCC"];
  if (p.type === TYPES[3]) return ["VCC", "TRIG", "ECHO", "GND"];
  return elementPins(p);
}

export function resolveCircuit(diagram, contacts = []) {
  validateDiagram(diagram);
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const join = (a, b) => parent.set(find(a), find(b));
  const known = new Set();
  for (const p of diagram.parts) {
    for (const n of partPins(p)) known.add(`${p.id}:${n}`);
    if (isAVRBoard(p.type)) {
      join(`${p.id}:GND.1`, `${p.id}:GND.2`);
      join(`${p.id}:GND.1`, `${p.id}:GND.3`);
      if (p.type === "wokwi-arduino-nano")
        for (const pin of ["5V", "11", "12", "13"])
          join(`${p.id}:${pin}`, `${p.id}:${pin}.2`);
    }
    if (isBreadboard(p.type))
      for (let n = 1; n <= boardSpec(p).columns; n++) {
        for (const r of ["b", "c", "d", "e"])
          join(`${p.id}:${n}t.a`, `${p.id}:${n}t.${r}`);
        for (const r of ["g", "h", "i", "j"])
          join(`${p.id}:${n}b.f`, `${p.id}:${n}b.${r}`);
        for (const r of boardSpec(p).rails ? ["bp", "bn", "tp", "tn"] : [])
          join(`${p.id}:${r}.1`, `${p.id}:${r}.${n}`);
      }
    if (p.type === "wokwi-7segment") join(`${p.id}:COM.1`, `${p.id}:COM.2`);
    if (isMomentarySwitch(p.type)) {
      join(`${p.id}:1.l`, `${p.id}:1.r`);
      join(`${p.id}:2.l`, `${p.id}:2.r`);
    }
  }
  for (const [a, b] of contacts) if (known.has(a) && known.has(b)) join(a, b);
  for (const [a, b] of diagram.connections) {
    if ((!known.has(a) && !freePoint(a)) || (!known.has(b) && !freePoint(b)))
      throw new Error(`Unknown terminal: ${!known.has(a) ? a : b}`);
    if (known.has(a) && known.has(b)) join(a, b);
  }
  const uno = diagram.parts.filter((p) => isAVRBoard(p.type));
  if (uno.length !== 1)
    throw new Error(
      "Use exactly one simulated Arduino Uno or Nano. Mega and non-AVR boards are not emulated yet.",
    );
  const id = uno[0].id,
    equal = (a, b) => find(a) === find(b),
    warnings = [];
  if (equal(`${id}:5V`, `${id}:GND.1`))
    throw new Error("5V is shorted to GND. Remove the short before running.");
  const target = (endpoint) => {
    for (let n = 0; n < (uno[0].type === "wokwi-arduino-nano" ? 22 : 20); n++) {
      const name = n < 14 ? String(n) : "A" + (n - 14);
      if (equal(endpoint, `${id}:${name}`)) return n;
    }
    return null;
  };
  const powered = (p) =>
    equal(`${p.id}:VCC`, `${id}:5V`) && equal(`${p.id}:GND`, `${id}:GND.1`);
  const pots = [],
    sonars = [],
    buttons = [];
  for (const p of diagram.parts) {
    if (p.type === TYPES[2]) {
      const pin = target(`${p.id}:SIG`),
        power = powered(p);
      pots.push({ id: p.id, pin, powered: power });
      if (!power || pin === null || pin < 14)
        warnings.push(`${p.id}: connect VCC/GND and SIG to an analog input.`);
    }
    if (p.type === TYPES[3]) {
      const trig = target(`${p.id}:TRIG`),
        echo = target(`${p.id}:ECHO`),
        power = powered(p);
      sonars.push({ id: p.id, trig, echo, powered: power });
      if (!power || trig === null || echo === null)
        warnings.push(`${p.id}: check supply, trigger and echo wires.`);
    }
    if (isMomentarySwitch(p.type)) {
      let pin = null,
        high = false;
      for (const [a, b] of [
        ["1.l", "2.l"],
        ["2.l", "1.l"],
      ]) {
        if (equal(`${p.id}:${b}`, `${id}:GND.1`)) {
          pin = target(`${p.id}:${a}`);
          high = false;
        } else if (equal(`${p.id}:${b}`, `${id}:5V`)) {
          pin = target(`${p.id}:${a}`);
          high = true;
        }
      }
      buttons.push({ id: p.id, pin, high });
    }
  }
  const drivers = [
    ...pots.filter((p) => p.powered && p.pin !== null).map((p) => p.pin),
    ...sonars.filter((p) => p.powered && p.echo !== null).map((p) => p.echo),
    ...buttons.filter((p) => p.pin !== null).map((p) => p.pin),
  ];
  if (new Set(drivers).size !== drivers.length)
    throw new Error(
      "Multiple sensor drivers share an Uno input. Separate those signal nets.",
    );
  const rails = [];
  for (let n = 0; n < 20; n++) {
    const terminal = `${id}:${n < 14 ? n : "A" + (n - 14)}`;
    if (equal(terminal, `${id}:5V`) || equal(terminal, `${id}:GND.1`)) {
      rails.push({ pin: n, high: equal(terminal, `${id}:5V`) });
      warnings.push(
        `${terminal} is tied to a supply rail; do not configure it as an opposing output.`,
      );
    }
  }
  const netNames = new Map();
  for (const terminal of [...known].sort()) {
    const root = find(terminal);
    if (!netNames.has(root)) netNames.set(root, terminal);
  }
  const net = (terminal) => netNames.get(find(terminal)) || terminal;
  const passive = {
    sources: [
      { net: net(`${id}:5V`), volts: 5 },
      { net: net(`${id}:GND.1`), volts: 0 },
      ...Array.from({ length: 20 }, (_, pin) => ({
        net: net(`${id}:${pin < 14 ? pin : "A" + (pin - 14)}`),
        pin,
      })),
    ],
    resistors: [],
    leds: [],
    switches: [],
    groups: [],
  };
  for (const p of diagram.parts) {
    if (isMomentarySwitch(p.type))
      passive.switches.push({
        id: p.id,
        a: net(p.id + ":1.l"),
        b: net(p.id + ":2.l"),
      });
    if (p.type === "wokwi-resistor")
      passive.resistors.push({
        id: p.id,
        a: net(p.id + ":1"),
        b: net(p.id + ":2"),
        ohms: resistance(p.attrs?.value),
      });
    if (p.type === "wokwi-led")
      passive.leds.push({
        id: p.id,
        a: net(p.id + ":A"),
        c: net(p.id + ":C"),
        forwardVoltage: Number(p.attrs?.forwardVoltage) || 2,
      });
  }
  const peripherals = [];
  for (const p of diagram.parts) {
    if (["wokwi-rgb-led", "wokwi-7segment"].includes(p.type)) {
      const rgb = p.type === "wokwi-rgb-led";
      const channels = rgb
        ? ["R", "G", "B"]
        : ["A", "B", "C", "D", "E", "F", "G", "DP"];
      const common = rgb ? "COM" : "COM.1";
      if (!rgb && Number(p.attrs?.digits || 1) !== 1)
        warnings.push(
          p.id + ": only single-digit seven-segment simulation is supported.",
        );

      const anode = p.attrs?.common === "anode";
      const ids = channels.map((pin, i) => {
        const channel = `${p.id}__${i}`;
        passive.leds.push({
          id: channel,
          a: net(p.id + ":" + (anode ? common : pin)),
          c: net(p.id + ":" + (anode ? pin : common)),
          forwardVoltage: 2,
        });
        return channel;
      });
      passive.groups.push({
        id: p.id,
        type: rgb ? "rgb" : "segments",
        channels: ids,
      });
    }
    if (
      [
        "wokwi-servo",
        "wokwi-buzzer",
        "wokwi-lcd1602",
        "wokwi-lcd2004",
      ].includes(p.type)
    ) {
      const pin = (name) => target(p.id + ":" + name);
      if (p.type.includes("lcd") && p.attrs?.pins === "i2c")
        warnings.push(
          p.id + ": I2C LCD simulation is not implemented; use parallel pins.",
        );
      peripherals.push({
        id: p.id,
        type: p.type,
        attrs: p.attrs || {},
        pins: Object.fromEntries(partPins(p).map((n) => [n, pin(n)])),
        levels: Object.fromEntries(
          partPins(p).map((n) => [
            n,
            equal(p.id + ":" + n, id + ":5V") ? true : false,
          ]),
        ),
        powered:
          p.type === "wokwi-servo"
            ? equal(p.id + ":V+", id + ":5V") &&
              equal(p.id + ":GND", id + ":GND.1")
            : p.type.includes("lcd")
              ? equal(p.id + ":VDD", id + ":5V") &&
                equal(p.id + ":VSS", id + ":GND.1")
              : equal(p.id + ":2", id + ":GND.1"),
      });
    }
  }
  return {
    board: uno[0].type === "wokwi-arduino-nano" ? "nano" : "uno",
    pots,
    sonars,
    buttons,
    rails,
    warnings,
    passive,
    peripherals,
  };
}
