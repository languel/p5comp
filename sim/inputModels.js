export const isPot = (type) =>
  [
    "wokwi-potentiometer",
    "wokwi-slide-potentiometer",
    "p5comp-potentiometer",
    "p5comp-slide-potentiometer",
  ].includes(type);
export const isSensorInput = (type) =>
  /^(wokwi-(?:small|big)-sound-sensor|wokwi-photoresistor-sensor|wokwi-pir-motion-sensor)$/.test(
    type,
  );
export function sensorReading(sensor, value) {
  const a = sensor.attrs || {};
  if (sensor.type === "wokwi-photoresistor-sensor") {
    const lux = Math.max(0.001, Number(value ?? a.lux ?? 500));
    const resistance =
      1000 * Number(a.rl10 ?? 50) * Math.pow(lux / 10, -Number(a.gamma ?? 0.7));
    const volts = (5 * resistance) / (resistance + 10000);
    return { volts, high: volts > Number(a.threshold ?? 2.5), value: lux };
  }
  const raw = Math.max(0, Math.min(1023, Number(value ?? a.level ?? 0)));
  const above = raw >= Number(a.threshold ?? 512);
  return {
    volts: (raw / 1023) * 5,
    high: a.activeLow === true ? !above : above,
    value: raw,
  };
}
export function contactClosed(contact, controls) {
  const value = controls[contact.id] ?? contact.initial;
  if (contact.kind === "dip") return !!value?.[contact.index];
  if (contact.kind === "keypad")
    return Array.isArray(value) && value.includes(contact.key);
  if (contact.kind === "slide") return Number(value || 0) === contact.position;
  if (contact.kind === "relay")
    return !!controls[contact.id + ":coil"] === contact.energized;
  return !!value;
}
// Propagate real bidirectional switch contacts, including scanned key matrices.
export function digitalLevels(topology, states, controls, sensorSources = []) {
  const d = topology.digital;
  if (!d) return null;
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const join = (a, b) => parent.set(find(a), find(b));
  for (const c of d.contacts) if (contactClosed(c, controls)) join(c.a, c.b);
  const sources = new Map();
  const add = (net, value, strength = 2) => {
    const root = find(net),
      previous = sources.get(root);
    if (
      !previous ||
      strength > previous.strength ||
      (strength === previous.strength && value === false)
    )
      sources.set(root, { value, strength });
  };
  add(d.high, true);
  add(d.ground, false);
  d.pinNets.forEach((net, n) => {
    if (states[n] === 1) add(net, true);
    else if (states[n] === 0) add(net, false);
    else if (states[n] === 3) add(net, true, 1);
  });
  for (const s of sensorSources) add(s.net, s.high);
  return d.pinNets.map((net) => sources.get(find(net))?.value ?? false);
}
