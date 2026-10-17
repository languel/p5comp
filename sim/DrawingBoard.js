/**
 * Drawing on the circuit (and, as the Draw tab, on its own): the Artist Model Studio drawing editor as a transparent layer over the circuit canvas
 * (public/vendor/ams-editor/, see docs/drawing.md). One pencil button in the canvas tools switches the layer on:
 * the pointer then draws instead of moving parts, and the editor's own tools appear. Switched off, the drawing
 * stays visible and the circuit is edited as before. The two views share one camera (pan and zoom either way), the
 * project owns the drawing (workbench.snapshot().drawing). The editor's right-click menu has "Save selection as PNG / SVG
 * to assets" (the whole drawing when nothing is selected): the file becomes a project asset the p5 sketch loads by name. The Draw tab shows the same editor and drawing over the whole work area, with its own camera.
 */
import { basePath } from "../shared/basePath.js";

const EDITOR_URL = basePath("vendor/ams-editor/");
// One big transparent board under everything: marks need a home, and nothing of it is drawn.
const BOARD = { id: "main", title: "drawing", width: 2400, height: 1600, ground: "transparent", hideBorder: true, hideLabel: true };
const ACTIONS = [
  { id: "png", label: "Save selection as PNG to assets", hint: "The selected marks (the whole drawing when nothing is selected) as a transparent PNG project asset the p5 sketch can load" },
  { id: "svg", label: "Save selection as SVG to assets", hint: "The same as an SVG project asset" },
];
const hasMarks = (doc) => Boolean(doc?.elements?.length);

export class DrawingBoard {
  constructor({ workspace, stage, canvas, tools, persist, addAsset, assetNames }) {
    Object.assign(this, { workspace, stage, canvas, persist, addAsset, assetNames });
    this.tab = false;
    this.circuitShown = true;
    this.doc = null;
    this.active = false;
    this.layer = document.createElement("div");
    this.layer.className = "draw-layer";
    this.layer.hidden = true;
    workspace.append(this.layer);   // (never moved: an iframe that moves in the page starts again)
    this.status = document.createElement("div");   // a message that goes away by itself
    this.status.className = "draw-status";
    this.status.setAttribute("role", "status");
    this.layer.append(this.status);
    this.toggle = document.createElement("button");
    this.toggle.id = "drawLayer";
    this.toggle.setAttribute("aria-pressed", "false");
    this.toggle.title = "Draw on the circuit: pen, brushes, shapes and colors in a layer over it";
    this.toggle.setAttribute("aria-label", "Draw on the circuit");
    this.toggle.textContent = "✎";
    this.toggle.onclick = () => this.setActive(!this.active);
    tools.append(this.toggle);
    new ResizeObserver(() => this.place()).observe(stage);
    new ResizeObserver(() => this.place()).observe(workspace);
    // Alt+Z: the drawing layer and its toolbar on or off (in the Draw tab the editor's own zen works).
    window.addEventListener("keydown", (e) => this.key(e));
    // The circuit's camera goes to the editor.
    const view = canvas.onViewChange;
    canvas.onViewChange = (...a) => { view?.(...a); this.follow(); };
  }

  key(e) {
    const alt = e.altKey ?? e.alt;
    if (!alt || e.code !== "KeyZ" || e.ctrlKey || e.metaKey || this.tab) return;
    if (e.target?.closest?.("input, textarea, select, [contenteditable], .cm-editor")) return;
    e.preventDefault?.();
    this.setActive(!this.active);
  }

  /** The drawing for the project file (null until something was drawn or loaded). */
  snapshot() {
    return this.doc;
  }

  /** A project was opened: its drawing (or none) replaces the current one. */
  load(doc) {
    this.doc = doc || null;
    if (this.editor) this.editor.load(this.doc || {}).catch(() => {});
    else if (hasMarks(this.doc)) this.start();   // its marks should show
    this.place();
  }

  /** The main view changed: tab (the Draw tab is showing) and circuit (the circuit view is showing). */
  setView({ tab, circuit }) {
    const was = this.tab;
    this.tab = tab;
    this.circuitShown = circuit;
    // The Draw tab is the editor on its own, with the studio's interface (menu, zoom, panels, zen); drawing on the
    // circuit is a bare layer, and the circuit owns the view.
    if (tab) this.start().then(() => { this.applyUI(); this.editor?.focus(); });
    else if (was) { this.applyUI().then(() => this.follow(true)); }
    this.place();
  }

  /** The layer sits over the circuit's stage, or over the whole work area in the Draw tab; hidden when neither shows. */
  place() {
    const shown = this.tab || (this.circuitShown && (this.editor || hasMarks(this.doc) || this.active));
    this.layer.hidden = !shown;
    this.layer.classList.toggle("tab", this.tab);
    const on = this.active || this.tab;
    this.layer.classList.toggle("active", on);
    this.toggle.hidden = this.tab;
    if (this.tab) {
      Object.assign(this.layer.style, { left: "0", top: "0", width: "100%", height: "100%" });
      return;
    }
    const ws = this.workspace.getBoundingClientRect(), r = this.stage.getBoundingClientRect();
    Object.assign(this.layer.style, { left: `${r.left - ws.left}px`, top: `${r.top - ws.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  setActive(on) {
    this.active = on;
    this.toggle.setAttribute("aria-pressed", String(on));
    this.place();
    if (on) this.start().then(() => { this.applyUI(); this.editor?.focus(); });
    else {
      this.applyUI();
      this.editor?.getDocument().then((r) => this.remember(r)).catch(() => {});
    }
  }

  /** What the editor shows, one request after another so they cannot overtake each other. */
  applyUI() {
    const editor = this.editor;
    if (!editor) return Promise.resolve();
    const tab = this.tab, tools = this.active || tab;
    this.uiChain = (this.uiChain || Promise.resolve()).then(async () => {
      await editor.setMode(tab ? "standalone" : "overlay");
      await editor.setUI(tab ? { tools: true, view: true, zoom: true, panels: true } : { tools, view: false, zoom: false, panels: false });
    }).catch(() => {});
    return this.uiChain;
  }

  async start() {
    if (this.editor) return;
    if (this.starting) return this.starting;
    this.say("Starting the drawing editor…");
    this.starting = (async () => {
      try {
        // (The client is one file with no imports. It is read as text and imported from a blob, because Vite's dev
        // server will not import scripts from /public; a built site could import it directly.)
        const source = await (await fetch(EDITOR_URL + "ams-editor.js")).text();
        const { createEditor } = await import(/* @vite-ignore */ URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
        const editor = await createEditor(this.layer, {
          src: EDITOR_URL + "embed.html",
          ns: "p5comp-draw",
          boards: [BOARD],
          document: this.doc || undefined,
          overlay: true,
          ui: { tools: this.active || this.tab },
          actions: ACTIONS,
          camera: this.camera(),
        });
        this.editor = editor;
        this.applyUI();
        editor.on("change", () => this.changed());
        editor.on("action", (m) => this.save(m.id, m.ids));
        editor.on("key", (m) => this.key(m));   // keys the editor does not use (Alt+Z in the layer)
        // The editor's own pans and zooms go to the circuit.
        editor.on("camera", (m) => this.lead(m));
        this.say("");
      } catch (error) {
        this.say("The drawing editor is not installed: run npm run vendor:ams", 12000);
        console.warn("Drawing editor:", error);
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  camera() {
    const { x, y, zoom } = this.canvas.camera;
    return { x, y, z: zoom };
  }

  follow(force = false) {
    if (this.applying || (this.tab && !force)) return;
    this.editor?.camera(this.camera()).catch(() => {});
  }

  lead({ x, y, z }) {
    if (this.tab) return;   // the Draw tab has its own view
    const c = this.canvas;
    this.applying = true;
    c.camera.x = x;
    c.camera.y = y;
    c.camera.zoom = Math.max(0.15, Math.min(4, z));
    c.view();
    this.applying = false;
  }

  changed() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        this.remember(await this.editor.getDocument());
      } catch { /* the editor went away */ }
    }, 500);
  }

  remember({ document }) {
    this.doc = document;
    this.persist();
  }

  /** A message beside the buttons; it goes away by itself (the one for a failure stays longer). */
  say(text, ms = 3500) {
    clearTimeout(this.sayTimer);
    this.status.textContent = text;
    if (text) this.sayTimer = setTimeout(() => (this.status.textContent = ""), ms);
  }

  /** A right-click choice: the selected marks (or the whole drawing) become a PNG or SVG project asset. */
  async save(kind, ids) {
    try {
      const r = await this.editor.export(ids?.length ? { format: kind, ids, scale: 1 } : { board: BOARD.id, format: kind, scale: 1, transparent: true });
      const out = r.blob || new Blob([r.text], { type: "image/svg+xml" });   // (the whole drawing's SVG comes back as text)
      const name = this.assetNames(`drawing.${kind}`);
      await this.addAsset(name, out);
      this.say(`${name} is in the project assets: loadImage('${name}')`);
    } catch (error) {
      this.say(`Could not save: ${error.message}`, 8000);
    }
  }
}
