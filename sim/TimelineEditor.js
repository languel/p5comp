import { flatten, stateAt } from "../shared/takes/take.js";
import {
  takeDuration,
  ensureSections,
  cut,
  ripple,
  trimSection,
  duplicateSection,
  steps,
  overdub,
  EditHistory,
} from "../shared/takes/edit.js";
import { frameSource } from "../shared/takes/frameStore.js";
const node = (tag, parent, text = "") => {
  const e = document.createElement(tag);
  e.textContent = text;
  parent?.append(e);
  return e;
};
const btn = (p, text, label, fn) => {
  const e = node("button", p, text);
  e.type = "button";
  e.title = label;
  e.setAttribute("aria-label", label);
  e.onclick = fn;
  return e;
};
const clock = (t) => {
  const tenths = Math.floor(Math.max(0, t) / 100);
  return `${Math.floor(tenths / 600)}:${((tenths / 10) % 60).toFixed(1).padStart(4, "0")}`;
};
export class TimelineEditor {
  constructor(timeline) {
    this.tl = timeline;
    this.wb = timeline.wb;
    this.history = new EditHistory();
    this.selected = null;
    this.playing = false;
    this.flat = [];
    this.bar = node("div", timeline.panel);
    this.bar.className = "take-transport";
    timeline.captionInput.before(this.bar);
    btn(this.bar, "⏮", "Go to beginning", () => this.seek(0));
    this.play = btn(this.bar, "▶", "Play page recording", () => this.toggle());
    this.return = btn(this.bar, "↩", "Return to live page", () => this.exit());
    this.position = node("input", this.bar);
    this.position.type = "range";
    this.position.min = 0;
    this.position.step = 1;
    this.position.setAttribute("aria-label", "Timeline playhead");
    this.position.oninput = () => this.seek(Number(this.position.value));
    this.time = node("output", this.bar);
    this.speed = node("select", this.bar);
    this.speed.setAttribute("aria-label", "Timeline speed");
    for (const n of [0.5, 1, 1.5, 2]) {
      const o = node("option", this.speed, n + "×");
      o.value = n;
    }
    this.speed.value = 1;
    btn(this.bar, "●+", "Overdub from playhead", () =>
      timeline.guard(() => this.recordPass()),
    );
    btn(this.bar, "✂", "Split section at playhead", () =>
      this.change(cut(timeline.take, timeline.t)),
    );
    btn(this.bar, "Steps", "Make before/after steps without pauses", () =>
      timeline.guard(() => this.makeSteps()),
    );
    this.undo = btn(this.bar, "↶", "Undo timeline edit", () =>
      this.useHistory(this.history.undo()),
    );
    this.redo = btn(this.bar, "↷", "Redo timeline edit", () =>
      this.useHistory(this.history.redo()),
    );
    this.details = node("div", timeline.panel);
    this.details.className = "take-section-edit";
    timeline.lanes.after(this.details);
    this.sectionTitle = node("input", this.details);
    this.sectionTitle.setAttribute("aria-label", "Section name");
    this.sectionTitle.placeholder = "Select or split a section to edit it";
    this.sectionTitle.onchange = () => {
      const out = structuredClone(timeline.take),
        c = out.clips.find((c) => c.id === this.selected);
      if (c) {
        c.label = this.sectionTitle.value;
        this.change(out, c.id);
      }
    };
    this.in = node("input", this.details);
    this.out = node("input", this.details);
    for (const [e, label] of [
      [this.in, "Section in (seconds)"],
      [this.out, "Section out (seconds)"],
    ]) {
      e.type = "number";
      e.step = ".1";
      e.min = 0;
      e.setAttribute("aria-label", label);
      e.title = label;
      e.onchange = () =>
        this.change(
          trimSection(
            timeline.take,
            this.selected,
            Number(this.in.value) * 1000,
            Number(this.out.value) * 1000,
          ),
          this.selected,
        );
    }
    btn(this.details, "←", "Move section earlier", () => this.move(-1));
    btn(this.details, "→", "Move section later", () => this.move(1));
    btn(this.details, "⧉", "Duplicate section", () =>
      this.change(
        duplicateSection(timeline.take, this.selected),
        this.selected,
      ),
    );
    btn(this.details, "×", "Delete section", () => {
      const out = ensureSections(timeline.take);
      this.change(
        ripple(
          out,
          out.clips.filter((c) => c.id !== this.selected).map((c) => c.id),
        ),
      );
    });
    this.overlay = node("div", document.body);
    this.overlay.className = "take-page-overlay";
    this.overlay.hidden = true;
    this.image = node("img", this.overlay);
    this.image.alt = "Recorded workbench page";
    this.image.hidden = true;
    this.p5Image = node("img");
    this.p5Image.className = "take-p5-replay";
    this.p5Image.alt = "Recorded p5 output";
    document.addEventListener(
      "keydown",
      (e) => {
        if (timeline.reviewing && !e.target.closest(".take-panel")) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (e.key === "Escape") this.exit();
        }
      },
      true,
    );
    timeline.lanes.tabIndex = 0;
    timeline.lanes.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        this.toggle();
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (timeline.take) this.change(cut(timeline.take, timeline.t));
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        this.useHistory(e.shiftKey ? this.history.redo() : this.history.undo());
      }
      if (e.key === "ArrowRight") this.seek(timeline.t + 500);
      if (e.key === "ArrowLeft") this.seek(timeline.t - 500);
    });
    this.clockTimer = setInterval(() => {
      if (timeline.recorder.take) this.paintPosition();
    }, 100);
  }
  load() {
    this.history.reset(this.tl.take);
    this.selected = null;
    this.reindex();
  }
  reindex() {
    this.flat = this.tl.take ? flatten(this.tl.take) : [];
    this.pageFrames = this.flat.filter(
      (c) => !c.muted && c.track === "frame" && c.channel === "page",
    );
    this.p5Frames = this.flat.filter(
      (c) => !c.muted && c.track === "frame" && c.channel === "p5",
    );
    this.lastState = null;
    this.lastFrame = null;
  }
  update() {
    const tl = this.tl,
      active =
        !!tl.take &&
        !tl.recorder.take &&
        !tl.exportController &&
        !this.preparing;
    this.bar
      .querySelectorAll("button,input,select")
      .forEach((e) => (e.disabled = !active));
    this.return.disabled = !tl.reviewing;
    this.undo.disabled = !active || !this.history.states.length || this.history.i <= 0;
    this.redo.disabled = !active || this.history.i >= this.history.states.length - 1;
    const section = tl.take?.meta?.sectionEdit
      ? tl.take.clips.find((c) => c.id === this.selected)
      : null;
    this.details.hidden = !section;
    if (section) {
      this.sectionTitle.value = section.label || "Section";
      this.in.value = (section.start / 1000).toFixed(2);
      this.out.value = ((section.start + section.dur) / 1000).toFixed(2);
    }
    this.paintPosition();
  }
  paintPosition() {
    const tl = this.tl,
      recording = tl.recorder.take;
    const t = recording ? tl.recorder.now() - tl.recorder.t0 : tl.t;
    const duration = recording
      ? Math.max(t, 1, ...recording.clips.map((c) => c.start + c.dur))
      : tl.take
        ? takeDuration(tl.take)
        : 1;
    this.position.max = duration;
    this.position.value = Math.min(t, duration);
    this.time.textContent = `${clock(t)} / ${clock(duration)}`;
    tl.lanes.style.setProperty(
      "--take-progress",
      Math.min(100, (t / duration) * 100) + "%",
    );
    tl.lanes.style.setProperty("--take-fraction", Math.min(1, t / duration));
    this.play.textContent = this.playing ? "Ⅱ" : "▶";
  }
  async enter() {
    const tl = this.tl;
    if (tl.reviewing) return;
    this.liveProject = structuredClone(this.wb.ctx.project());
    this.liveSelected = tl.select.value;
    this.liveCode = {
      arduino: this.wb.ctx.arduinoEditor.state,
      p5: this.wb.ctx.p5Editor.state,
      extra: new Map([...this.wb.extra].map(([name, e]) => [name, e.state])),
    };
    this.liveUndo = {
      undo: this.wb.ctx.canvas.undoStack,
      redo: this.wb.ctx.canvas.redoStack,
    };
    tl.reviewing = true;
    this.wb.ctx.stop();
    this.wb.ctx.bridge.stop();
    document.body.classList.add("take-replaying");
    this.overlay.hidden = false;
    this.reindex();
    this.update();
  }
  seek(t) {
    return this.tl.guard(async () => {
      if (!this.tl.take || this.tl.recorder.take) return;
      if (!this.tl.take.meta?.p5comp) return this.tl.openInspector();
      await this.enter();
      this.tl.t = Math.max(
        0,
        Math.min(takeDuration(this.tl.take), Number(t) || 0),
      );
      await this.paint();
      this.paintPosition();
    });
  }
  async paint() {
    const tl = this.tl;
    if (!tl.reviewing) return;
    this.overlay.style.height =
      this.wb.bottom.getBoundingClientRect().top + "px";
    const frame = this.pageFrames?.filter((c) => c.start <= tl.t).at(-1);
    if (frame) {
      this.image.hidden = false;
      this.overlay.style.background = "var(--ui-page)";
      if (this.lastFrame !== frame.src) {
        this.lastFrame = frame.src;
        const token = (this.frameToken = Symbol());
        const src = await frameSource(frame.src);
        if (token === this.frameToken && tl.reviewing) this.image.src = src;
      }
    } else {
      this.image.hidden = true;
      this.overlay.style.background = "transparent";
      const state = this.stateForTime(tl.take, tl.t),
        key = JSON.stringify(state);
      if (key !== this.lastState) {
        this.lastState = key;
        this.wb.ctx.applyTakeState(
          state,
          tl.take.meta?.p5comp?.project || this.liveProject,
        );
      }
      const p5 = this.p5Frames?.filter((c) => c.start <= tl.t).at(-1);
      if (p5) {
        const frame = this.wb.ctx.bridge.frame;
        this.p5Image.src = await frameSource(p5.src);
        if (!this.p5Image.isConnected) frame.parentElement.append(this.p5Image);
        frame.hidden = true;
      }
    }
  }
  toggle() {
    if (!this.tl.take || this.tl.recorder.take) return;
    if (!this.tl.take.meta?.p5comp) return this.tl.guard(() => this.tl.openInspector());
    if (this.playing) {
      this.pause();
      return;
    }
    this.tl.guard(async () => {
      await this.enter();
      if (this.tl.t >= takeDuration(this.tl.take)) this.tl.t = 0;
      this.playing = true;
      this.last = performance.now();
      this.paintPosition();
      const tick = (now) => {
        if (!this.playing) return;
        const dt = Math.min(100, now - this.last);
        this.last = now;
        this.tl.t = Math.min(
          takeDuration(this.tl.take),
          this.tl.t + dt * Number(this.speed.value),
        );
        this.paint().catch((e) => {
          this.pause();
          this.tl.status.textContent = e.message;
        });
        this.paintPosition();
        if (this.tl.t >= takeDuration(this.tl.take)) {
          this.pause();
          return;
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.paintPosition();
  }
  exit() {
    const tl = this.tl;
    this.pause();
    if (!tl.reviewing) return;
    this.frameToken = Symbol();
    this.p5Image.remove();
    this.wb.ctx.bridge.frame.hidden = false;
    const project = this.liveProject;
    project.workbench.takes = this.wb.takes;
    this.wb.ctx.openProject(project);
    if (this.liveCode) {
      this.wb.ctx.arduinoEditor.setState(this.liveCode.arduino);
      this.wb.ctx.p5Editor.setState(this.liveCode.p5);
      for (const [name, state] of this.liveCode.extra)
        this.wb.extra.get(name)?.setState(state);
    }
    if (this.liveUndo) {
      this.wb.ctx.canvas.undoStack = this.liveUndo.undo;
      this.wb.ctx.canvas.redoStack = this.liveUndo.redo;
    }
    tl.reviewing = false;
    this.liveProject = null;
    this.overlay.hidden = true;
    this.image.hidden = true;
    document.body.classList.remove("take-replaying");
    tl.refresh(this.liveSelected);
    this.wb.ctx.persist();
    this.update();
  }
  change(take, selected) {
    if (!take || this.tl.recorder.take) return;
    this.pause();
    this.tl.take = take;
    this.tl.t = Math.min(this.tl.t, takeDuration(take));
    this.selected =
      selected ||
      take.clips.find(
        (c) =>
          c.track === "comp" &&
          c.start <= this.tl.t &&
          c.start + c.dur >= this.tl.t,
      )?.id;
    this.history.push(take);
    this.saveEdit();
  }
  useHistory(take) {
    if (!take) return;
    this.pause();
    this.tl.take = take;
    this.selected = null;
    this.saveEdit();
  }
  saveEdit() {
    const tl = this.tl;
    this.wb.takes[tl.select.value] = tl.take;
    this.reindex();
    tl.render();
    if (tl.reviewing) {
      this.liveProject.workbench.takes = this.wb.takes;
      this.wb.ctx.saveTakeProject(this.liveProject);
      this.paint();
    } else this.wb.ctx.persist();
    tl.status.textContent = "Timeline edit saved. Undo and redo are available.";
  }
  move(delta) {
    if (!this.selected || !this.tl.take) return;
    const out = ensureSections(this.tl.take),
      ids = out.clips.map((c) => c.id),
      i = ids.indexOf(this.selected),
      j = Math.max(0, Math.min(ids.length - 1, i + delta));
    if (i < 0 || i === j) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this.change(ripple(out, ids), this.selected);
  }
  bindSection(element, c, duration) {
    element.classList.toggle("selected", c.id === this.selected);
    element.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.pause();
      this.selected = c.id;
      this.update();
      const x = e.clientX,
        start = c.start,
        dur = c.dur,
        width = element.parentElement.getBoundingClientRect().width,
        stretch = e.offsetX > element.getBoundingClientRect().width - 8;
      element.setPointerCapture(e.pointerId);
      element.onpointermove = (move) => {
        const dt = ((move.clientX - x) / width) * duration;
        if (stretch)
          element.style.width =
            Math.max(5, ((dur + dt) / duration) * 100) + "%";
        else
          element.style.left =
            Math.max(0, ((start + dt) / duration) * 100) + "%";
      };
      element.onpointerup = (up) => {
        element.onpointermove = null;
        element.onpointerup = null;
        const dt = ((up.clientX - x) / width) * duration;
        if (Math.abs(dt) < 40) {
          this.tl.t = c.start;
          this.seek(c.start);
          this.tl.render();
          return;
        }
        const out = structuredClone(this.tl.take),
          clip = out.clips.find((k) => k.id === c.id);
        if (stretch) {
          clip.dur = Math.max(100, dur + dt);
          clip.rate = (dur * (c.rate || 1)) / clip.dur;
        } else {
          const target = Math.max(0, start + dt);
          out.clips.splice(out.clips.indexOf(clip), 1);
          const index = out.clips.findIndex((k) => target <= k.start + k.dur / 2);
          out.clips.splice(index < 0 ? out.clips.length : index, 0, clip);
        }
        this.change(
          ripple(
            out,
            out.clips.map((k) => k.id),
          ),
          c.id,
        );
      };
    };
  }
  stateForTime(take, t) {
    const state = stateAt(take, t);
    if (!state.page) {
      state.page = {};
      const edit = flatten(take)
        .filter((c) => !c.muted && c.track === "code" && c.start <= t)
        .at(-1);
      if (edit)
        state.page.inspector = /\.(ino|h|cpp|c)$/i.test(edit.file)
          ? "arduino"
          : "p5";
    }
    return state;
  }
  async captureState(take, state, t) {
    this.wb.ctx.applyTakeState(
      state,
      take.meta?.p5comp?.project || this.liveProject,
    );
    this.p5Image.remove();
    this.wb.ctx.bridge.frame.hidden = false;
    const frame = flatten(take)
      .filter(
        (f) =>
          !f.muted && f.track === "frame" && f.channel === "p5" && f.start <= t,
      )
      .at(-1);
    this.tl.capture.latestP5 = frame ? await frameSource(frame.src) : null;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return this.tl.capture.capture();
  }
  async makeSteps() {
    const tl = this.tl;
    if (!tl.take || tl.recorder.take || this.preparing) return;
    this.pause();
    const original = tl.take,
      out = steps(original);
    await this.enter();
    const previousP5 = tl.capture.latestP5;
    this.preparing = true;
    this.update();
    try {
      const states = out.clips.flatMap(
        (section) =>
          section.comp?.clips
            .filter((c) => c.track === "state")
            .map((c) => ({ section, c })) || [],
      );
      for (let i = 0; i < states.length; i++) {
        const { section, c } = states[i];
        tl.status.textContent = `Preparing before/after steps · ${i + 1}/${states.length}`;
        const state = structuredClone(c.state);
        if (!state.page)
          state.page = this.stateForTime(original, c.sourceTime).page;
        const image = await this.captureState(original, state, c.sourceTime);
        if (c.start === 0)
          section.comp.clips = section.comp.clips.filter(
            (k) => k.track !== "frame" || k.channel !== "page",
          );
        if (image)
          section.comp.clips.push({
            id: crypto.randomUUID(),
            track: "frame",
            channel: "page",
            start: c.start,
            dur: 1,
            ...image,
          });
      }
      this.change(out);
    } finally {
      tl.capture.latestP5 = previousP5;
      this.preparing = false;
      this.update();
    }
  }
  async prepareExport(take, signal) {
    if (
      !take.meta?.p5comp ||
      flatten(take).some((c) => c.track === "frame" && c.channel === "page")
    )
      return take;
    const wasReviewing = this.tl.reviewing,
      out = structuredClone(take),
      previousP5 = this.tl.capture.latestP5;
    this.pause();
    await this.enter();
    this.preparing = true;
    this.update();
    const times = [
      ...new Set([
        0,
        ...flatten(take)
          .filter(
            (c) =>
              (!c.muted &&
                ["code", "circuit", "page", "state", "draw"].includes(
                  c.track,
                )) ||
              (!c.muted && c.track === "frame" && c.channel === "p5"),
          )
          .map((c) => c.start),
      ]),
    ].sort((a, b) => a - b);
    try {
      for (let i = 0; i < times.length; i++) {
        signal?.throwIfAborted();
        this.tl.status.textContent = `Preparing page states · ${i + 1}/${times.length}`;
        const image = await this.captureState(
          take,
          this.stateForTime(take, times[i]),
          times[i],
        );
        if (image)
          out.clips.push({
            id: crypto.randomUUID(),
            track: "frame",
            channel: "page",
            start: times[i],
            dur: 1,
            ...image,
          });
      }
      return out;
    } finally {
      this.tl.capture.latestP5 = previousP5;
      this.preparing = false;
      this.lastState = null;
      if (!wasReviewing) this.exit();
      else await this.paint();
      this.update();
    }
  }
  async recordPass() {
    const tl = this.tl;
    if (!tl.take || tl.recorder.take) return;
    const original = structuredClone(tl.take),
      at = tl.t,
      selected = original.clips.find((c) => c.id === this.selected),
      state = stateAt(original, at),
      project = structuredClone(this.liveProject || this.wb.ctx.project());
    this.exit();
    tl.reviewing = true;
    this.wb.ctx.applyTakeState(
      state,
      original.meta?.p5comp?.project || project,
    );
    tl.reviewing = false;
    this.overdubBase = {
      original,
      at,
      end:
        selected && at >= selected.start && at < selected.start + selected.dur
          ? selected.start + selected.dur
          : null,
      project,
    };
    try {
      await tl.start();
      tl.status.textContent =
        "Overdubbing from the playhead. Edit the page, then Stop to save a new pass.";
    } catch (e) {
      this.overdubBase = null;
      this.wb.ctx.openProject(project);
      throw e;
    }
  }
  finishPass(pass) {
    const base = this.overdubBase;
    if (!base) return pass;
    this.overdubBase = null;
    const merged = overdub(
      base.original,
      pass,
      base.at,
      base.end ?? base.at + takeDuration(pass),
    );
    merged.title = base.original.title + " · overdub";
    base.project.workbench.takes = this.wb.takes;
    this.wb.ctx.bridge.stop();
    this.wb.ctx.openProject(base.project);
    return merged;
  }
}
