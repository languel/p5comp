/**
 * Drawing on the circuit (and, as the Draw tab, on its own): the Artist Model Studio drawing editor as a transparent layer over the circuit canvas
 * (public/vendor/ams-editor/, see docs/drawing.md). One pencil button in the canvas tools switches the layer on:
 * the pointer then draws instead of moving parts, and the editor's own tools appear. Switched off, the drawing
 * stays visible and the circuit is edited as before. The two views share one camera (pan and zoom either way), the
 * project owns the drawing (workbench.snapshot().drawing), and a PNG of it can become a project asset the p5 sketch
 * loads by name. The Draw tab shows the same editor and drawing over the whole work area, with its own camera.
 */
import { basePath } from "../shared/basePath.js";

const EDITOR_URL = basePath("vendor/ams-editor/");
// One big transparent board under everything: marks need a home, and nothing of it is drawn.
const BOARD = { id: "main", title: "drawing", width: 2400, height: 1600, ground: "transparent", hideBorder: true, hideLabel: true };
const ASSET = "drawing.png";
const hasMarks = (doc) => Boolean(doc?.elements?.length);

export class DrawingBoard {
  constructor({ workspace, stage, canvas, tools, persist, addAsset }) {
    Object.assign(this, { workspace, stage, canvas, persist, addAsset });
    this.tab = false;
    this.circuitShown = true;
    this.doc = null;
    this.active = false;
    this.layer = document.createElement("div");
    this.layer.className = "draw-layer";
    this.layer.hidden = true;
    workspace.append(this.layer);   // (never moved: an iframe that moves in the page starts again)
    this.bar = document.createElement("div");
    this.bar.className = "draw-tools";
    this.bar.hidden = true;
    this.bar.innerHTML =
      '<button data-draw="asset" title="Put a PNG of the drawing in the project assets, so the p5 sketch can load it: loadImage(\'drawing.png\')" aria-label="Use as p5 image">▣ p5 image</button>' +
      '<button data-draw="svg" title="Save the drawing as SVG" aria-label="Save SVG">SVG</button>' +
      '<span class="draw-status" role="status"></span>';
    this.layer.append(this.bar);
    this.status = this.bar.querySelector(".draw-status");
    this.bar.querySelector('[data-draw="asset"]').onclick = () => this.useInP5();
    this.bar.querySelector('[data-draw="svg"]').onclick = () => this.saveSVG();
    this.toggle = document.createElement("button");
    this.toggle.id = "drawLayer";
    this.toggle.setAttribute("aria-pressed", "false");
    this.toggle.title = "Draw on the circuit: pen, brushes, shapes and colors in a layer over it";
    this.toggle.setAttribute("aria-label", "Draw on the circuit");
    this.toggle.textContent = "✎ Draw";
    this.toggle.onclick = () => this.setActive(!this.active);
    tools.append(this.toggle);
    new ResizeObserver(() => this.place()).observe(stage);
    new ResizeObserver(() => this.place()).observe(workspace);
    // The circuit's camera goes to the editor.
    const view = canvas.onViewChange;
    canvas.onViewChange = (...a) => { view?.(...a); this.follow(); };
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
    if (tab) this.start().then(() => this.editor?.setUI({ tools: true }).then(() => this.editor.focus()));
    else if (was) { this.editor?.setUI({ tools: this.active }); this.follow(true); }
    this.place();
  }

  /** The layer sits over the circuit's stage, or over the whole work area in the Draw tab; hidden when neither shows. */
  place() {
    const shown = this.tab || (this.circuitShown && (this.editor || hasMarks(this.doc) || this.active));
    this.layer.hidden = !shown;
    this.layer.classList.toggle("tab", this.tab);
    const on = this.active || this.tab;
    this.layer.classList.toggle("active", on);
    this.bar.hidden = !on;
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
    if (on) this.start().then(() => this.editor?.setUI({ tools: true }).then(() => this.editor.focus()));
    else {
      this.editor?.setUI({ tools: false });
      this.editor?.getDocument().then((r) => this.remember(r)).catch(() => {});
    }
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
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
          boards: [BOARD],
          document: this.doc || undefined,
          overlay: true,
          ui: { tools: this.active },
          camera: this.camera(),
        });
        this.editor = editor;
        editor.on("change", () => this.changed());
        // The editor's own pans and zooms go to the circuit.
        editor.on("camera", (m) => this.lead(m));
        new MutationObserver(() =>
          editor.setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
        ).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        this.say("");
      } catch (error) {
        this.say("The drawing editor is not installed: run npm run vendor:ams");
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

  say(text) {
    this.status.textContent = text;
  }

  async useInP5() {
    if (!this.editor) return this.say("Open the drawing first.");
    const { blob } = await this.editor.export({ board: BOARD.id, format: "png", scale: 1, transparent: true });
    await this.addAsset(ASSET, blob);
    this.say(`${ASSET} is in the project assets: loadImage('${ASSET}')`);
  }

  async saveSVG() {
    if (!this.editor) return this.say("Open the drawing first.");
    const { text } = await this.editor.export({ board: BOARD.id, format: "svg" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    a.download = "drawing.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
