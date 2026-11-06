/** Host-neutral take operations. No DOM, AMS imports, or hardware side effects. */
const clone = (value) => structuredClone(value);
const id = () => globalThis.crypto.randomUUID();
export function diffText(before, after) {
  if (before === after) return null;
  const a = before.split("\n"),
    b = after.split("\n");
  let from = 0,
    endA = a.length,
    endB = b.length;
  while (from < endA && from < endB && a[from] === b[from]) from++;
  while (endA > from && endB > from && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { from, delete: endA - from, lines: b.slice(from, endB) };
}
export function applyText(text, diff) {
  const lines = text.split("\n");
  lines.splice(diff.from, diff.delete, ...diff.lines);
  return lines.join("\n");
}
export function diffState(before, after) {
  const clips = [];
  for (const file of new Set([
    ...Object.keys(before.files),
    ...Object.keys(after.files),
  ])) {
    if (!(file in after.files))
      clips.push({ track: "code", file, removed: true });
    else {
      const diff = diffText(before.files[file] ?? "", after.files[file]);
      if (diff || !(file in before.files))
        clips.push({
          track: "code",
          file,
          diff: diff || { from: 0, delete: 1, lines: [""] },
        });
    }
  }
  // Circuit fields are independently replaced; unchanged arrays are not repeated.
  const diff = {};
  for (const key of new Set([
    ...Object.keys(before.diagram),
    ...Object.keys(after.diagram),
  ]))
    if (
      JSON.stringify(before.diagram[key]) !== JSON.stringify(after.diagram[key])
    )
      diff[key] = after.diagram[key] ?? null;
  if (Object.keys(diff).length)
    clips.push({ track: "circuit", diff: clone(diff) });
  return clips;
}
export function apply(state, clip) {
  if (clip.track === "code") {
    if (clip.removed) delete state.files[clip.file];
    else
      state.files[clip.file] = applyText(
        state.files[clip.file] ?? "",
        clip.diff,
      );
  }
  if (clip.track === "circuit") Object.assign(state.diagram, clone(clip.diff));
  if (clip.track === "signal") state.signals[clip.name] = clip.value;
  return state;
}
export const describe = (clip) =>
  clip.label ||
  clip.text ||
  (clip.track === "code"
    ? `Edit ${clip.file}`
    : clip.track === "signal"
      ? `${clip.name}: ${clip.value}`
      : clip.track);
export function flatten(take) {
  const out = [];
  function walk(
    clips,
    tracks,
    offset = 0,
    scale = 1,
    muted = false,
    end = Infinity,
    depth = 0,
  ) {
    if (depth > 16) return;
    const mutedLanes = new Set(
      (tracks || []).filter((t) => t.muted).map((t) => t.id),
    );
    for (const c of clips || []) {
      if (c.start >= end) continue;
      const off = muted || c.muted || mutedLanes.has(c.lane || c.track);
      if (c.track === "comp" && c.comp) {
        const rate = c.rate > 0 ? c.rate : 1;
        walk(
          c.comp.clips,
          c.comp.tracks,
          offset + c.start * scale,
          scale / rate,
          off,
          c.dur * rate,
          depth + 1,
        );
      } else
        out.push({
          ...c,
          start: offset + c.start * scale,
          dur: c.dur * scale,
          muted: off,
        });
    }
  }
  walk(take.clips, take.tracks);
  return out.sort((a, b) => a.start - b.start);
}
export function stateAt(take, t) {
  const initial = take.meta?.p5comp?.state || {
    files: {},
    diagram: { parts: [], connections: [] },
    signals: {},
  };
  const state = clone(initial);
  for (const clip of flatten(take))
    if (!clip.muted && clip.start <= t) apply(state, clip);
  return state;
}
export function validateTake(take) {
  if (
    !take ||
    take.type !== "ams-take" ||
    take.version !== 1 ||
    !Array.isArray(take.clips) ||
    take.clips.length > 100000
  )
    throw new Error("Choose an ams-take version 1 JSON file.");
  const safeFile = (name) =>
    typeof name === "string" &&
    name.length < 240 &&
    !["__proto__", "constructor", "prototype"].includes(name) &&
    !name.split("/").some((s) => s === "..");
  function check(clips, depth = 0) {
    if (depth > 16) throw new Error("Take compositions are nested too deeply.");
    for (const c of clips) {
      if (
        !Number.isFinite(c.start) ||
        c.start < 0 ||
        !Number.isFinite(c.dur) ||
        c.dur < 0 ||
        typeof c.track !== "string"
      )
        throw new Error("Invalid clip timing.");
      if (
        c.track === "code" &&
        (!safeFile(c.file) ||
          (!c.removed &&
            (!c.diff ||
              !Number.isInteger(c.diff.from) ||
              c.diff.from < 0 ||
              !Number.isInteger(c.diff.delete) ||
              c.diff.delete < 0 ||
              !Array.isArray(c.diff.lines) ||
              c.diff.lines.some((s) => typeof s !== "string"))))
      )
        throw new Error("Invalid source diff.");
      if (
        c.track === "signal" &&
        (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name) ||
          ["__proto__", "constructor", "prototype"].includes(c.name) ||
          !Number.isFinite(c.value))
      )
        throw new Error("Invalid signal.");
      if (
        c.track === "circuit" &&
        (!c.diff ||
          Object.keys(c.diff).some((k) =>
            ["__proto__", "constructor", "prototype"].includes(k),
          ))
      )
        throw new Error("Invalid circuit diff.");
      if (c.comp) {
        if (!Array.isArray(c.comp.clips))
          throw new Error("Invalid composition.");
        check(c.comp.clips, depth + 1);
      }
    }
  }
  check(take.clips);
  return take;
}
/** A single wall clock; compress gaps once, after merging embed and host clips. */
export function compress(take, gap = 2000) {
  const anchors = [
    ...new Set([0, ...take.clips.flatMap((c) => [c.start, c.start + c.dur])]),
  ].sort((a, b) => a - b);
  const positions = [0];
  for (let i = 1; i < anchors.length; i++)
    positions[i] =
      positions[i - 1] + Math.min(gap, anchors[i] - anchors[i - 1]);
  const mapped = new Map(anchors.map((a, i) => [a, positions[i]]));
  for (const c of take.clips) {
    const end = mapped.get(c.start + c.dur);
    c.start = mapped.get(c.start);
    c.dur = end - c.start;
  }
  take.duration = Math.max(0, ...take.clips.map((c) => c.start + c.dur));
  return take;
}
export class TakeRecorder {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
  }
  start({ title, state, project }) {
    this.t0 = this.now();
    this.last = clone(state);
    this.samples = new Map();
    this.take = {
      type: "ams-take",
      version: 1,
      title,
      created: new Date().toISOString(),
      duration: 0,
      source: "p5comp",
      baseline: { elements: [], artboard: { width: 2400, height: 1600 } },
      tracks: [],
      clips: [],
      meta: { p5comp: { state: clone(state), project: clone(project) } },
    };
    this.push({ track: "title", text: title, dur: 1600 });
  }
  push(clip) {
    if (!this.take) return;
    const c = {
      id: id(),
      start: Math.max(0, this.now() - this.t0),
      dur: 1,
      ...clone(clip),
    };
    this.take.clips.push(c);
    return c;
  }
  observe(state) {
    if (!this.take) return;
    for (const clip of diffState(this.last, state)) this.push(clip);
    this.last = clone(state);
  }
  signal(name, value) {
    if (
      !this.take ||
      !Number.isFinite(value) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      ["__proto__", "constructor", "prototype"].includes(name)
    )
      return;
    const prev = this.samples.get(name),
      now = this.now();
    if (prev && (now - prev.at < 50 || prev.value === value)) return;
    this.samples.set(name, { at: now, value });
    this.push({ track: "signal", name, value });
  }
  stop(drawing, offset = 0) {
    const take = this.take;
    if (!take) return null;
    if (drawing) {
      take.baseline = clone(drawing.baseline);
      for (const c of flatten(drawing))
        take.clips.push({
          ...c,
          id: id(),
          start: Math.max(0, c.start + offset),
        });
    }
    take.clips.sort((a, b) => a.start - b.start);
    take.tracks = [...new Set(take.clips.map((c) => c.track))].map((kind) => ({
      id: kind,
      kind,
      name: kind,
      muted: false,
    }));
    this.take = null;
    return compress(take);
  }
}
