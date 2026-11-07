import { flatten, stateAt, describe } from "./take.js";
const clone = (v) => structuredClone(v);
const id = () => crypto.randomUUID();
export const takeDuration = (take) =>
  Math.max(1, take.duration || 0, ...take.clips.map((c) => c.start + c.dur));
const kinds = ["code", "circuit", "page", "draw", "state"];
/** Freeze the before-state and held frames at every cut, making sections independently movable. */
export function section(take, from, to, label = "Section") {
  const flat = flatten(take).filter((c) => !c.muted),
    state = stateAt(take, from - 0.001);
  const clips = [{ id: id(), track: "state", start: 0, dur: 1, state }];
  for (const channel of ["page", "p5"]) {
    const last = flat
      .filter(
        (c) => c.track === "frame" && c.channel === channel && c.start <= from,
      )
      .at(-1);
    if (last) clips.push({ ...clone(last), id: id(), start: 0, dur: 1 });
  }
  for (const c of flat)
    if (
      c.start >= from &&
      c.start < to &&
      !(c.track === "state" && c.start === from)
    )
      clips.push({
        ...clone(c),
        id: id(),
        start: c.start - from,
        dur: Math.min(c.dur, to - c.start),
      });
  return {
    id: id(),
    track: "comp",
    lane: "sections",
    start: from,
    dur: Math.max(1, to - from),
    rate: 1,
    label,
    comp: { clips, tracks: clone(take.tracks || []) },
  };
}
export function ensureSections(take) {
  if (take.meta?.sectionEdit) return clone(take);
  const out = clone(take);
  out.clips = [section(take, 0, takeDuration(take), take.title || "Section 1")];
  out.tracks = [{ id: "sections", kind: "comp", name: "Sections" }];
  out.meta = { ...out.meta, sectionEdit: true };
  out.duration = takeDuration(take);
  return out;
}
export function cut(take, t) {
  const out = ensureSections(take),
    index = out.clips.findIndex((c) => c.start < t && c.start + c.dur > t);
  if (index < 0) return out;
  const c = out.clips[index];
  out.clips.splice(
    index,
    1,
    section(out, c.start, t, c.label + " · A"),
    section(out, t, c.start + c.dur, c.label + " · B"),
  );
  return out;
}
export function ripple(take, ids) {
  const out = clone(take),
    byId = new Map(out.clips.map((c) => [c.id, c]));
  let t = 0;
  out.clips = ids
    .map((key) => byId.get(key))
    .filter(Boolean)
    .map((c) => ({ ...c, start: (t += c.dur) - c.dur }));
  out.duration = t;
  return out;
}
export function trimSection(take, key, from, to) {
  const out = ensureSections(take),
    c = out.clips.find((c) => c.id === key);
  if (!c) return out;
  const a = Math.max(c.start, Math.min(c.start + c.dur - 1, from)),
    b = Math.min(c.start + c.dur, Math.max(a + 1, to));
  const replacement = section(out, a, b, c.label);
  replacement.id = c.id;
  out.clips[out.clips.indexOf(c)] = replacement;
  return ripple(
    out,
    out.clips.map((c) => c.id),
  );
}
export function duplicateSection(take, key) {
  const out = ensureSections(take),
    i = out.clips.findIndex((c) => c.id === key);
  if (i < 0) return out;
  const c = clone(out.clips[i]);
  c.id = id();
  c.label += " · copy";
  out.clips.splice(i + 1, 0, c);
  return ripple(
    out,
    out.clips.map((c) => c.id),
  );
}
/** Before/after teaching steps. Serial/frame chatter does not create empty pauses. */
export function steps(take, hold = 1200) {
  const flat = flatten(take).filter((c) => !c.muted),
    changes = flat.filter(
      (c) => kinds.includes(c.track) && c.track !== "state",
    );
  if (!changes.length) return ensureSections(take);
  const groups = [];
  for (const c of changes) {
    const last = groups.at(-1);
    if (last && c.start - last.at < 500 && c.track === last.kind) {
      last.end = c.start;
      last.at = c.start;
    } else
      groups.push({
        start: c.start,
        end: c.start,
        at: c.start,
        kind: c.track,
        label: describe(c),
      });
  }
  const out = clone(take);
  out.clips = [];
  out.tracks = [{ id: "sections", kind: "comp", name: "Steps" }];
  out.meta = { ...out.meta, sectionEdit: true, stepsMode: true };
  for (const [i, g] of groups.entries()) {
    const before = g.start - 0.01,
      after = g.end,
      clips = [];
    for (const [at, t] of [
      [0, before],
      [Math.round(hold * 0.3), after],
    ]) {
      clips.push({
        id: id(),
        track: "state",
        start: at,
        dur: 1,
        state: stateAt(take, t),
        sourceTime: t,
      });
      for (const channel of ["page", "p5"]) {
        const frames = flat.filter(
            (c) => c.track === "frame" && c.channel === channel,
          ),
          f =
            at === 0
              ? frames.filter((c) => c.start <= t).at(-1)
              : frames.find(
                  (c) =>
                    c.start >= t &&
                    c.start < (groups[i + 1]?.start ?? Infinity),
                ) || frames.filter((c) => c.start <= t).at(-1);
        if (f) clips.push({ ...clone(f), id: id(), start: at, dur: 1 });
      }
    }
    clips.push({ id: id(), track: "say", text: g.label, start: 0, dur: hold });
    out.clips.push({
      id: id(),
      track: "comp",
      lane: "sections",
      start: i * hold,
      dur: hold,
      rate: 1,
      label: `${i + 1} · ${g.label}`,
      comp: { clips, tracks: [] },
    });
  }
  out.duration = groups.length * hold;
  return out;
}
/** Replace a time range with a new pass, preserving the before/after states of the untouched parts. */
export function overdub(take, pass, at, end = at + takeDuration(pass)) {
  const D = takeDuration(take),
    pD = takeDuration(pass),
    out = clone(take),
    clips = [];
  if (at > 0) clips.push(section(take, 0, Math.min(at, D), "Before overdub"));
  const added = section(pass, 0, pD, "Overdub");
  added.start = at;
  clips.push(added);
  if (end < D) {
    const tail = section(take, end, D, "After overdub");
    tail.start = at + pD;
    clips.push(tail);
  }
  out.clips = clips;
  out.tracks = [{ id: "sections", kind: "comp", name: "Sections" }];
  out.meta = { ...out.meta, sectionEdit: true };
  out.duration = Math.max(at + pD, ...clips.map((c) => c.start + c.dur));
  return out;
}
export class EditHistory {
  constructor() {
    this.reset(null);
  }
  reset(take) {
    this.states = take ? [clone(take)] : [];
    this.i = this.states.length - 1;
  }
  push(take) {
    this.states.splice(this.i + 1);
    this.states.push(clone(take));
    if (this.states.length > 40) this.states.shift();
    this.i = this.states.length - 1;
    return take;
  }
  undo() {
    if (this.i > 0) return clone(this.states[--this.i]);
    return null;
  }
  redo() {
    if (this.i + 1 < this.states.length) return clone(this.states[++this.i]);
    return null;
  }
}
