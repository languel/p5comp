// Keep simulation time (pause freezes the trail; restarting clears it).
export function appendPlotSample(history, measurement, windowSeconds) {
  const time = Number(measurement.seconds);
  if (!Number.isFinite(time)) return history;
  const window = Math.max(.1, Math.min(120, Number(windowSeconds) || 10));
  const previous = history.at(-1)?.time;
  if (previous != null && time < previous) history = [];
  if (history.at(-1)?.time === time) return history;
  return [...history.filter(p => p.time >= time - window), {time, channels: measurement.channels || []}].slice(-12000);
}
export function plotRange(values, auto, min, max) {
  if (!auto) return [Number(min) || 0, Math.max((Number(min) || 0) + .001, Number(max) || 5)];
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 5];
  const low = Math.min(...finite), high = Math.max(...finite);
  const pad = Math.max(.05, (high - low) * .08);
  return [low - pad, high + pad];
}
