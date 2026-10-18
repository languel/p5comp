import { circuitSVG } from "./exportCircuit.js";
export class ProjectionWindows {
  constructor(ctx, getReferences) {
    this.ctx = ctx;
    this.getReferences = getReferences;
    this.windows = new Map();
    ctx.bridge.addEventListener("mirrorFrame", (e) =>
      this.update("p5", e.detail.image, e.detail.controls),
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
      "margin:0;background:#1c1c1e;height:100vh;overflow:hidden;font:14px sans-serif;color:#a1a1a5";
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
      "position:fixed;right:12px;top:12px;background:#242426;color:#d8d8da;border:1px solid #3d3d40;border-radius:4px;font-size:20px;cursor:pointer";
    full.onclick = () => win.document.documentElement.requestFullscreen();
    image.onload = () => {
      const button = document.getElementById(
        kind === "p5" ? "projectP5" : "projectCircuit",
      );
      button.dataset.frames = String(Number(button.dataset.frames || 0) + 1);
      button.setAttribute("aria-pressed", "true");
      button.title = `Mirror ${kind} · live`;
    };
    if (kind === 'p5') {
      win.document.body.style.display = 'flex';
      win.document.body.style.flexDirection = 'column';
      main.style.height = '0';
      main.style.minHeight = '0';
      main.style.flex = '1';
      const toolbar = win.document.createElement('nav');
      toolbar.setAttribute('aria-label', 'Sketch controls');
      toolbar.style.cssText = 'order:-1;flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 52px 10px 10px;background:#242424;color:#ddd;font:12px monospace';
      toolbar.hidden = true;
      win.document.body.append(toolbar);
    }
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
  update(kind, data, controls = []) {
    const win = this.windows.get(kind);
    if (!win || win.closed) return;
    const toolbar = win.document.querySelector('nav');
    if (toolbar) {
      const signature = JSON.stringify(controls.map(c => [c.id,c.tag,c.text,c.options]));
      if (toolbar.dataset.signature !== signature) {
        toolbar.replaceChildren();
        toolbar.dataset.signature = signature;
        for (const c of controls) {
          const el = win.document.createElement(c.tag);
          el.dataset.controlId = c.id;
          if (c.tag === 'input') el.type = 'range';
          if (c.tag === 'button') el.textContent = c.text;
          if (c.options) for (const o of c.options) {
            const option = win.document.createElement('option');
            option.value = o.value; option.textContent = o.text; el.append(option);
          }
          el.title = c.label;
          el.setAttribute('aria-label', c.label || c.text);
          el.style.cssText = 'background:#303030;color:#ddd;border:1px solid #555;border-radius:4px;padding:6px;accent-color:#aaa;font:12px monospace';
          if (c.tag === 'button') el.onclick = () => this.ctx.bridge.mirrorControl(c.id);
          else {
            const label = win.document.createElement('span'); label.textContent = c.label;
            toolbar.append(label);
            el.oninput = () => this.ctx.bridge.mirrorControl(c.id, el.value);
          }
          toolbar.append(el);
        }
      }
      toolbar.hidden = !controls.length;
      for (const c of controls) {
        const el = toolbar.querySelector(`[data-control-id="${c.id}"]`);
        el.disabled = c.disabled;
        if (c.tag !== 'button' && win.document.activeElement !== el) {
          for (const prop of ['min','max','step','value']) if (c[prop] != null) el[prop] = c[prop];
        }
        if (c.pressed != null) el.setAttribute('aria-pressed',c.pressed);
      }
    }
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
