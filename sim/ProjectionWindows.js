import { circuitSVG } from "./exportCircuit.js";
export class ProjectionWindows {
  constructor(ctx, getReferences) {
    this.ctx = ctx;
    this.getReferences = getReferences;
    this.windows = new Map();
    ctx.bridge.addEventListener("mirrorFrame", (e) =>
      this.update("p5", e.detail.image),
    );
    ctx.bridge.addEventListener("mirrorError", (e) =>
      ctx.notice(e.detail.message),
    );
    this.dirty = true;
    this.observer = new MutationObserver(() => (this.dirty = true));
    this.roots = new WeakSet();
    this.observer.observe(document.getElementById("world"), {
      subtree: true,
      childList: true,
      attributes: true,
    });
    this.observer.observe(document.getElementById("stage"), {
      attributes: true,
    });
    document.addEventListener(
      "physical-p5:themechange",
      () => (this.dirty = true),
    );
    this.timer = setInterval(() => this.tick(), 250);
    window.addEventListener("beforeunload", () => {
      for (const win of this.windows.values()) win.close();
      this.observer.disconnect();
      clearInterval(this.timer);
    });
  }
  open(kind) {
    const current = this.windows.get(kind);
    if (current && !current.closed) {
      current.focus();
      return;
    }
    const win = window.open(
      "",
      `p5comp-${kind}-projection`,
      "width=960,height=720",
    );
    if (!win) {
      this.ctx.notice("Allow popups to open a projection window.");
      return;
    }
    win.document.title = `p5comp — ${kind === "p5" ? "p5 render" : "circuit"} mirror`;
    win.document.body.innerHTML =
      '<main><img alt="Mirrored ' +
      kind +
      ' view"><p>Waiting for editor…</p></main><button title="Fullscreen" aria-label="Fullscreen">⛶</button>';
    win.document.body.style.cssText =
      "margin:0;background:#1b1e1c;height:100vh;overflow:hidden;font:14px sans-serif;color:#9da69f";
    const main = win.document.querySelector("main");
    main.style.cssText =
      "width:100%;height:100%;display:grid;place-items:center";
    const image = win.document.querySelector("img");
    image.style.cssText =
      "width:100%;height:100%;object-fit:contain;grid-area:1/1;display:none";
    const hint = win.document.querySelector("p");
    hint.style.gridArea = "1/1";
    const full = win.document.querySelector("button");
    full.style.cssText =
      "position:fixed;right:12px;top:12px;background:#222623;color:#d7ded9;border:1px solid #383e3a;border-radius:4px;font-size:20px;cursor:pointer";
    full.onclick = () => win.document.documentElement.requestFullscreen();
    image.onload = () => {
      const button = document.getElementById(
        kind === "p5" ? "projectP5" : "projectCircuit",
      );
      button.dataset.frames = String(Number(button.dataset.frames || 0) + 1);
      button.setAttribute("aria-pressed", "true");
      button.title = `Mirror ${kind} · live`;
    };
    this.windows.set(kind, win);
    win.addEventListener("beforeunload", () => {
      if (this.windows.get(kind) === win) this.windows.delete(kind);
      if (kind === "p5") this.ctx.bridge.mirror(false);
      document
        .getElementById(kind === "p5" ? "projectP5" : "projectCircuit")
        .setAttribute("aria-pressed", "false");
    });
    if (kind === "p5") this.ctx.bridge.mirror(true);
    else {
      this.dirty = true;
      this.tick();
    }
  }
  update(kind, data) {
    const win = this.windows.get(kind);
    if (!win || win.closed) return;
    const image = win.document.querySelector("img");
    image.src = data;
    image.style.display = "block";
    win.document.querySelector("p").hidden = true;
  }
  tick() {
    const win = this.windows.get("circuit");
    if (!win || win.closed) return;
    for (const native of document.querySelectorAll("#parts .part-body > *"))
      if (native.shadowRoot && !this.roots.has(native.shadowRoot)) {
        this.roots.add(native.shadowRoot);
        this.observer.observe(native.shadowRoot, {
          subtree: true,
          childList: true,
          attributes: true,
        });
      }
    if (!this.dirty) return;
    this.dirty = false;
    const stage = document.getElementById("stage"),
      w = stage.clientWidth,
      h = stage.clientHeight;
    if (!w || !h) {
      this.dirty = true;
      return;
    }
    const { svg } = circuitSVG(
      this.ctx.project().diagram,
      this.getReferences(),
      getComputedStyle(stage).backgroundColor,
    );
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml"),
      root = parsed.documentElement;
    root.setAttribute("width", w);
    root.setAttribute("height", h);
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const rect = root.querySelector("rect");
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    const camera = this.ctx.canvas.camera;
    root
      .querySelector("g")
      .setAttribute(
        "transform",
        `translate(${camera.x},${camera.y}) scale(${camera.zoom})`,
      );
    if (!stage.classList.contains("grid-none")) {
      const style = getComputedStyle(stage),
        pitch = parseFloat(style.backgroundSize),
        origin = style.backgroundPosition.split(" ").map(parseFloat),
        ns = "http://www.w3.org/2000/svg";
      if (pitch > 0) {
        const defs = parsed.createElementNS(ns, "defs"),
          pattern = parsed.createElementNS(ns, "pattern");
        pattern.id = "projection-grid";
        pattern.setAttribute("patternUnits", "userSpaceOnUse");
        pattern.setAttribute("width", pitch);
        pattern.setAttribute("height", pitch);
        pattern.setAttribute("x", origin[0] || 0);
        pattern.setAttribute("y", origin[1] || 0);
        const dot = parsed.createElementNS(ns, "circle");
        dot.setAttribute("cx", pitch / 2);
        dot.setAttribute("cy", pitch / 2);
        dot.setAttribute("r", 0.7);
        dot.setAttribute("fill", style.getPropertyValue("--ui-grid").trim());
        pattern.append(dot);
        defs.append(pattern);
        root.prepend(defs);
        const grid = parsed.createElementNS(ns, "rect");
        grid.setAttribute("width", w);
        grid.setAttribute("height", h);
        grid.setAttribute("fill", "url(#projection-grid)");
        root.insertBefore(grid, root.querySelector("g"));
      }
    }
    this.update(
      "circuit",
      "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(new XMLSerializer().serializeToString(root)),
    );
  }
}
