import { networkResistors, resistiveVoltages } from "./resistiveNetwork.js";
import { contactClosed } from "./inputModels.js";
export function instrumentStates(
  topology,
  pins,
  controls,
  passive,
  signals = [],
  analogVoltages = null,
) {
  const network = topology.passive;
  const resistors = [
    ...networkResistors(network, controls),
    ...(network.switches || [])
      .filter((s) => contactClosed(s, controls))
      .map((s) => ({ ...s, ohms: 0.001 })),
  ];
  for (const p of topology.pots || []) {
    if (p.powered && p.nets) {
      const ratio = Math.max(
        0.000001,
        Math.min(0.999999, Number(controls[p.id] ?? 512) / 1023),
      );
      resistors.push(
        { a: p.nets[0], b: p.nets[1], ohms: p.resistance * ratio },
        { a: p.nets[1], b: p.nets[2], ohms: p.resistance * (1 - ratio) },
      );
    }
  }
  const model = { ...network, resistors },
    volts = analogVoltages || resistiveVoltages(model, pins, controls),
    result = {};
  for (const m of topology.instruments || []) {
    const a = volts.get(m.a),
      b = volts.get(m.b),
      voltage = a != null && b != null ? a - b : null;
    if (m.type === "p5comp-plotter") {
      result[m.id] = { channels: m.channels.map(c => ({name: c.name, value: b != null && volts.has(c.net) ? volts.get(c.net) - b : null})) };
    } else if (m.type === "p5comp-signal-probe") {
      const signal = signals[m.pin];
      result[m.id] = {
        voltage,
        reading: voltage == null ? "FLOAT" : `${voltage.toFixed(2)} V`,
        frequency: signal?.frequency || 0,
        duty: signal?.duty ?? null,
        samples: signal?.samples || [],
        warning:
          voltage == null ? "Connect SIG and GND to a driven circuit." : "",
      };
    } else if (m.mode === "current") {
      const current = passive[m.id]?.current;
      result[m.id] = {
        current: current ?? null,
        reading:
          current == null
            ? "—"
            : current > 0.2
              ? "OL"
              : (current * 1000).toFixed(2),
        units: "mA",
        warning:
          current > 0.2
            ? "Overload · connect the current meter in series, not across a supply."
            : "Series connection · modeled DC/LED paths",
      };
    } else if (m.mode === "resistance") {
      const connected = new Set([m.a]);
      let change = true;
      while (change) {
        change = false;
        for (const r of resistors)
          if (connected.has(r.a) !== connected.has(r.b)) {
            connected.add(r.a);
            connected.add(r.b);
            change = true;
          }
      }
      const powered = (network.sources || []).some(
        (s) =>
          connected.has(s.net) && Math.abs(s.volts ?? pins[s.pin] ?? 0) > 0.01,
      );
      let ohms = null;
      if (!powered && connected.has(m.b) && m.a !== m.b) {
        const v = resistiveVoltages(
          {
            sources: [
              { net: m.a, volts: 1 },
              { net: m.b, volts: 0 },
            ],
            resistors,
          },
          [],
          controls,
        );
        const current = resistors.reduce(
          (sum, r) =>
            sum +
            (r.a === m.a
              ? (1 - v.get(r.b)) / r.ohms
              : r.b === m.a
                ? (1 - v.get(r.a)) / r.ohms
                : 0),
          0,
        );
        if (current > 0) ohms = 1 / current;
      }
      if (m.a === m.b) ohms = 0;
      result[m.id] = {
        resistance: ohms,
        reading: powered
          ? "LIVE"
          : ohms == null
            ? "OL"
            : ohms >= 1000
              ? (ohms / 1000).toFixed(2)
              : ohms.toFixed(1),
        units: ohms >= 1000 ? "kΩ" : "Ω",
        warning: powered
          ? "Disconnect power before measuring resistance."
          : "Resistor networks only · no semiconductor resistance model",
      };
    } else
      result[m.id] = {
        voltage,
        reading: voltage == null ? "OL" : voltage.toFixed(3),
        units: "V",
        warning:
          voltage == null
            ? "Floating/open terminals."
            : "DC / average PWM voltage",
      };
  }
  return result;
}
