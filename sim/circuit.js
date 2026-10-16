import {analogTopology} from "./analogTopology.js";
import { isNeoPixel, pixelCount } from "./outputModels.js";
import { isPot, isSensorInput } from "./inputModels.js";
import { boardKind, boardLayout } from "./avrBoards.js";
import { isBreadboard, boardSpec, breadboardPins } from "./breadboard.js";
import { resistance } from "./passiveStates.js";
import { elementByType, elementPins } from "./elements.js";
import { freePoint } from "./partGeometry.js";
export const isAVRBoard = (type) =>
  ["wokwi-arduino-uno", "wokwi-arduino-nano", "wokwi-arduino-mega"].includes(
    type,
  );
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
    ["uno:GND.2", "bb:bn.1", "#000000"],
    ["pot:GND", "bb:1t.a", "#000000"],
    ["pot:SIG", "bb:2t.a", "#997aa6"],
    ["pot:VCC", "bb:3t.a", "#bc7770"],
    ["bb:1t.e", "bb:bn.3", "#000000"],
    ["bb:3t.e", "bb:bp.5", "#bc7770"],
    ["uno:A0", "bb:2t.e", "#997aa6"],
    ["sonar:VCC", "bb:25t.a", "#bc7770"],
    ["sonar:GND", "bb:28t.a", "#000000"],
    ["bb:25t.e", "bb:bp.25", "#bc7770"],
    ["bb:28t.e", "bb:bn.28", "#000000"],
    ["uno:9", "sonar:TRIG", "#bb9b61"],
    ["uno:8", "sonar:ECHO", "#77a3a4"],
    ["b1:1.l", "bb:11t.a", "#7799ac"],
    ["b1:2.l", "bb:12t.a", "#000000"],
    ["uno:2", "bb:11t.e", "#7799ac"],
    ["bb:12t.e", "bb:bn.12", "#000000"],
    ["b2:1.l", "bb:18t.a", "#997aa6"],
    ["b2:2.l", "bb:19t.a", "#000000"],
    ["uno:3", "bb:18t.e", "#997aa6"],
    ["bb:19t.e", "bb:bn.19", "#000000"],
  ].map((c) => [...c, []]);
  return { version: 1, editor: "physical-p5", parts, connections };
}

export function validateDiagram(d) {
  if (!d || !Array.isArray(d.parts) || !Array.isArray(d.connections))
    throw new Error("Project needs parts and connections arrays.");
  if (d.parts.length > 40 || d.connections.length > 300)
    throw new Error("Classroom project limit: 40 parts / 300 wires.");
  for (const field of ["attachments", "detachedContacts"]) {
    if (d[field] != null && (!Array.isArray(d[field]) || d[field].some(pair => !Array.isArray(pair) || pair.length !== 2 || pair.some(id => typeof id !== "string")))) throw Error("Invalid terminal attachments.");
  }
  if (d.groups != null && (!Array.isArray(d.groups) || d.groups.some(g => !Array.isArray(g) || g.some(id => typeof id !== "string")))) throw Error("Invalid component groups.");
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
    if (p.attrs?.maxResistance != null && isPot(p.type))
      resistance(p.attrs.maxResistance);
    if (isNeoPixel(p.type)) {
      for (const prop of ["pixels", "rows", "cols"])
        if (
          p.attrs?.[prop] != null &&
          (!Number.isInteger(Number(p.attrs[prop])) ||
            Number(p.attrs[prop]) < 1 ||
            Number(p.attrs[prop]) > 256)
        )
          throw new Error(`${p.id}: ${prop} must be an integer from 1 to 256.`);
      if (
        p.type === "wokwi-neopixel-matrix" &&
        Number(p.attrs?.rows || 8) * Number(p.attrs?.cols || 8) > 256
      )
        throw new Error(`${p.id}: maximum 256 pixels per matrix.`);
    }
    if (
      p.type === "wokwi-membrane-keypad" &&
      p.attrs?.columns != null &&
      ![3, 4].includes(Number(p.attrs.columns))
    )
      throw new Error(`${p.id}: keypad columns must be 3 or 4.`);
    for (const prop of [
      "threshold",
      "gamma",
      "rl10",
      "delayTime",
      "inhibitTime",
      "stepsPerRevolution",
    ])
      if (
        p.attrs?.[prop] != null &&
        (!Number.isFinite(Number(p.attrs[prop])) ||
          Number(p.attrs[prop]) < 0 ||
          (["gamma", "rl10", "stepsPerRevolution"].includes(prop) &&
            Number(p.attrs[prop]) === 0))
      )
        throw new Error(`${p.id}: ${prop} needs a valid positive value.`);

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
      if (p.type === "wokwi-arduino-mega") {
        for (const n of [4, 5]) join(`${p.id}:GND.1`, `${p.id}:GND.${n}`);
        for (const n of [1, 2]) join(`${p.id}:5V`, `${p.id}:5V.${n}`);
        join(`${p.id}:SDA`, `${p.id}:20`);
        join(`${p.id}:SCL`, `${p.id}:21`);
      }
      join(`${p.id}:GND.1`, `${p.id}:GND.2`);
      join(`${p.id}:GND.1`, `${p.id}:GND.3`);
      if (p.type === "wokwi-arduino-nano")
        for (const pin of ["5V", "11", "12", "13"])
          join(`${p.id}:${pin}`, `${p.id}:${pin}.2`);
    }
    if (p.type === "wokwi-a4988") join(`${p.id}:GND.1`, `${p.id}:GND.2`);
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
  for (const [a, b] of [...contacts, ...(diagram.attachments || [])]) if (known.has(a) && known.has(b)) join(a, b);
  for (const [a, b] of diagram.connections) {
    if ((!known.has(a) && !freePoint(a)) || (!known.has(b) && !freePoint(b)))
      throw new Error(`Unknown terminal: ${!known.has(a) ? a : b}`);
    if (known.has(a) && known.has(b)) join(a, b);
  }
  const uno = diagram.parts.filter((p) => isAVRBoard(p.type));
  if (uno.length > 1)
    throw new Error("Use at most one simulated Arduino Uno, Nano or Mega.");
  const kind = uno.length ? boardKind(uno[0].type) : "uno",
    layout = boardLayout(kind);
  const terminal = (n) =>
    n < layout.analogBase ? String(n) : "A" + (n - layout.analogBase);
  const id = uno[0]?.id || "__analog",
    equal = (a, b) => find(a) === find(b),
    warnings = [];
  for (const p of diagram.parts) {
    if (p.type === "p5comp-ground") join(`${p.id}:GND`, `${id}:GND.1`);
    if (p.type === "p5comp-vcc") join(`${p.id}:VCC`, `${id}:5V`);
  }
  if (equal(`${id}:5V`, `${id}:GND.1`))
    throw new Error("5V is shorted to GND. Remove the short before running.");
  const target = (endpoint) => {
    for (let n = 0; n < layout.analogBase + layout.analogCount; n++) {
      const name = terminal(n);
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
    if (isPot(p.type)) {
      const pin = target(`${p.id}:SIG`),
        power = powered(p);
      pots.push({ id: p.id, pin, powered: power });
      if (!power || pin === null || pin < layout.analogBase)
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
      "Multiple sensor drivers share an Arduino input. Separate those signal nets.",
    );
  const rails = [];
  for (let n = 0; n < layout.digitalCount; n++) {
    const endpoint = `${id}:${terminal(n)}`;
    if (equal(endpoint, `${id}:5V`) || equal(endpoint, `${id}:GND.1`)) {
      rails.push({ pin: n, high: equal(endpoint, `${id}:5V`) });
      warnings.push(
        `${endpoint} is tied to a supply rail; do not configure it as an opposing output.`,
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
      ...Array.from({ length: uno.length ? layout.digitalCount : 0 }, (_, pin) => ({
        net: net(`${id}:${pin < layout.analogBase ? pin : "A" + (pin - 14)}`),
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
    if (["wokwi-resistor", "p5comp-photoresistor"].includes(p.type))
      passive.resistors.push({
        id: p.id,
        a: net(p.id + ":1"),
        b: net(p.id + ":2"),
        ohms:
          p.type === "p5comp-photoresistor"
            ? 10000
            : resistance(p.attrs?.value),
        photo:
          p.type === "p5comp-photoresistor"
            ? {
                lux: Number(p.attrs?.value ?? 100),
                rl10: Number(p.attrs?.rl10 ?? 50),
                gamma: Number(p.attrs?.gamma ?? 0.7),
              }
            : undefined,
      });
    if (p.type === "wokwi-led")
      passive.leds.push({
        id: p.id,
        a: net(p.id + ":A"),
        c: net(p.id + ":C"),
        forwardVoltage: Number(p.attrs?.forwardVoltage) || 2,
      });
  }
  const switchedContacts = passive.switches;
  const sensors = [];
  for (const p of diagram.parts) {
    const add = (a, b, extra) =>
      switchedContacts.push({
        id: p.id,
        a: net(p.id + ":" + a),
        b: net(p.id + ":" + b),
        ...extra,
      });
    if (p.type === "wokwi-dip-switch-8")
      for (let i = 0; i < 8; i++)
        add(i + 1 + "a", i + 1 + "b", {
          kind: "dip",
          index: i,
          initial: p.attrs?.values || Array(8).fill(0),
        });
    if (p.type === "p5comp-toggle-switch")
      add("1", "2", { kind: "toggle", initial: Number(p.attrs?.value || 0) });
    if (p.type === "wokwi-slide-switch") {
      add("2", "1", {
        kind: "slide",
        position: 0,
        initial: Number(p.attrs?.value || 0),
      });
      add("2", "3", {
        kind: "slide",
        position: 1,
        initial: Number(p.attrs?.value || 0),
      });
    }
    if (p.type === "wokwi-membrane-keypad")
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < Number(p.attrs?.columns || 4); col++)
          add("R" + (row + 1), "C" + (col + 1), {
            kind: "keypad",
            key: row + "," + col,
          });
    if (p.type === "wokwi-relay-module") {
      add("COM", "NO", { kind: "relay", energized: true });
      add("COM", "NC", { kind: "relay", energized: false });
    }
    if (isSensorInput(p.type))
      sensors.push({
        id: p.id,
        type: p.type,
        attrs: p.attrs || {},
        powered: powered(p),
        analogNet: net(p.id + ":" + (p.type.includes("photo") ? "AO" : "AOUT")),
        analog: target(p.id + ":" + (p.type.includes("photo") ? "AO" : "AOUT")),
        digitalNet: net(
          p.id +
            ":" +
            (p.type.includes("photo")
              ? "DO"
              : p.type.includes("pir")
                ? "OUT"
                : "DOUT"),
        ),
      });
  }
  const digital = {
    high: net(id + ":5V"),
    ground: net(id + ":GND.1"),
    pinNets: Array.from({ length: layout.digitalCount }, (_, n) =>
      net(id + ":" + terminal(n)),
    ),
    contacts: switchedContacts,
  };
  const peripherals = [];
  for (const p of diagram.parts) {
    if (
      ["wokwi-rgb-led", "wokwi-7segment", "wokwi-led-bar-graph"].includes(
        p.type,
      )
    ) {
      const rgb = p.type === "wokwi-rgb-led";
      const bar = p.type === "wokwi-led-bar-graph";
      const channels = bar
        ? Array.from({ length: 10 }, (_, i) => "A" + (i + 1))
        : rgb
          ? ["R", "G", "B"]
          : ["A", "B", "C", "D", "E", "F", "G", "DP"];
      const common = rgb ? "COM" : "COM.1";
      if (!rgb && !bar && Number(p.attrs?.digits || 1) !== 1)
        warnings.push(
          p.id + ": only single-digit seven-segment simulation is supported.",
        );

      const anode = p.attrs?.common === "anode";
      const ids = channels.map((pin, i) => {
        const channel = `${p.id}__${i}`;
        passive.leds.push({
          id: channel,
          a: net(p.id + ":" + (anode ? common : pin)),
          c: net(p.id + ":" + (bar ? "C" + (i + 1) : anode ? pin : common)),
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
        "wokwi-relay-module",
        "wokwi-a4988",
        "wokwi-stepper-motor",
        "wokwi-biaxial-stepper",
        "wokwi-neopixel",
        "wokwi-led-ring",
        "wokwi-led-strip",
        "wokwi-neopixel-matrix",
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
        powered: isNeoPixel(p.type)
          ? equal(
              p.id + ":" + (p.type === "wokwi-neopixel" ? "VDD" : "VCC"),
              id + ":5V",
            ) &&
            equal(
              p.id + ":" + (p.type === "wokwi-neopixel" ? "VSS" : "GND"),
              id + ":GND.1",
            )
          : p.type === "wokwi-relay-module"
            ? powered(p)
            : p.type === "wokwi-a4988"
              ? equal(p.id + ":VDD", id + ":5V") &&
                equal(p.id + ":GND.2", id + ":GND.1")
              : p.type === "wokwi-servo"
                ? equal(p.id + ":V+", id + ":5V") &&
                  equal(p.id + ":GND", id + ":GND.1")
                : p.type.includes("lcd")
                  ? equal(p.id + ":VDD", id + ":5V") &&
                    equal(p.id + ":VSS", id + ":GND.1")
                  : equal(p.id + ":2", id + ":GND.1"),
      });
    }
  }
  // Driver/motor links and NeoPixel DOUT chains retain explicit wiring semantics.
  for (const p of peripherals) {
    if (p.type === "wokwi-relay-module")
      p.connectedIN =
        target(p.id + ":IN") !== null ||
        equal(p.id + ":IN", id + ":5V") ||
        equal(p.id + ":IN", id + ":GND.1");
    if (
      p.type === "wokwi-a4988" &&
      target(p.id + ":SLEEP") === null &&
      !equal(p.id + ":SLEEP", id + ":GND.1")
    )
      p.levels.SLEEP = true;
    if (p.type === "wokwi-stepper-motor") {
      const driver = peripherals.find(
        (d) =>
          d.type === "wokwi-a4988" &&
          [
            ["A+", "2A"],
            ["A-", "2B"],
            ["B+", "1A"],
            ["B-", "1B"],
          ].every(([a, b]) => equal(p.id + ":" + a, d.id + ":" + b)),
      );
      if (driver) p.driver = driver.id;
    }
    if (isNeoPixel(p.type)) {
      const original = diagram.parts.find((x) => x.id === p.id);
      p.count = pixelCount(original);
      p.offset = 0;
      let current = p.id,
        seen = new Set([current]);
      while (p.pins.DIN === null) {
        const upstream = peripherals.find(
          (d) => isNeoPixel(d.type) && equal(current + ":DIN", d.id + ":DOUT"),
        );
        if (!upstream || seen.has(upstream.id)) break;
        seen.add(upstream.id);
        p.offset += pixelCount(diagram.parts.find((x) => x.id === upstream.id));
        p.powered = p.powered && upstream.powered;
        current = upstream.id;
        p.pins.DIN = target(current + ":DIN");
      }
    }
  }
  const instruments = diagram.parts
    .filter((p) =>
      ["p5comp-multimeter", "p5comp-signal-probe", "p5comp-plotter", "p5comp-oscilloscope"].includes(p.type),
    )
    .map((p) => ({
      id: p.id,
      type: p.type,
      mode: p.attrs?.mode || "voltage",
      channels: ["p5comp-plotter", "p5comp-oscilloscope"].includes(p.type) ? Array.from({length: p.type === "p5comp-plotter" ? 8 : 2}, (_, i) => ({ name: "CH" + (i + 1), net: net(p.id + ":CH" + (i + 1)) })) : undefined,
      a: net(p.id + (p.type === "p5comp-signal-probe" ? ":SIG" : ":V+")),
      b: net(p.id + (p.type !== "p5comp-multimeter" ? ":GND" : ":COM")),
      pin: target(p.id + ":SIG"),
    }));
  for (const m of instruments)
    if (m.mode === "current" && m.type === "p5comp-multimeter")
      passive.resistors.push({ id: m.id, a: m.a, b: m.b, ohms: 0.1 });
  for (const p of pots) {
    const part = diagram.parts.find((q) => q.id === p.id);
    p.nets = [net(p.id + ":GND"), net(p.id + ":SIG"), net(p.id + ":VCC")];
    p.resistance = resistance(part.attrs?.maxResistance ?? 10000);
  }
  return {
    board: uno.length ? kind : null,
    analog: analogTopology(diagram,net,net(`${id}:GND.1`)),
    instruments,
    pots,
    sonars,
    buttons,
    rails,
    warnings,
    passive,
    peripherals,
    sensors,
    digital,
  };
}
