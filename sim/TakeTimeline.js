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
import { ensureSections } from "../shared/takes/edit.js";
import { PageCapture } from "./PageCapture.js";
import { TimelineEditor } from "./TimelineEditor.js";
import { portableTake, localTake } from "../shared/takes/frameStore.js";
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
    this.panel = wb.bottom.querySelector('[data-tool="timeline"]');
    this.panel.classList.add("take-panel");
    this.header = el("div", "", this.panel);
    this.header.className = "take-tools";
    this.title = el("input", "", this.header);
    this.title.placeholder = "Recording title";
    this.title.setAttribute("aria-label", "Take title");
    this.record = button(this.header, "●", "Record page", () =>
      this.guard(() => (this.recorder.take ? this.stop() : this.start())),
    );
    this.select = el("select", "", this.header);
    this.select.setAttribute("aria-label", "Saved takes");
    this.select.onchange = () => {
      const name = this.select.value;
      this.editor?.exit();
      this.select.value = name;
      this.take = this.wb.takes[name];
      this.t = 0;
      this.editor?.load();
      this.render();
    };
    this.review = button(this.header, "≡", "Inspect recording", () =>
      this.guard(() => this.openInspector()),
    );
    button(this.header, "↓", "Export take JSON", () =>
      this.guard(() => this.export()),
    );
    this.htmlExport = button(
      this.header,
      "HTML ↓",
      "Export playable HTML",
      () => this.guard(() => this.exportPortable("html")),
    );
    this.mp4Export = button(this.header, "MP4 ↓", "Export MP4 in browser", () =>
      this.guard(() => this.exportPortable("mp4")),
    );
    this.cancelExport = button(this.header, "Cancel", "Cancel export", () =>
      this.exportController?.abort(),
    );
    this.cancelExport.hidden = true;
    this.wb.ctx.bridge.addEventListener("mirrorFrame", (event) => {
      if (
        !this.recorder.take ||
        performance.now() - (this.lastFrameAt || 0) < 200 ||
        event.detail.image === this.lastFrameSource
      )
        return;
      const src = event.detail.image;
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(src)) return;
      this.lastFrameAt = performance.now();
      this.lastFrameSource = src;
      this.recorder.push({ track: "frame", channel: "p5", src, dur: 200 });
    });
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
        if (file.size > 512000000)
          throw new Error("Take files must be under 512 MB.");
        await this.save(validateTake(JSON.parse(await file.text())));
        this.file.value = "";
      });
    button(this.header, "↑", "Import take JSON", () => this.file.click());
    this.captionInput = el("input", "", this.panel);
    this.captionInput.placeholder =
      "Caption / narration text — Enter to add while recording";
    this.captionInput.setAttribute("aria-label", "Lesson caption");
    this.captionInput.hidden = true;
    button(this.header, "CC", "Show caption input", () => {
      this.captionInput.hidden = !this.captionInput.hidden;
      if (!this.captionInput.hidden) this.captionInput.focus();
    });
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
      "Record the page above this tab, then play, edit sections, or export.",
      this.panel,
    );
    this.status.setAttribute("role", "status");
    this.capture = new PageCapture(wb);
    this.editor = new TimelineEditor(this);
    this.captureTimer = setInterval(() => {
      if (
        this.recorder.take &&
        !this.capture.busy &&
        !this.stopping &&
        !this.captureWarning
      )
        this.guard(() => this.capturePage());
    }, 500);
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
        if (
          !this.recorder.take ||
          this.panel.contains(e.target) ||
          e.target.closest('[data-bottom="timeline"]')
        )
          return;
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
      controls: structuredClone(p.controls || {}),
      page: {
        name: this.wb.name,
        layout: this.wb.layout,
        activeView: this.wb.activeView,
        settings: structuredClone(this.wb.settings),
        references: structuredClone(this.wb.references),
        canvas: this.wb.ctx.canvas.getState(),
        inspector: this.wb.editorPanel.querySelector(
          '[data-tab][aria-selected="true"]',
        )?.dataset.tab,
        inspectorHidden: this.wb.editorPanel.hidden,
        arduinoFile: this.wb.arduinoBar.querySelector('[aria-selected="true"]')
          ?.dataset.file,
        p5File: this.wb.p5Bar.querySelector('[aria-selected="true"]')?.dataset
          .file,
        drawing: this.wb.drawing.snapshot(),
      },
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
  async capturePage() {
    const take = this.recorder.take;
    if (!take) return;
    const start = Math.max(0, this.recorder.now() - this.recorder.t0);
    let image;
    try {
      image = await this.capture.capture();
    } catch (error) {
      this.captureWarning = `Page pixels could not be captured: ${error.message}. Editable state is still being recorded.`;
      this.status.textContent = this.captureWarning;
      return;
    }
    if (image && this.recorder.take === take)
      this.recorder.push({
        track: "frame",
        channel: "page",
        ...image,
        start,
        dur: 1,
      });
  }
  async start() {
    if (this.busy) return;
    this.editor?.exit();
    this.t = 0;
    this.captureWarning = null;
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
      this.mirrorWasOn = this.wb.ctx.bridge.mirroring;
      this.lastFrameAt = 0;
      this.lastFrameSource = null;
      this.wb.ctx.bridge.mirror(true);
      this.recorder.take.meta.capture = {
        mode: "page",
        drawerExcluded: true,
        sampled: true,
      };
      await this.capturePage();
      this.record.textContent = "■";
      this.record.title = "Stop and save take";
      this.record.setAttribute("aria-label", "Stop and save take");
      this.record.dataset.recording = "true";
      this.render();
      this.status.textContent =
        this.captureWarning ||
        "Recording the page and editable state. The timeline drawer is excluded.";
    } finally {
      this.busy = false;
      this.record.disabled = false;
    }
  }
  async stop() {
    if (this.busy) return;
    this.busy = true;
    this.stopping = true;
    this.record.disabled = true;
    try {
      this.observe();
      if (this.capture.busy) {
        while (this.capture.busy)
          await new Promise((resolve) => setTimeout(resolve, 30));
      }
      await this.capturePage();
      const elapsed = this.recorder.now() - this.recorder.t0;
      const { take: drawing } = await this.wb.drawing.editor.recordStop();
      const pass = this.recorder.stop(drawing, this.drawOffset, {
        compressIdle: false,
      });
      pass.duration = Math.max(pass.duration, elapsed);
      await this.save(this.editor.finishPass(pass));
      if (!this.mirrorWasOn) this.wb.ctx.bridge.mirror(false);
      this.record.textContent = "●";
      this.record.title = "Record page";
      this.record.setAttribute("aria-label", "Record page");
      delete this.record.dataset.recording;
    } finally {
      this.busy = false;
      this.record.disabled = false;
      this.stopping = false;
    }
  }
  async save(take) {
    take = await localTake(take);
    if (take.meta?.capture?.mode === "page") take = ensureSections(take);
    this.wb.takes ||= {};
    const name = `${String(take.title || "lesson")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}.ams-take.json`;
    this.wb.takes[name] = take;
    this.take = take;
    this.refresh(name);
    this.editor.load();
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
    this.htmlExport.disabled = this.mp4Export.disabled =
      !this.take || !!this.recorder.take || !!this.exportController;
    this.record.disabled = !!this.busy || !!this.exportController;
    this.file.disabled = !!this.recorder.take;
    this.select.disabled = !!this.recorder.take;
    this.lanes.replaceChildren();
    this.editor?.update();
    const take = this.recorder.take || this.take;
    if (!take) return;
    const clips = take.meta?.sectionEdit ? take.clips : flatten(take),
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
        if (kind === "comp" && take.meta?.sectionEdit) {
          mark.textContent = c.label || "Section";
          mark.onclick = (e) => e.preventDefault();
          this.editor.bindSection(mark, c, duration);
        }
      }
    }
  }
  async export() {
    if (!this.take) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            await portableTake(this.take, { compact: true }),
            null,
            2,
          ),
        ],
        {
          type: "application/json",
        },
      ),
    );
    const a = el("a");
    a.href = url;
    a.download = this.select.value || "lesson.ams-take.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async exportPortable(format) {
    if (!this.take || this.recorder.take || this.exportController) return;
    let take;
    const controller = (this.exportController = new AbortController());
    this.cancelExport.hidden = false;
    this.render();
    try {
      take = await portableTake(
        await this.editor.prepareExport(this.take, controller.signal),
        { compact: true },
      );
      const drawingResponse = await fetch(
        basePath("vendor/ams-editor/take-renderer.js"),
        { signal: controller.signal },
      );
      if (!drawingResponse.ok)
        throw new Error(
          "Drawing export runtime is missing. Run npm run vendor:ams-take.",
        );
      const drawingScript = await drawingResponse.text();
      let blob;
      if (format === "html") {
        const { takeToHTML } = await import("../shared/takes/exportHTML.js");
        blob = new Blob([takeToHTML(take, { drawingScript })], {
          type: "text/html",
        });
      } else {
        // The same renderer is embedded into HTML; the FFmpeg runtime is only loaded for MP4.
        const runtimeURL = URL.createObjectURL(
          new Blob([drawingScript + "\nexport default AMSDrawingRenderer;"], {
            type: "text/javascript",
          }),
        );
        let drawingRenderer;
        try {
          drawingRenderer = (await import(/* @vite-ignore */ runtimeURL))
            .default;
        } finally {
          URL.revokeObjectURL(runtimeURL);
        }
        const { takeToMP4 } = await import("../shared/takes/exportMP4.js");
        blob = await takeToMP4(take, {
          drawingRenderer,
          signal: controller.signal,
          onProgress: (message) => (this.status.textContent = message),
        });
      }
      controller.signal.throwIfAborted();
      const name =
        String(take.title || "lesson")
          .replace(/[^a-z0-9_-]+/gi, "-")
          .slice(0, 80) +
        "." +
        format;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.status.textContent = `Exported ${format.toUpperCase()} · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
    } catch (error) {
      if (controller.signal.aborted)
        this.status.textContent = "Export cancelled.";
      else throw error;
    } finally {
      this.exportController = null;
      this.cancelExport.hidden = true;
      this.render();
    }
  }
  async openReview() {
    return this.editor.seek(this.t);
  }
  async openInspector() {
    if (!this.take || this.recorder.take || this.dialog) return;
    const take = validateTake(this.take),
      flat = flatten(take),
      recordedFrames = flat.filter(
        (c) =>
          !c.muted &&
          c.track === "frame" &&
          c.channel === "p5" &&
          /^data:image\/(png|jpeg|webp);base64,/.test(c.src),
      );
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
      if (this.playing && take.meta?.p5comp && !recordedFrames.length)
        this.guard(() => runPreview());
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
    const hasDrawing =
      Boolean(take.baseline?.elements?.length) ||
      flat.some((c) => !c.muted && c.track === "draw");
    const draw = el("div", "", visual);
    draw.className = "take-drawing";
    draw.hidden = !hasDrawing;
    visual.classList.toggle("take-visual-no-drawing", !hasDrawing);
    const signals = el("output", "", visual);
    signals.className = "take-signals";
    const output = el("section", "", grid);
    const run = button(
      output,
      "▶ Preview sketch",
      "Run recorded p5 in isolated preview",
      () => this.guard(() => runPreview()),
    );
    const captured = el("img", "", output);
    captured.className = "take-recorded-frame";
    captured.alt = "Recorded p5 output";
    captured.hidden = true;
    const outputHint = el(
      "p",
      "The p5 sketch starts later in this lesson.",
      output,
    );
    outputHint.hidden = !recordedFrames.length;
    const frame = el("iframe", "", output);
    frame.hidden = !!recordedFrames.length;
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
      closed = false,
      chosenFile = false;
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
      captured.hidden = true;
      outputHint.hidden = true;
      preview.frame.hidden = false;
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
      if (!chosenFile) {
        const edit = flat
          .filter((c) => !c.muted && c.track === "code" && c.start <= this.t)
          .at(-1);
        const file =
          edit?.file ||
          take.meta?.p5comp?.project?.workbench?.arduinoName ||
          "sketch.ino";
        if (names.includes(file)) files.value = file;
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
      if (recordedFrames.length && !preview.source) {
        const shot = recordedFrames.filter((c) => c.start <= this.t).at(-1);
        captured.hidden = !shot;
        outputHint.hidden = !!shot;
        if (shot && captured.getAttribute("src") !== shot.src)
          captured.src = shot.src;
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
    files.onchange = () => {
      chosenFile = true;
      render();
    };
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
    // Only mount the drawing renderer when the take actually contains a drawing.
    if (hasDrawing)
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
