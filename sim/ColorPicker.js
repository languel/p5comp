export function hsvHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + f(5) + f(3) + f(1);
}
function fromHex(hex) {
  const [r, g, b] = [1, 3, 5].map(
      (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    ),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h = !d
    ? 0
    : 60 *
      (max === r
        ? ((g - b) / d + 6) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4);
  return { h, s: max ? d / max : 0, v: max };
}
export class ColorPicker {
  constructor() {
    this.panel = document.createElement("section");
    this.panel.className = "color-picker";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Custom color picker");
    this.panel.innerHTML =
      '<div class="color-field" role="button" tabindex="0" aria-label="Color saturation and brightness"><i></i></div><input type="range" min="0" max="360" step="1" aria-label="Color hue"><div class="color-entry"><span class="color-preview"></span><input type="text" maxlength="7" aria-label="Hex color" spellcheck="false"><button title="Apply color" aria-label="Apply color">✓</button></div>';
    document.body.append(this.panel);
    this.field = this.panel.querySelector(".color-field");
    this.hue = this.panel.querySelector("input[type=range]");
    this.hex = this.panel.querySelector("input[type=text]");
    this.preview = this.panel.querySelector(".color-preview");
    let dragging = false;
    const drag = (e) => {
      const r = this.field.getBoundingClientRect();
      this.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      this.change();
    };
    this.field.onpointerdown = (e) => {
      e.preventDefault();
      dragging = true;
      this.field.setPointerCapture(e.pointerId);
      drag(e);
    };
    this.field.onpointermove = (e) => {
      if (dragging) drag(e);
    };
    this.field.onpointerup = () => (dragging = false);
    this.field.onpointercancel = () => (dragging = false);
    this.field.onkeydown = (e) => {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const amount = e.shiftKey ? 0.1 : 0.01;
        if (e.key === "ArrowLeft") this.s -= amount;
        if (e.key === "ArrowRight") this.s += amount;
        if (e.key === "ArrowUp") this.v += amount;
        if (e.key === "ArrowDown") this.v -= amount;
        this.s = Math.max(0, Math.min(1, this.s));
        this.v = Math.max(0, Math.min(1, this.v));
        this.change();
      }
    };
    this.hue.oninput = () => {
      this.h = Number(this.hue.value);
      this.change();
    };
    this.hex.oninput = () => {
      const val = this.hex.value;
      if (/^#[0-9a-f]{6}$/i.test(val)) {
        Object.assign(this, fromHex(val));
        this.paint();
        this.fn(val);
      }
      this.hex.setAttribute(
        "aria-invalid",
        String(!/^#[0-9a-f]{6}$/i.test(val)),
      );
    };
    const close = () => {
      if (/^#[0-9a-f]{6}$/i.test(this.hex.value)) {
        this.fn(this.hex.value);
        this.panel.hidden = true;
        this.anchor?.focus();
      }
    };
    this.panel.querySelector("button").onclick = close;
    this.hex.onkeydown = (e) => {
      if (e.key === "Enter") close();
    };
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.panel.hidden = true;
        this.anchor?.focus();
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (
        !this.panel.contains(e.target) &&
        e.target !== this.anchor &&
        !this.anchor?.contains(e.target)
      )
        this.panel.hidden = true;
    });
  }
  open(anchor, value, fn) {
    this.anchor = anchor;
    this.fn = fn;
    const context = document.createElement("canvas").getContext("2d");
    context.fillStyle = "#788fa5";
    context.fillStyle = value || "#788fa5";
    const normalized = context.fillStyle;
    Object.assign(
      this,
      fromHex(/^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#788fa5"),
    );
    this.paint();
    this.panel.hidden = false;
    const r = anchor.getBoundingClientRect();
    this.panel.style.left =
      Math.max(8, Math.min(r.left, innerWidth - 200)) + "px";
    this.panel.style.top =
      Math.max(8, Math.min(r.bottom + 6, innerHeight - 220)) + "px";
    this.hex.focus();
    this.hex.select();
  }
  change() {
    this.paint();
    this.fn(this.hex.value);
  }
  paint() {
    const color = hsvHex(this.h, this.s, this.v);
    this.hex.value = color;
    this.hex.setAttribute("aria-invalid", "false");
    this.preview.style.background = color;
    this.field.style.setProperty("--picker-hue", `hsl(${this.h} 100% 50%)`);
    this.field.querySelector("i").style.left = this.s * 100 + "%";
    this.field.querySelector("i").style.top = (1 - this.v) * 100 + "%";
    this.hue.value = this.h;
  }
}
