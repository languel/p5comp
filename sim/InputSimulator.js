import { isPot } from "./inputModels.js";
export class InputSimulator {
  constructor(set, get) {
    this.set = set;
    this.get = get;
    this.panel = document.createElement("section");
    this.panel.className = "input-simulator";
    this.panel.hidden = true;
    document.body.append(this.panel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.panel.hidden) {
        this.close();
        e.stopPropagation();
      }
    });
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }
  close() {
    this.panel.hidden = true;
    if (this.partType === "wokwi-membrane-keypad" && this.id)
      this.set(this.id, []);
  }
  open(part) {
    this.close();
    this.id = part.id;
    this.partType = part.type;
    this.panel.replaceChildren();
    const header = document.createElement("header");
    const name = document.createElement("strong");
    name.textContent = (part.label || part.id) + " · input";
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Close input simulator");
    close.onclick = () => this.close();
    header.append(name, close);
    this.panel.append(header);
    const add = (
      caption,
      type,
      value,
      callback,
      min = 0,
      max = 1023,
      step = 1,
    ) => {
      const label = document.createElement("label");
      label.textContent = caption;
      const input = document.createElement("input");
      input.type = type;
      input.setAttribute("aria-label", caption);
      input.min = min;
      input.max = max;
      input.step = step;
      if (type === "checkbox") input.checked = !!value;
      else input.value = value;
      input.oninput = () =>
        callback(type === "checkbox" ? input.checked : Number(input.value));
      label.append(input);
      this.panel.append(label);
      return input;
    };
    const value = this.get(part.id);
    if (part.type === "wokwi-dip-switch-8")
      for (let i = 0; i < 8; i++)
        add("Switch " + (i + 1), "checkbox", value?.[i], (on) => {
          const values = [...(this.get(part.id) || Array(8).fill(0))];
          values[i] = on ? 1 : 0;
          this.set(part.id, values);
        });
    else if (["wokwi-slide-switch", "p5comp-toggle-switch"].includes(part.type))
      add(
        part.type === "p5comp-toggle-switch"
          ? "Closed"
          : "Position 2–3 (off: 2–1)",
        "checkbox",
        value,
        (v) => this.set(part.id, Number(v)),
      );
    else if (part.type === "wokwi-pir-motion-sensor") {
      const b = document.createElement("button");
      b.textContent = "Simulate motion";
      b.onclick = () => {
        this.set(part.id, true);
        setTimeout(() => this.set(part.id, false), 60);
      };
      this.panel.append(b);
      const hint = document.createElement("small");
      hint.textContent = `OUT high for ${part.attrs?.delayTime ?? 5}s · ${part.attrs?.inhibitTime ?? 1.2}s inhibit`;
      this.panel.append(hint);
    } else if (part.type === "wokwi-membrane-keypad") {
      const grid = document.createElement("div");
      grid.className = "keypad-controls";
      grid.style.gridTemplateColumns = `repeat(${Number(part.attrs?.columns || 4)},1fr)`;
      const keys = part.attrs?.keys || [
        "1",
        "2",
        "3",
        "A",
        "4",
        "5",
        "6",
        "B",
        "7",
        "8",
        "9",
        "C",
        "*",
        "0",
        "#",
        "D",
      ];
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < Number(part.attrs?.columns || 4); col++) {
          const b = document.createElement("button");
          b.textContent = keys[row * 4 + col];
          const key = row + "," + col;
          const press = (on) => {
            const set = new Set(this.get(part.id) || []);
            if (on) set.add(key);
            else set.delete(key);
            this.set(part.id, [...set]);
          };
          b.onpointerdown = (e) => {
            b.setPointerCapture(e.pointerId);
            press(true);
          };
          b.onpointerup = b.onpointercancel = () => press(false);
          b.onkeydown = (e) => {
            if ([" ", "Enter"].includes(e.key)) {
              e.preventDefault();
              press(true);
            }
          };
          b.onkeyup = b.onblur = () => press(false);
          grid.append(b);
        }
      this.panel.append(grid);
    } else {
      const photo = part.type.includes("photo");
      const caption = photo
        ? "Illumination (lux)"
        : isPot(part.type)
          ? "Analog value"
          : "Sound level (0–1023)";
      const max = photo ? 100000 : 1023;
      const step = photo ? 0.1 : 1;
      const slider = add(
        caption,
        "range",
        value ?? (photo ? 500 : 0),
        (v) => {
          number.value = v;
          this.set(part.id, v);
        },
        0,
        max,
        step,
      );
      const number = add(
        photo ? "Lux" : "Value",
        "number",
        slider.value,
        (v) => {
          slider.value = v;
          this.set(part.id, v);
        },
        0,
        max,
        step,
      );
    }
    this.panel.hidden = false;
    const partNode = [...document.querySelectorAll(".part")].find(
      (e) => e.dataset.id === part.id,
    );
    const r = partNode?.getBoundingClientRect();
    const w = this.panel.offsetWidth,
      h = this.panel.offsetHeight;
    let x = r ? r.right + 12 : 20,
      y = r ? r.top : 80;
    if (x + w > innerWidth - 8) x = r ? r.left - w - 12 : 20;
    this.panel.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + "px";
    this.panel.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + "px";
  }
}
