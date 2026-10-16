// Opacity/8-digit hex behavior adapted from Artist Model Studio's workbench/colorPicker.js.
export function parseColor(value, fallback = "#788fa5") {
  let s = String(value || fallback).trim();
  if (/^#[0-9a-f]{3}$/i.test(s))
    s = "#" + [...s.slice(1)].map((c) => c + c).join("");
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s))
    return {
      hex: s.slice(0, 7),
      alpha: s.length === 9 ? parseInt(s.slice(7), 16) / 255 : 1,
    };
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b, a = 1] = m[1].split(",").map(Number);
    return {
      hex:
        "#" +
        [r, g, b]
          .map((x) =>
            Math.round(Math.max(0, Math.min(255, x)))
              .toString(16)
              .padStart(2, "0"),
          )
          .join(""),
      alpha: Math.max(0, Math.min(1, a)),
    };
  }
  return parseColor(fallback, "#788fa5");
}
export const formatColor = (hex, alpha) =>
  alpha >= 0.999
    ? hex
    : hex +
      Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, "0");
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
      '<div class="color-field" role="button" tabindex="0" aria-label="Color saturation and brightness"><i></i></div><input type="range" min="0" max="360" step="1" aria-label="Color hue"><label class="color-opacity">Opacity <input type="range" min="0" max="100" step="1" aria-label="Color opacity"><input type="number" min="0" max="100" aria-label="Color opacity percent">%</label><div class="color-entry"><span class="color-preview"></span><input type="text" maxlength="9" aria-label="Hex color" spellcheck="false"><button title="Apply color" aria-label="Apply color">✓</button></div>';
    document.body.append(this.panel);
    this.field = this.panel.querySelector(".color-field");
    this.hue = this.panel.querySelector("input[type=range]");
    this.alpha = this.panel.querySelector('[aria-label="Color opacity"]');
    this.percent = this.panel.querySelector(
      '[aria-label="Color opacity percent"]',
    );
    this.a = 1;
    this.alpha.oninput = () => {
      this.a = Number(this.alpha.value) / 100;
      this.change();
    };
    this.percent.oninput = () => {
      this.a = Math.max(0, Math.min(100, Number(this.percent.value))) / 100;
      this.change();
    };
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
      if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(val)) {
        const parsed = parseColor(val);
        Object.assign(this, fromHex(parsed.hex));
        this.a = parsed.alpha;
        this.paint();
        this.fn(val);
      }
      this.hex.setAttribute(
        "aria-invalid",
        String(!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(val)),
      );
    };
    const close = () => {
      if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(this.hex.value)) {
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
    const parsed = parseColor(value);
    Object.assign(this, fromHex(parsed.hex));
    this.a = parsed.alpha;
    this.paint();
    this.panel.hidden = false;
    const r = anchor.getBoundingClientRect();
    this.panel.style.left =
      Math.max(8, Math.min(r.left, innerWidth - 200)) + "px";
    this.panel.style.top =
      Math.max(8, Math.min(r.bottom + 6, innerHeight - 290)) + "px";
    this.hex.focus();
    this.hex.select();
  }
  change() {
    this.paint();
    this.fn(this.hex.value);
  }
  paint() {
    const color = formatColor(hsvHex(this.h, this.s, this.v), this.a);
    this.alpha.value = Math.round(this.a * 100);
    this.percent.value = Math.round(this.a * 100);
    this.hex.value = color;
    this.hex.setAttribute("aria-invalid", "false");
    this.preview.style.background = color;
    this.field.style.setProperty("--picker-hue", `hsl(${this.h} 100% 50%)`);
    this.field.querySelector("i").style.left = this.s * 100 + "%";
    this.field.querySelector("i").style.top = (1 - this.v) * 100 + "%";
    this.hue.value = this.h;
  }
}

// Keep existing input IDs/events and saved values while replacing native color wells.
export function installColorFields(root = document) {
  const picker = new ColorPicker();
  const upgrade = () =>
    root
      .querySelectorAll('input[type="color"],input[data-color-field]')
      .forEach((input) => {
        input.removeAttribute("data-color-field");
        input.type = "text";
        input.hidden = true;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "alpha-color-swatch";
        const label =
          input.getAttribute("aria-label") ||
          input.closest("label")?.textContent.trim() ||
          "Color";
        button.setAttribute("aria-label", label);
        button.title = label + " · color and opacity";
        const chip = document.createElement("span");
        button.append(chip);
        input.after(button);
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        );
        const paint = () => {
          chip.style.background = input.value;
          button.title = label + " · " + input.value + " · color and opacity";
          button.disabled = input.disabled;
        };
        Object.defineProperty(input, "value", {
          configurable: true,
          get() {
            return descriptor.get.call(this);
          },
          set(v) {
            descriptor.set.call(this, v);
            paint();
          },
        });
        button.onclick = (e) => {
          e.preventDefault();
          picker.open(button, input.value, (value) => {
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        };
        paint();
      });
  upgrade();
  new MutationObserver(upgrade).observe(root.documentElement || root, {
    childList: true,
    subtree: true,
  });
}
