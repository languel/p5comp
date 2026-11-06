import {
  TakeRecorder,
  stateAt,
  flatten,
  describe,
  validateTake,
} from "../shared/takes/take.js";
import { parseSignals } from "../shared/serial/signals.js";
import { P5Bridge } from "../shared/p5/P5Bridge.js";
import { basePath } from "../shared/basePath.js";
import { renderTakeCircuit } from "./takeCircuit.js";
import "./takes.css";
const el = (tag, text, parent) => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
};
const button = (parent, text, label, fn) => {
  const b = el("button", text, parent);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.onclick = fn;
  return b;
};
const time = (t) =>
  `${Math.floor(t / 60000)}:${((t / 1000) % 60).toFixed(1).padStart(4, "0")}`;
export class TakeTimeline {
  constructor(wb) {
    this.wb = wb;
    this.recorder = new TakeRecorder();
    this.t = 0;
    this.panel = el("section");
    this.panel.className = "take-panel";
    this.panel.hidden = true;
    document.body.append(this.panel);
    this.toggle = button(
      document.querySelector(".bar"),
      "◷",
      "Lesson timeline",
      () => (this.panel.hidden = !this.panel.hidden),
    );
    this.header = el("div", "", this.panel);
    this.header.className = "take-tools";
    this.title = el("input", "", this.header);
    this.title.placeholder = "Lesson title";
    this.title.setAttribute("aria-label", "Take title");
    this.record = button(this.header, "●", "Record lesson", () =>
      this.guard(() => (this.recorder.take ? this.stop() : this.start())),
    );
    this.select = el("select", "", this.header);
    this.select.setAttribute("aria-label", "Saved takes");
    this.select.onchange = () => {
      this.take = this.wb.takes[this.select.value];
      this.t = 0;
      this.render();
    };
    this.review = button(this.header, "▶", "Review take", () =>
      this.guard(() => this.openReview()),
    );
    button(this.header, "↓", "Export take JSON", () => this.export());
    this.file = el("input", "", this.panel);
    this.file.type = "file";
    this.file.accept = ".json,.ams-take.json";
    this.file.hidden = true;
    this.file.onchange = () =>
      this.guard(async () => {
        if (this.recorder.take)
          throw new Error("Stop recording before importing a take.");
        const file = this.file.files[0];
        if (!file) return;
        if (file.size > 20000000)
          throw new Error("Take files must be under 20 MB.");
        this.save(validateTake(JSON.parse(await file.text())));
        this.file.value = "";
      });
    button(this.header, "↑", "Import take JSON", () => this.file.click());
    button(this.header, "×", "Hide timeline", () => (this.panel.hidden = true));
    this.captionInput = el("input", "", this.panel);
    this.captionInput.placeholder =
      "Caption / narration text — Enter to add while recording";
    this.captionInput.setAttribute("aria-label", "Lesson caption");
    this.captionInput.onkeydown = (e) => {
      if (
        e.key === "Enter" &&
        this.recorder.take &&
        this.captionInput.value.trim()
      ) {
        this.recorder.push({
          track: "say",
          text: this.captionInput.value.trim(),
          dur: 2500,
        });
        this.captionInput.value = "";
        this.render();
      }
    };
    this.lanes = el("div", "", this.panel);
    this.lanes.className = "take-lanes";
    this.status = el(
      "p",
      "Record a lesson, then review or export its take.",
      this.panel,
    );
    this.status.setAttribute("role", "status");
    // A single sampling loop catches simulated controls that do not persist on every movement.
    this.timer = setInterval(() => {
      if (!this.recorder.take) return;
      this.observe();
      for (const [name, value] of Object.entries(
        this.wb.ctx.project().controls || {},
      ))
        this.recorder.signal(
          `control_${name.replace(/[^A-Za-z0-9_]/g, "_")}`,
          value,
        );
      if (performance.now() - (this.lastRender || 0) > 300) {
        this.lastRender = performance.now();
        this.render();
      }
    }, 50);
    document.addEventListener(
      "click",
      (e) => {
        if (!this.recorder.take || this.panel.contains(e.target)) return;
        const b = e.target.closest("button,[data-main-view],[data-tab]");
        if (!b) return;
        const target = b.id || b.dataset.mainView || b.dataset.tab;
        if (target)
          this.action(
            target,
            b.getAttribute("aria-label") || b.title || b.textContent.trim(),
          );
      },
      true,
    );
    window.addEventListener("beforeunload", (e) => {
      if (this.recorder.take) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    this.refresh();
  }
  async guard(fn) {
    try {
      await fn();
    } catch (e) {
      this.status.textContent = e.message;
      this.wb.ctx.notice(e.message);
    }
  }
  snapshot() {
    const p = this.wb.ctx.project();
    return {
      files: {
        ...this.wb.files,
        [this.wb.arduinoName]: p.arduino,
        [this.wb.p5Name]: p.p5[p.api] || "",
      },
      diagram: structuredClone(p.diagram),
      signals: {},
    };
  }
  observe() {
    if (this.recorder.take) this.recorder.observe(this.snapshot());
  }
  action(name, label = name) {
    this.observe();
    this.recorder.push({
      track: "action",
      name,
      label,
      ui: { kind: "button", target: name },
      dur: 600,
    });
  }
  serial(text, dir) {
    if (!this.recorder.take) return;
    this.recorder.push({ track: "say", text, meta: { dir }, dur: 900 });
    for (const [name, value] of Object.entries(parseSignals(text)))
      this.recorder.signal(name, value);
  }
  async start() {
    if (this.busy) return;
    this.busy = true;
    this.record.disabled = true;
    try {
      await this.wb.drawing.start();
      const editor = this.wb.drawing.editor;
      if (!editor?.recordStart)
        throw new Error(
          "Drawing recorder unavailable. Rebuild Poliplan with npm run vendor:ams.",
        );
      // Snapshot excludes saved takes so recordings never recursively contain older takes.
      const project = structuredClone(this.wb.ctx.project());
      delete project.workbench.takes;
      delete project.artifact;
      this.recorder.start({
        title:
          this.title.value.trim() || `Lesson ${new Date().toLocaleString()}`,
        state: this.snapshot(),
        project,
      });
      this.drawOffset = performance.now() - this.recorder.t0;
      try {
        await editor.recordStart({ title: this.recorder.take.title });
      } catch (e) {
        this.recorder.take = null;
        throw e;
      }
      this.record.textContent = "■";
      this.record.title = "Stop and save take";
      this.record.setAttribute("aria-label", "Stop and save take");
      this.record.dataset.recording = "true";
      this.render();
      this.status.textContent =
        "Recording code, drawing, controls, serial and actions. Enter captions below.";
    } finally {
      this.busy = false;
      this.record.disabled = false;
    }
  }
  async stop() {
    if (this.busy) return;
    this.busy = true;
    this.record.disabled = true;
    try {
      this.observe();
      const { take: drawing } = await this.wb.drawing.editor.recordStop();
      this.save(this.recorder.stop(drawing, this.drawOffset));
      this.record.textContent = "●";
      this.record.title = "Record lesson";
      this.record.setAttribute("aria-label", "Record lesson");
      delete this.record.dataset.recording;
    } finally {
      this.busy = false;
      this.record.disabled = false;
    }
  }
  save(take) {
    this.wb.takes ||= {};
    const name = `${String(take.title || "lesson")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}.ams-take.json`;
    this.wb.takes[name] = take;
    this.take = take;
    this.refresh(name);
    this.wb.ctx.persist();
    this.status.textContent = `Saved ${take.clips.length} clips · ${time(take.duration || 0)}. Included in project saves and ZIPs.`;
  }
  refresh(selected) {
    this.select.replaceChildren();
    for (const [name, take] of Object.entries(this.wb.takes || {})) {
      const o = el("option", take.title || name, this.select);
      o.value = name;
    }
    if (selected) this.select.value = selected;
    this.take = this.wb.takes?.[this.select.value];
    document.dispatchEvent(new Event("p5comp:refresh-selects"));
    this.render();
  }
  render() {
    this.review.disabled = !this.take || !!this.recorder.take;
    this.file.disabled = !!this.recorder.take;
    this.select.disabled = !!this.recorder.take;
    this.lanes.replaceChildren();
    const take = this.recorder.take || this.take;
    if (!take) return;
    const clips = flatten(take),
      duration = Math.max(
        1,
        take.duration || 0,
        ...clips.map((c) => c.start + c.dur),
      );
    for (const kind of [...new Set(clips.map((c) => c.track))]) {
      const row = el("div", "", this.lanes);
      row.className = "take-lane";
      el("span", kind, row);
      const strip = el("div", "", row);
      strip.className = "take-strip";
      for (const c of clips.filter((c) => c.track === kind)) {
        const mark = button(
          strip,
          "",
          `${time(c.start)} · ${describe(c)}`,
          () => {
            this.t = c.start;
            this.guard(() => this.openReview());
          },
        );
        mark.style.left = `${(100 * c.start) / duration}%`;
        mark.style.width = `${Math.max(0.4, (100 * c.dur) / duration)}%`;
        mark.dataset.kind = kind;
      }
    }
  }
  export() {
    if (!this.take) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.take, null, 2)], {
        type: "application/json",
      }),
    );
    const a = el("a");
    a.href = url;
    a.download = this.select.value || "lesson.ams-take.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async openReview() {
    if (!this.take || this.recorder.take || this.dialog) return;
    const take = validateTake(this.take),
      flat = flatten(take);
    const dialog = (this.dialog = el("dialog"));
    dialog.className = "take-review";
    document.body.append(dialog);
    const bar = el("div", "", dialog);
    bar.className = "take-tools";
    el("strong", `${take.title} · view only`, bar);
    const play = button(bar, "▶", "Play take", () => {
      if (this.t >= Number(seek.max)) this.t = 0;
      this.playing = !this.playing;
      play.textContent = this.playing ? "Ⅱ" : "▶";
      this.lastFrame = performance.now();
      if (this.playing && take.meta?.p5comp) this.guard(() => runPreview());
    });
    const seek = el("input", "", bar);
    seek.type = "range";
    seek.min = 0;
    seek.max = Math.max(
      take.duration || 0,
      ...flat.map((c) => c.start + c.dur),
      1,
    );
    seek.step = 1;
    seek.setAttribute("aria-label", "Take position");
    const clock = el("output", "", bar);
    const rate = el("select", "", bar);
    rate.setAttribute("aria-label", "Playback speed");
    for (const n of [0.5, 1, 1.5, 2]) {
      const o = el("option", `${n}×`, rate);
      o.value = n;
    }
    rate.value = 1;
    button(bar, "×", "Close review", () => dialog.close());
    const caption = el("p", "", dialog);
    caption.className = "take-caption";
    caption.setAttribute("aria-live", "off");
    const cue = el("p", "", dialog);
    cue.className = "take-cue";
    const targets = el("div", "", dialog);
    targets.className = "take-targets";
    const targetNodes = new Map();
    for (const c of flat.filter((c) => c.track === "action")) {
      const key = c.ui?.target || c.name;
      if (!key || targetNodes.has(key)) continue;
      const label = el("span", describe(c), targets);
      label.dataset.takeTarget = key;
      targetNodes.set(key, label);
    }
    const grid = el("div", "", dialog);
    grid.className = "take-preview-grid";
    const code = el("section", "", grid);
    const files = el("select", "", code);
    files.setAttribute("aria-label", "Recorded file");
    const source = el("pre", "", code);
    source.className = "take-source";
    const visual = el("section", "", grid);
    visual.className = "take-visual";
    const circuit = el("div", "", visual);
    circuit.className = "take-circuit";
    const draw = el("div", "", visual);
    draw.className = "take-drawing";
    const signals = el("output", "", visual);
    signals.className = "take-signals";
    const output = el("section", "", grid);
    const run = button(
      output,
      "▶ Preview sketch",
      "Run recorded p5 in isolated preview",
      () => this.guard(() => runPreview()),
    );
    const frame = el("iframe", "", output);
    frame.title = "Recorded p5 preview";
    frame.setAttribute("sandbox", "allow-scripts");
    const preview = new P5Bridge(frame, {
      onSend() {},
      onSendLine() {},
      onSerialWrite() {},
    });
    let lastCircuit = "",
      lastT = -1,
      signalKey = "",
      drawingEditor,
      drawingBusy = false,
      pendingSeek = null,
      closed = false;
    const queueDrawing = async (t) => {
      pendingSeek = t;
      if (!drawingEditor || drawingBusy) return;
      drawingBusy = true;
      try {
        while (pendingSeek !== null && !closed) {
          const next = pendingSeek;
          pendingSeek = null;
          await drawingEditor.seekTake(next);
        }
      } catch (e) {
        cue.textContent = `Drawing preview: ${e.message}`;
      } finally {
        drawingBusy = false;
      }
    };
    const runPreview = async () => {
      const state = stateAt(take, this.t),
        project = take.meta?.p5comp?.project;
      if (!project) return;
      const name = project.workbench.p5Name || "sketch.js";
      const js =
        Object.entries(state.files)
          .filter(([n]) => n.endsWith(".js") && n !== name)
          .map(([, s]) => s)
          .join("\n") +
        "\n" +
        (state.files[name] || "");

      await preview.run(js, {
        html: state.files["index.html"],
        css: Object.entries(state.files)
          .filter(([n]) => n.endsWith(".css"))
          .map(([, s]) => s)
          .join("\n"),
        assets: project.workbench.assets,
        mainName: name,
        sourceNames: Object.keys(state.files).filter((n) => n.endsWith(".js")),
        p5Major: project.workbench.settings?.p5Major,
        parameters: project.workbench.settings?.p5Parameters,
      });
      preview.updateState(state.signals, true, "simulation");
      run.textContent = "↻ Restart preview";
      signalKey = "";
      const latest = flat
        .filter(
          (c) =>
            !c.muted &&
            c.track === "say" &&
            c.meta?.dir === "rx" &&
            c.start <= this.t,
        )
        .at(-1);
      preview.addEventListener(
        "ready",
        () => {
          if (latest)
            preview.serialBytes(new TextEncoder().encode(latest.text + "\n"));
          for (const [n, v] of Object.entries(stateAt(take, this.t).signals))
            preview.serialBytes(new TextEncoder().encode(`${n}:${v}\n`));
        },
        { once: true },
      );
    };
    const render = () => {
      if (closed) return;
      const state = stateAt(take, this.t),
        names = Object.keys(state.files);
      const selected = files.value;
      if (
        [...files.options].map((o) => o.value).join("|") !== names.join("|")
      ) {
        files.replaceChildren();
        for (const name of names) el("option", name, files).value = name;
        if (names.includes(selected)) files.value = selected;
      }
      source.textContent = state.files[files.value] || "";
      const active = flat.filter(
        (c) => !c.muted && c.start <= this.t && c.start + c.dur > this.t,
      );
      caption.textContent = active
        .filter((c) => ["say", "title"].includes(c.track))
        .map((c) => c.text)
        .join(" · ");
      cue.textContent = active
        .filter((c) => c.track === "action")
        .map((c) => `◉ ${describe(c)}`)
        .join(" · ");
      for (const [key, node] of targetNodes)
        node.classList.toggle(
          "active",
          active.some(
            (c) => c.track === "action" && (c.ui?.target || c.name) === key,
          ),
        );
      signals.textContent = Object.entries(state.signals)
        .map(([n, v]) => `${n}: ${v}`)
        .join("   ");
      const diagram = JSON.stringify(state.diagram);
      if (diagram !== lastCircuit) {
        lastCircuit = diagram;
        circuit.replaceChildren(renderTakeCircuit(state.diagram));
      }
      if (preview.source) {
        preview.updateState(state.signals, true, "simulation");
        // Feed only recorded received lines. Preview output callbacks never reach hardware.
        if (this.t >= lastT)
          for (const c of flat)
            if (
              !c.muted &&
              c.track === "say" &&
              c.meta?.dir === "rx" &&
              c.start > lastT &&
              c.start <= this.t
            )
              preview.serialBytes(new TextEncoder().encode(c.text + "\n"));
        const nextKey = JSON.stringify(state.signals);
        if (nextKey !== signalKey) {
          signalKey = nextKey;
          for (const [name, value] of Object.entries(state.signals))
            preview.serialBytes(new TextEncoder().encode(`${name}:${value}\n`));
        }
        if (
          this.playing &&
          flat.some(
            (c) =>
              !c.muted &&
              c.track === "action" &&
              c.ui?.target === "runP5" &&
              c.start > lastT &&
              c.start <= this.t,
          )
        )
          this.guard(() => runPreview());
      }
      lastT = this.t;
      seek.value = this.t;
      clock.textContent = `${time(this.t)} / ${time(Number(seek.max))}`;
      queueDrawing(this.t);
    };
    files.onchange = render;
    seek.oninput = () => {
      this.t = Number(seek.value);
      lastT = this.t;
      render();
    };
    seek.onchange = () => {
      if (preview.source) this.guard(() => runPreview());
    };
    preview.addEventListener("runtimeError", (e) => {
      cue.textContent = `Sketch preview: ${e.detail.message}`;
    });
    dialog.onclose = () => {
      closed = true;
      this.playing = false;
      cancelAnimationFrame(this.raf);
      preview.stop();
      preview.dispose();
      drawingEditor?.destroy();
      dialog.remove();
      this.dialog = null;
    };
    dialog.showModal();
    render();
    // Reuse AMS's renderer, rather than maintaining a fork of its document/drawing player.
    try {
      const js = await (
        await fetch(basePath("vendor/ams-editor/ams-editor.js"))
      ).text();
      const url = URL.createObjectURL(
        new Blob([js], { type: "text/javascript" }),
      );
      let createEditor;
      try {
        ({ createEditor } = await import(/* @vite-ignore */ url));
      } finally {
        URL.revokeObjectURL(url);
      }
      if (closed) return;
      drawingEditor = await createEditor(draw, {
        src: basePath("vendor/ams-editor/embed.html"),
        ns: `take-${crypto.randomUUID()}`,
        clock: "host",
        transport: false,
        ui: { tools: false, view: false, zoom: false, panels: false },
      });
      if (closed) {
        drawingEditor.destroy();
        return;
      }
      await drawingEditor.loadTake(take);
      await drawingEditor.fit();
      queueDrawing(this.t);
    } catch (e) {
      cue.textContent = `Drawing preview unavailable: ${e.message}`;
    }
    const tick = (now) => {
      if (closed) return;
      if (this.playing) {
        if (this.t >= Number(seek.max)) {
          this.playing = false;
          play.textContent = "▶";
        } else {
          this.t = Math.min(
            Number(seek.max),
            this.t + Math.min(100, now - this.lastFrame) * Number(rate.value),
          );
          render();
        }
      }
      this.lastFrame = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(tick);
  }
}
