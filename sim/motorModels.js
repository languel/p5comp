export const isDCMotor = (type) =>
  ["p5comp-dc-motor", "p5comp-gear-motor"].includes(type);

// Resolve each output terminal through an explicitly wired ideal H-bridge.
// VMOT is a 5V classroom rail, not an arbitrary voltage/current power solver.
export function motorTerminals(part, bridges, equal, target, board) {
  const terminal = (endpoint) => {
    for (const bridge of bridges) {
      for (let n = 1; n <= 4; n++) {
        if (!equal(endpoint, `${bridge.id}:OUT${n}`)) continue;
        const enable = n <= 2 ? "ENA" : "ENB";
        return {
          pin: target(`${bridge.id}:IN${n}`),
          level: equal(`${bridge.id}:IN${n}`, `${board}:5V`),
          enablePin: target(`${bridge.id}:${enable}`),
          enableLevel: equal(`${bridge.id}:${enable}`, `${board}:5V`),
          powered:
            ["VCC", "VMOT"].every((p) =>
              equal(`${bridge.id}:${p}`, `${board}:5V`),
            ) && equal(`${bridge.id}:GND`, `${board}:GND.1`),
        };
      }
    }
    // Do not teach driving bare motor coils from microcontroller GPIOs.
    return {
      pin: null,
      level: equal(endpoint, `${board}:5V`),
      enableLevel: true,
      powered:
        equal(endpoint, `${board}:5V`) || equal(endpoint, `${board}:GND.1`),
    };
  };
  return Object.fromEntries(
    (isDCMotor(part.type) ? ["+", "-"] : ["A+", "A-", "B+", "B-"]).map(
      (name) => [name, terminal(`${part.id}:${name}`)],
    ),
  );
}
export function terminalHigh(t, high) {
  return (
    !!t?.powered &&
    (t.enablePin != null ? high(t.enablePin) : t.enableLevel) &&
    (t.pin != null ? high(t.pin) : t.level)
  );
}
export function integrateMotor(memory, cycles, attrs, geared) {
  const elapsed = Math.max(0, cycles - (memory.motorCycle ?? cycles));
  const speed = Number(attrs.noLoadRPM ?? 6000);
  const ratio = geared ? Number(attrs.gearRatio ?? 100) : 1;
  const maxRPM =
    (Number.isFinite(speed) && speed > 0 ? speed : 6000) /
    (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
  memory.angle += ((memory.drive || 0) * maxRPM * 6 * elapsed) / 16e6;
  memory.motorCycle = cycles;
}
