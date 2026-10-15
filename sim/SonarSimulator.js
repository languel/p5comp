export class SonarSimulator {
  constructor(stage, setControl, getControl) {
    this.setControl = setControl;
    this.getControl = getControl;
    this.panel = document.createElement("section");
    this.panel.className = "sonar-simulator";
    this.panel.hidden = true;
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && !this.panel.hidden) {
          this.panel.hidden = true;
          e.stopPropagation();
        }
      },
      true,
    );
    this.panel.innerHTML = `<header><strong>Distance simulator</strong><button aria-label="Close distance simulator">×</button></header>
      <svg viewBox="0 0 280 105" aria-label="Drag the target to change distance"><path class="sonar-beam" d="M25 52 L260 12 L260 92 Z"/><rect class="sonar-source" x="10" y="37" width="20" height="30" rx="3"/><g class="sonar-target" tabindex="0" role="slider" aria-label="Distance target" aria-valuemin="2" aria-valuemax="400"><rect x="-7" y="16" width="14" height="72" rx="3"/><path d="M-18 52 H18 M-18 52 L-12 46 M-18 52 L-12 58 M18 52 L12 46 M18 52 L12 58"/></g></svg>
      <label>Distance <input aria-label="Simulated distance cm" type="number" min="2" max="400" step="1"> cm</label>
      <label><input type="checkbox" aria-label="Simulator no echo"> No echo / out of range</label><small>Drag the target · arrow keys adjust distance</small>`;
    document.body.append(this.panel);
    this.panel.style.position = "fixed";
    const header = this.panel.querySelector("header");
    header.style.cursor = "move";
    header.onpointerdown = (e) => {
      if (e.target.closest("button")) return;
      const r = this.panel.getBoundingClientRect(),
        x = e.clientX,
        y = e.clientY;
      header.setPointerCapture(e.pointerId);
      header.onpointermove = (e) => {
        this.panel.style.left =
          Math.max(
            4,
            Math.min(innerWidth - r.width - 4, r.left + e.clientX - x),
          ) + "px";
        this.panel.style.top =
          Math.max(
            4,
            Math.min(innerHeight - r.height - 4, r.top + e.clientY - y),
          ) + "px";
      };
      header.onpointerup = header.onpointercancel = () =>
        (header.onpointermove = null);
    };
    this.target = this.panel.querySelector(".sonar-target");
    this.number = this.panel.querySelector("input[type=number]");
    this.noEcho = this.panel.querySelector("input[type=checkbox]");
    this.panel.querySelector("button").onclick = () =>
      (this.panel.hidden = true);
    this.number.oninput = () => {
      if (this.number.value !== "") this.set(Number(this.number.value));
    };
    this.noEcho.onchange = () =>
      this.set(this.noEcho.checked ? -1 : this.last || 100);
    const svg = this.panel.querySelector("svg");
    let dragging = false;
    const drag = (e) => {
      const r = svg.getBoundingClientRect();
      this.set(2 + ((((e.clientX - r.left) / r.width) * 280 - 45) / 210) * 398);
    };
    this.target.onpointerdown = (e) => {
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      drag(e);
    };
    svg.onpointermove = (e) => {
      if (dragging) drag(e);
    };
    svg.onpointerup = () => (dragging = false);
    svg.onpointercancel = () => (dragging = false);
    this.target.onkeydown = (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        this.set(
          (this.last || 100) +
            (["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : -1) *
              (e.shiftKey ? 10 : 1),
        );
      }
    };
    for (const event of [
      "pointerdown",
      "pointerup",
      "pointermove",
      "keydown",
      "wheel",
      "dblclick",
      "contextmenu",
    ])
      this.panel.addEventListener(event, (e) => e.stopPropagation());
  }
  open(id) {
    this.id = id;
    this.panel.querySelector("strong").textContent = id + " · distance";
    this.panel.hidden = false;
    this.sync(id, this.getControl(id) ?? 100);
    const part = [...document.querySelectorAll(".part")].find(
      (p) => p.dataset.id === id,
    );
    const r = part?.getBoundingClientRect();
    if (r) {
      const w = this.panel.offsetWidth,
        h = this.panel.offsetHeight,
        gap = 14;
      const candidates = [
        { x: r.right + gap, y: r.top },
        { x: r.left - w - gap, y: r.top },
        { x: r.left, y: r.bottom + gap },
        { x: r.left, y: r.top - h - gap },
      ].map((p) => ({
        x: Math.max(4, Math.min(innerWidth - w - 4, p.x)),
        y: Math.max(4, Math.min(innerHeight - h - 4, p.y)),
      }));
      const overlap = (p) =>
        Math.max(0, Math.min(p.x + w, r.right) - Math.max(p.x, r.left)) *
        Math.max(0, Math.min(p.y + h, r.bottom) - Math.max(p.y, r.top));
      candidates.sort((a, b) => overlap(a) - overlap(b));
      this.panel.style.left = candidates[0].x + "px";
      this.panel.style.top = candidates[0].y + "px";
      this.panel.style.right = "auto";
    }
  }
  set(value) {
    if (value !== -1) value = Math.round(Math.max(2, Math.min(400, value)));
    this.setControl(this.id, value);
  }
  sync(id, value) {
    if (id !== this.id) return;
    if (value >= 0) this.last = value;
    this.number.value = this.last || 100;
    this.number.disabled = value < 0;
    this.noEcho.checked = value < 0;
    this.target.setAttribute(
      "transform",
      `translate(${45 + (((this.last || 100) - 2) / 398) * 210} 0)`,
    );
    this.target.setAttribute("aria-valuenow", this.last || 100);
    this.target.style.opacity = value < 0 ? ".25" : "1";
    this.panel.querySelector(".sonar-beam").style.opacity =
      value < 0 ? ".1" : ".5";
  }
}
