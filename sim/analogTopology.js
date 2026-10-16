import { quantity } from "./analogMath.js";
export function analogTopology(diagram, net, ground) {
  const devices = [];
  for (const p of diagram.parts) {
    const a = p.attrs || {},
      n = (pin) => net(p.id + ":" + pin),
      base = { id: p.id, attrs: a, type: p.type };
    if (p.type === "p5comp-capacitor")
      devices.push({
        ...base,
        kind: "capacitor",
        a: n("1"),
        b: n("2"),
        value: quantity(a.value || "100nF", "F"),
      });
    if (p.type === "p5comp-inductor")
      devices.push({
        ...base,
        kind: "inductor",
        a: n("1"),
        b: n("2"),
        value: quantity(a.value || "10mH", "H"),
      });
    if (p.type === "p5comp-diode")
      devices.push({
        ...base,
        kind: "diode",
        a: n("A"),
        b: n("K"),
        drop: Math.max(0.1, Number(a.forwardVoltage) || 0.65),
      });
    if (/p5comp-(npn|pnp)/.test(p.type))
      devices.push({
        ...base,
        kind: "bjt",
        b: n("B"),
        c: n("C"),
        e: n("E"),
        sign: p.type.endsWith("pnp") ? -1 : 1,
        beta: Math.max(1, Math.min(500, Number(a.beta) || 100)),
      });
    if (["p5comp-opamp", "p5comp-comparator"].includes(p.type))
      devices.push({
        ...base,
        kind: "opamp",
        plus: n("IN+"),
        minus: n("IN-"),
        a: n("OUT"),
        b: n("V-"),
        high: n("V+"),
        gain: Math.max(1, Math.min(100000, Number(a.gain) || 10000)),
        comparator: p.type === "p5comp-comparator",
      });
    if (p.type === "p5comp-555")
      devices.push({
        ...base,
        kind: "555",
        pins: Object.fromEntries(
          ["GND", "TRIG", "OUT", "RESET", "CTRL", "THRESH", "DISCH", "VCC"].map(
            (k) => [k, n(k)],
          ),
        ),
      });
    if (p.type === "p5comp-battery")
      devices.push({
        ...base,
        kind: "supply",
        a: n("+"),
        b: n("-"),
        voltage: Math.max(0, Math.min(24, Number(a.voltage) || 0)),
      });
    if (p.type === "p5comp-signal-generator")
      devices.push({ ...base, kind: "generator", a: n("OUT"), b: n("GND") });
    if (p.type === "p5comp-speaker")
      devices.push({
        ...base,
        kind: "speaker",
        a: n("+"),
        b: n("-"),
        ohms: Math.max(1, Number(a.resistance) || 8),
      });
  }
  return {
    devices,
    ground,
    active:
      devices.length > 0 ||
      diagram.parts.some((p) => p.type === "p5comp-oscilloscope"),
  };
}
