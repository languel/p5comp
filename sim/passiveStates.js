import { contactClosed } from "./inputModels.js";
export function resistance(value) {
  const match = String(value ?? 1000)
    .trim()
    .match(/^([\d.]+)\s*([kKmM]?)$/);
  const n = match
    ? Number(match[1]) * ({ k: 1000, K: 1000, m: 1e6, M: 1e6 }[match[2]] || 1)
    : NaN;
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(
      "Resistor value must be positive ohms (for example 220 or 1k).",
    );
  return n;
}
// Classroom series-path model: fixed rails/digital outputs, resistors and LEDs.
export function passiveStates(network = {}, pins = [], controls = {}) {
  const sources = new Map(
    (network.sources || [])
      .filter((s) => s.volts != null || pins[s.pin] != null)
      .map((s) => [s.net, { volts: s.volts ?? pins[s.pin] }]),
  );
  const resistors = network.resistors || [],
    adj = new Map();
  const closed = (network.switches || [])
    .filter((s) => contactClosed(s, controls))
    .map((s) => ({ ...s, ohms: 0, switch: true }));
  for (const r of [...resistors, ...closed])
    for (const [a, b] of [
      [r.a, r.b],
      [r.b, r.a],
    ]) {
      const edges = adj.get(a) || [];
      edges.push({ net: b, r });
      adj.set(a, edges);
    }
  const find = (net, exclude) => {
    const pending = [{ net, ohms: 0, path: [] }],
      seen = new Set();
    while (pending.length) {
      pending.sort((a, b) => a.ohms - b.ohms);
      const item = pending.shift();
      if (seen.has(item.net)) continue;
      seen.add(item.net);
      if (sources.has(item.net)) return { ...item, ...sources.get(item.net) };
      for (const edge of adj.get(item.net) || [])
        if (edge.r.id !== exclude)
          pending.push({
            net: edge.net,
            ohms: item.ohms + edge.r.ohms,
            path: edge.r.switch ? item.path : [...item.path, edge.r.id],
          });
    }
    return null;
  };
  const result = {};
  for (const s of network.switches || [])
    if (!s.kind)
      result[s.id] = { pressed: !!controls[s.id], closed: !!controls[s.id] };
  for (const r of resistors) result[r.id] = { current: 0, power: 0 };
  for (const led of network.leds || []) {
    const a = find(led.a),
      c = find(led.c),
      voltage = a && c ? a.volts - c.volts : 0,
      total = (a?.ohms || 0) + (c?.ohms || 0),
      current =
        voltage > led.forwardVoltage
          ? Math.min(0.05, (voltage - led.forwardVoltage) / Math.max(1, total))
          : 0;
    result[led.id] = {
      lit: current > 0,
      brightness: Math.min(1, current / 0.02),
      current,
      voltage,
      warning:
        current > 0 && !total
          ? "Add a series resistor."
          : current > 0.03
            ? "LED current exceeds 30 mA."
            : "",
    };
    for (const id of [...(a?.path || []), ...(c?.path || [])])
      result[id].current += current;
  }
  for (const r of resistors) {
    const a = find(r.a, r.id),
      b = find(r.b, r.id);
    if (!result[r.id].current && a && b)
      result[r.id].current =
        Math.abs(a.volts - b.volts) / (r.ohms + a.ohms + b.ohms);
    result[r.id].power = result[r.id].current ** 2 * r.ohms;
  }
  for (const group of network.groups || []) {
    const channels = group.channels.map((id) => result[id]);
    result[group.id] =
      group.type === "rgb"
        ? {
            ledRed: channels[0].brightness,
            ledGreen: channels[1].brightness,
            ledBlue: channels[2].brightness,
          }
        : { values: channels.map((s) => (s.lit ? 1 : 0)) };
    result[group.id].current = channels.reduce((sum, s) => sum + s.current, 0);
    result[group.id].warning = channels.find((s) => s.warning)?.warning || "";
    for (const id of group.channels) delete result[id];
  }
  return result;
}
