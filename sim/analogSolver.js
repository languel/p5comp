import { sensorReading } from "./inputModels.js";
import { solveLinear, waveform } from "./analogMath.js";
import { networkResistors } from "./resistiveNetwork.js";
import { contactClosed } from "./inputModels.js";
// Backward-Euler companion models. Piecewise-linear diode / BJT teaching models.
export class AnalogSolver {
  constructor(topology) {
    this.topology = topology;
    this.time = 0;
    this.volts = new Map();
    this.memory = new Map();
    this.traces = [];
    this.warning = "";
  }
  step(dt, pins = [], controls = {}) {
    const { passive: network, analog } = this.topology,
      ground = analog.ground,
      devices = analog.devices;
    const resistors = [
      ...networkResistors(network, controls),
      ...(network.switches || [])
        .filter((s) => contactClosed(s, controls))
        .map((s) => ({ ...s, ohms: 0.01 })),
      ...devices.filter((d) => d.kind === "speaker"),
    ];
    for (const p of this.topology.pots || [])
      if (p.powered) {
        const ratio = Math.max(
          0.00001,
          Math.min(0.99999, Number(controls[p.id] ?? 512) / 1023),
        );
        resistors.push(
          { a: p.nets[0], b: p.nets[1], ohms: p.resistance * ratio },
          { a: p.nets[1], b: p.nets[2], ohms: p.resistance * (1 - ratio) },
        );
      }
    const sources = (network.sources || [])
      .filter(
        (s) => s.net !== ground && (s.volts != null || pins[s.pin] != null),
      )
      .map((s) => ({ a: s.net, b: ground, voltage: s.volts ?? pins[s.pin] }));
    for (const s of this.topology.sensors || [])
      if (s.powered && s.analogNet)
        sources.push({
          a: s.analogNet,
          b: ground,
          voltage: sensorReading(s, controls[s.id]).volts,
        });
    for (const d of devices) {
      if (d.kind === "opamp") sources.push({ ...d, voltage: 0 });
      if (d.kind === "supply" || d.kind === "generator")
        sources.push({
          ...d,
          voltage:
            d.kind === "generator"
              ? waveform(d.attrs, this.time + dt)
              : d.voltage,
        });
      if (d.kind === "555") {
        const v = (p) => this.volts.get(d.pins[p]) || 0,
          supply = v("VCC") - v("GND");
        let high = this.memory.get(d.id)?.high ?? false;
        const ctrl = this.volts.has(d.pins.CTRL)
          ? v("CTRL") - v("GND")
          : (supply * 2) / 3;
        if (v("RESET") - v("GND") < 0.7 || supply < 1) high = false;
        else if (v("THRESH") - v("GND") > ctrl) high = false;
        else if (v("TRIG") - v("GND") < ctrl / 2) high = true;
        this.memory.set(d.id, { high });
        sources.push({
          a: d.pins.OUT,
          b: d.pins.GND,
          voltage: high ? Math.max(0, supply - 0.15) : 0,
        });
        resistors.push(
          { a: d.pins.CTRL, b: d.pins.VCC, ohms: 5000 },
          { a: d.pins.CTRL, b: d.pins.GND, ohms: 10000 },
        );
        if (!high) resistors.push({ a: d.pins.DISCH, b: d.pins.GND, ohms: 10 });
      }
    }
    const diodeDevices = [
      ...devices.filter((d) => d.kind === "diode"),
      ...(network.leds || []).map((d) => ({
        ...d,
        b: d.c,
        drop: d.forwardVoltage,
      })),
    ];
    const nodes = new Set([ground]);
    for (const r of [...resistors, ...sources, ...diodeDevices]) {
      nodes.add(r.a);
      nodes.add(r.b);
    }
    for (const d of devices) {
      if (d.a) {
        nodes.add(d.a);
        nodes.add(d.b);
      }
      if (d.kind === "opamp")
        [d.plus, d.minus, d.high].forEach((n) => nodes.add(n));
      if (d.kind === "bjt") [d.b, d.c, d.e].forEach((n) => nodes.add(n));
      if (d.kind === "555") Object.values(d.pins).forEach((n) => nodes.add(n));
    }
    nodes.delete(ground);
    const names = [...nodes],
      index = new Map(names.map((n, i) => [n, i])),
      count = names.length;
    if (count > 64)
      throw Error("Classroom analog solver supports up to 64 nodes.");
    let guess = new Map(this.volts),
      solution;
    for (let iter = 0; iter < 40; iter++) {
      const size = count + sources.length,
        m = Array.from({ length: size }, () => Array(size + 1).fill(0));
      const stamp = (a, b, g, current = 0) => {
        const i = index.get(a),
          j = index.get(b);
        if (i != null) {
          m[i][i] += g;
          if (j != null) m[i][j] -= g;
          m[i][size] -= current;
        }
        if (j != null) {
          m[j][j] += g;
          if (i != null) m[j][i] -= g;
          m[j][size] += current;
        }
      };
      for (let i = 0; i < count; i++) m[i][i] += 1e-10;
      for (const r of resistors) stamp(r.a, r.b, 1 / Math.max(0.001, r.ohms));
      for (const d of devices) {
        const state = this.memory.get(d.id) || {};
        if (d.kind === "capacitor")
          stamp(d.a, d.b, d.value / dt, (-d.value / dt) * (state.voltage || 0));
        if (d.kind === "inductor")
          stamp(d.a, d.b, dt / d.value, state.current || 0);
        if (d.kind === "bjt") {
          const vbe = d.sign * ((guess.get(d.b) || 0) - (guess.get(d.e) || 0)),
            vce = d.sign * ((guess.get(d.c) || 0) - (guess.get(d.e) || 0));
          const ib = Math.max(0, (vbe - 0.65) / 100),
            on = vbe > 0.65;
          stamp(
            d.sign > 0 ? d.b : d.e,
            d.sign > 0 ? d.e : d.b,
            on ? 0.01 : 1e-9,
            on ? -0.0065 : 0,
          );
          if (on && vce > 0) {
            const ic = Math.min(d.beta * ib, Math.max(0, vce - 0.15) / 5);
            stamp(d.c, d.e, 1e-8, d.sign * ic);
          }
        }
      }
      for (const d of diodeDevices) {
        const v = (guess.get(d.a) || 0) - (guess.get(d.b) || 0),
          on = v > d.drop;
        stamp(d.a, d.b, on ? 0.2 : 1e-9, on ? -0.2 * d.drop : 0);
      }
      sources.forEach((s, k) => {
        const i = index.get(s.a),
          j = index.get(s.b),
          row = count + k;
        if (s.a === s.b) {
          if (Math.abs(s.voltage) > 0.001)
            throw Error("Voltage source shorted to itself.");
          m[row][row] = 1;
          return;
        }
        if (i != null) {
          m[i][row] += 1;
          m[row][i] += 1;
        }
        if (j != null) {
          m[j][row] -= 1;
          m[row][j] -= 1;
        }
        m[row][size] = s.voltage;
        if (s.kind === "opamp") {
          const lo = guess.get(s.b) || 0,
            hi = guess.get(s.high) || 0,
            span = Math.max(0.001, hi - lo),
            diff = (guess.get(s.plus) || 0) - (guess.get(s.minus) || 0);
          if (s.comparator) {
            m[row][size] = hi > lo ? (diff >= 0 ? span : 0) : 0;
          } else {
            const z = Math.max(-20, Math.min(20, (s.gain * diff) / span)),
              th = Math.tanh(z),
              f = span * (0.5 + 0.5 * th),
              derivative = 0.5 * s.gain * (1 - th * th);
            const ip = index.get(s.plus),
              im = index.get(s.minus);
            if (ip != null) m[row][ip] -= derivative;
            if (im != null) m[row][im] += derivative;
            m[row][size] = f - derivative * diff;
          }
        }
      });
      // Collapse identical ideal sources, but reject conflicting values.
      const seen = new Map();
      sources.forEach((s, k) => {
        const key = s.a + "|" + s.b;
        if (seen.has(key)) {
          const prior = seen.get(key);
          if (Math.abs(prior.voltage - s.voltage) > 0.001)
            throw Error("Conflicting voltage sources.");
          const row = count + k;
          for (let r = 0; r < size; r++) {
            m[r][row] = 0;
            m[row][r] = 0;
          }
          m[row][row] = 1;
          m[row][size] = 0;
        } else seen.set(key, s);
      });
      solution = solveLinear(m);
      let change = 0;
      for (let i = 0; i < count; i++) {
        const prev = guess.get(names[i]) || 0;
        change = Math.max(change, Math.abs(solution[i] - prev));
        guess.set(
          names[i],
          iter > 0 && change > 0.1
            ? prev * 0.5 + solution[i] * 0.5
            : solution[i],
        );
      }
      guess.set(ground, 0);
      if (change < 1e-5) break;
      if (iter === 39)
        this.warning =
          "Approximate nonlinear solution; reduce frequency or simplify the circuit.";
    }
    this.volts = guess;
    this.time += dt;
    for (const d of devices) {
      const voltage = (guess.get(d.a) || 0) - (guess.get(d.b) || 0),
        old = this.memory.get(d.id) || {};
      if (d.kind === "capacitor") this.memory.set(d.id, { voltage });
      if (d.kind === "inductor")
        this.memory.set(d.id, {
          current: (old.current || 0) + (dt / d.value) * voltage,
        });
    }
    return guess;
  }
  advance(target, pins = [], controls = {}, signals = []) {
    const frames = [],
      speakers = this.topology.analog.devices.filter(
        (d) => d.kind === "speaker",
      );
    const channels = (this.topology.instruments || []).filter(
      (i) => i.type === "p5comp-oscilloscope",
    );
    let steps = 0;
    while (this.time < target - 1e-10) {
      const dt = Math.min(1 / 12000, target - this.time),
        samplePins = [...pins];
      for (let n = 0; n < signals.length; n++) {
        const s = signals[n];
        if (!s?.frequency || !s.samples.length) continue;
        let value = s.samples[0][1] ? 0 : 5;
        for (const [x, high] of s.samples) {
          if (target - 0.05 + x * 0.05 > this.time + dt) break;
          value = high ? 5 : 0;
        }
        samplePins[n] = value;
      }
      const v = this.step(dt, samplePins, controls);
      const get = (n) => v.get(n) ?? null;
      frames.push({
        time: this.time,
        scope: Object.fromEntries(
          channels.map((c) => [
            c.id,
            c.channels.map((ch) =>
              get(ch.net) == null || get(c.b) == null
                ? null
                : get(ch.net) - get(c.b),
            ),
          ]),
        ),
        audio: speakers.map((s) => (get(s.a) || 0) - (get(s.b) || 0)),
      });
      if (++steps > 12000)
        throw Error(
          "Analog advance exceeds one second; restart the simulation.",
        );
    }
    return frames;
  }
  states() {
    const result = {};
    for (const r of this.topology.passive.resistors) {
      const voltage = (this.volts.get(r.a) || 0) - (this.volts.get(r.b) || 0),
        current = voltage / r.ohms;
      result[r.id] = { voltage, current, power: current * current * r.ohms };
    }
    for (const l of this.topology.passive.leds) {
      const voltage = (this.volts.get(l.a) || 0) - (this.volts.get(l.c) || 0),
        current = Math.max(0, (voltage - l.forwardVoltage) * 0.2);
      result[l.id] = {
        voltage,
        current,
        lit: current > 0.00001,
        brightness: Math.min(1, current / 0.02),
      };
    }
    for (const d of this.topology.analog.devices) {
      const v = (this.volts.get(d.a) || 0) - (this.volts.get(d.b) || 0),
        s = this.memory.get(d.id) || {};
      result[d.id] = { voltage: v, ...s, warning: this.warning };
    }
    return result;
  }
}
