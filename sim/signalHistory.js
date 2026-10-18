// Bounded, time-based histories for the optional communication sparklines.
export function sampleSignal(history, value, now, windowMs = 10000) {
  const values = (Array.isArray(value) ? value : [value]).map((v) =>
    typeof v === "boolean" ? Number(v) : v,
  );
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) return;
  if (!history.length || now - history.at(-1).time >= 80)
    history.push({ time: now, values });
  while (
    history.length &&
    (history[0].time < now - windowMs || history.length > 160)
  )
    history.shift();
}
export function signalPaths(history, now, windowMs = 10000) {
  if (!history.length) return [];
  const channels = Math.max(...history.map((s) => s.values.length));
  return Array.from({ length: channels }, (_, channel) => {
    const samples = history.filter((s) => Number.isFinite(s.values[channel]));
    let min = Math.min(...samples.map((s) => s.values[channel])),
      max = Math.max(...samples.map((s) => s.values[channel]));
    if (max === min) {
      min -= 0.5;
      max += 0.5;
    }
    return samples
      .map(
        (s, i) =>
          `${i ? "L" : "M"}${Math.max(0, Math.min(240, ((s.time - now + windowMs) / windowMs) * 240)).toFixed(1)},${(22 - ((s.values[channel] - min) / (max - min)) * 20).toFixed(1)}`,
      )
      .join(" ");
  });
}
