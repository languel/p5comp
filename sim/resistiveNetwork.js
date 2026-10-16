// DC resistor network used by the simple two-terminal photoresistor.
export function networkResistors(network, controls = {}) {
  return (network.resistors || []).map((r) =>
    !r.photo
      ? r
      : {
          ...r,
          ohms:
            1000 *
            r.photo.rl10 *
            Math.pow(
              Math.max(0.001, Number(controls[r.id] ?? r.photo.lux)) / 10,
              -r.photo.gamma,
            ),
        },
  );
}
export function resistiveVoltages(network, pins = [], controls = {}) {
  const fixed = new Map(
    (network.sources || [])
      .filter((s) => s.volts != null || pins[s.pin] != null)
      .map((s) => [s.net, s.volts ?? pins[s.pin]]),
  );
  const resistors = networkResistors(network, controls);
  const unknown = [...new Set(resistors.flatMap((r) => [r.a, r.b]))].filter(
    (n) => !fixed.has(n),
  );
  const index = new Map(unknown.map((n, i) => [n, i]));
  const matrix = unknown.map(() => Array(unknown.length + 1).fill(0));
  for (const r of resistors)
    for (const [a, b] of [
      [r.a, r.b],
      [r.b, r.a],
    ]) {
      const i = index.get(a);
      if (i === undefined) continue;
      const g = 1 / Math.max(0.001, r.ohms);
      matrix[i][i] += g;
      if (fixed.has(b)) matrix[i][unknown.length] += g * fixed.get(b);
      else matrix[i][index.get(b)] -= g;
    }
  for (let c = 0; c < unknown.length; c++) {
    let pivot = c;
    for (let r = c + 1; r < unknown.length; r++)
      if (Math.abs(matrix[r][c]) > Math.abs(matrix[pivot][c])) pivot = r;
    [matrix[c], matrix[pivot]] = [matrix[pivot], matrix[c]];
    if (Math.abs(matrix[c][c]) < 1e-12) continue;
    const scale = matrix[c][c];
    for (let j = c; j <= unknown.length; j++) matrix[c][j] /= scale;
    for (let r = 0; r < unknown.length; r++)
      if (r !== c) {
        const k = matrix[r][c];
        for (let j = c; j <= unknown.length; j++)
          matrix[r][j] -= k * matrix[c][j];
      }
  }
  unknown.forEach((n, i) =>
    fixed.set(
      n,
      Math.abs(matrix[i][i]) > 1e-12 ? matrix[i][unknown.length] : 0,
    ),
  );
  return fixed;
}
