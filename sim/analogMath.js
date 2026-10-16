export function quantity(value, unit = "") {
  const s = String(value).trim().replace(/µ|μ/g, "u");
  const m = s.match(
    /^([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([pnumkKM]?)\s*([a-zA-ZΩ]*)$/,
  );
  const n = m
    ? Number(m[1]) *
      ({ p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6 }[m[2]] ||
        1)
    : NaN;
  if (
    !Number.isFinite(n) ||
    n <= 0 ||
    (m[3] && unit && m[3].toLowerCase() !== unit.toLowerCase())
  )
    throw Error(
      `Use a positive ${unit || "value"} with optional p/n/u/m/k/M prefix.`,
    );
  return n;
}
export function waveform(a, t) {
  const f = Math.max(0.01, Math.min(1000, Number(a.frequency) || 100)),
    phase = (t * f) % 1;
  const amp = Math.max(0, Math.min(24, Number(a.amplitude) || 0)),
    offset = Number(a.offset) || 0;
  let v;
  switch (a.waveform) {
    case "pulse":
    case "square":
      v =
        phase < Math.max(0.01, Math.min(0.99, Number(a.duty) || 0.5)) ? 1 : -1;
      break;
    case "triangle":
      v = 1 - 4 * Math.abs(phase - 0.5);
      break;
    case "saw":
      v = 2 * phase - 1;
      break;
    case "noise": {
      const n = Math.sin(Math.floor(t * 12000) * 12.9898 + 78.233) * 43758.5453;
      v = (n - Math.floor(n)) * 2 - 1;
      break;
    }
    case "am":
      v =
        (1 +
          Math.max(0, Math.min(1, Number(a.modulationDepth) || 0)) *
            Math.sin(2 * Math.PI * (Number(a.modulationFrequency) || 5) * t)) *
        Math.sin(2 * Math.PI * f * t);
      break;
    default:
      v = Math.sin(2 * Math.PI * f * t);
  }
  return offset + amp * v;
}
export function solveLinear(a) {
  const n = a.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    if (Math.abs(a[c][c]) < 1e-14)
      throw Error(
        "Analog circuit has conflicting ideal sources or no reference.",
      );
    const g = a[c][c];
    for (let j = c; j <= n; j++) a[c][j] /= g;
    for (let r = 0; r < n; r++)
      if (r !== c) {
        const k = a[r][c];
        if (!k) continue;
        for (let j = c; j <= n; j++) a[r][j] -= k * a[c][j];
      }
  }
  const x = a.map((r) => r[n]);
  if (x.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e7))
    throw Error("Analog model diverged. Check component values and wiring.");
  return x;
}
