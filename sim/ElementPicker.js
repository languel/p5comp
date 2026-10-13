import { searchElements, elementByType } from "./elements.js";
export class ElementPicker {
  constructor(add) {
    this.add = add;
    this.dialog = document.createElement("dialog");
    this.dialog.className = "element-picker";
    this.dialog.setAttribute("aria-label", "Add circuit element");
    this.dialog.innerHTML =
      '<header><input type="search" aria-label="Search elements" placeholder="Search elements…" autocomplete="off"><button aria-label="Close element picker" title="Close">×</button></header><div class="element-results"></div>';
    document.body.append(this.dialog);
    this.search = this.dialog.querySelector("input");
    this.results = this.dialog.querySelector(".element-results");
    this.search.oninput = () => this.render();
    this.dialog.querySelector("button").onclick = () => this.dialog.close();
    this.search.onkeydown = (e) => {
      if (["Enter", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const first = this.results.querySelector("button");
        if (e.key === "Enter") first?.click();
        else first?.focus();
      }
    };
    this.dialog.addEventListener("click", (e) => {
      if (e.target === this.dialog) {
        const r = this.dialog.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          this.dialog.close();
      }
    });
  }
  open() {
    this.search.value = "";
    this.render();
    this.dialog.showModal();
    this.search.focus();
  }
  render() {
    this.results.replaceChildren();
    const found = searchElements(this.search.value),
      groups = [
        "Basic",
        "Inputs",
        "Sensors",
        "Displays",
        "Actuators",
        "Boards",
      ];
    if (!found.length) {
      const empty = document.createElement("p");
      empty.textContent = "No matching elements";
      this.results.append(empty);
      return;
    }
    for (const group of groups) {
      const items = found.filter((e) => e.group === group);
      if (!items.length) continue;
      const heading = document.createElement("h3");
      heading.textContent = group;
      this.results.append(heading);
      for (const info of items) {
        const button = document.createElement("button");
        button.className = "element-option";
        button.setAttribute("aria-label", "Add " + info.name);
        button.title = info.modeled
          ? info.modelDescription || "Emulated"
          : "Place and wire; behavior not emulated";
        const thumb = document.createElement("span");
        thumb.className = "element-thumb";
        thumb.setAttribute("aria-hidden", "true");
        const body = document.createElement("span");
        body.className = "thumb-body";
        thumb.append(body);
        if (info.type === "wokwi-breadboard") thumb.textContent = "▦";
        else {
          const part = document.createElement(info.type);
          for (const [key, val] of Object.entries(info.attrs || {}))
            part[key] = val;
          body.append(part);
          Promise.resolve(part.updateComplete).then(() => {
            if (!part.isConnected) return;
            const w = body.offsetWidth || 100,
              h = body.offsetHeight || 100;
            body.style.transform = `scale(${Math.min(44 / w, 40 / h, 1)})`;
          });
        }
        const name = document.createElement("span");
        name.textContent = info.name;
        const state = document.createElement("span");
        state.className = "element-model";
        state.textContent = info.modeled ? "●" : "○";
        state.title = button.title;
        button.append(thumb, name, state);
        button.onclick = () => {
          this.add(info.type, info.attrs || {});
          this.dialog.close();
        };
        this.results.append(button);
      }
    }
  }
}
export class PartDocs {
  constructor() {
    this.panel = document.createElement("aside");
    this.panel.className = "part-docs";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Part documentation");
    this.panel.innerHTML =
      '<header><strong></strong><span class="doc-model"></span><a target="_blank" rel="noopener" title="Open official documentation" aria-label="Open official documentation">↗</a><button title="Close documentation" aria-label="Close documentation">×</button></header><details class="doc-pinout"><summary>Element pins</summary><div></div></details><div class="doc-variant" hidden></div><section class="doc-local" hidden></section><iframe title="Official Wokwi part documentation" referrerpolicy="no-referrer"></iframe>';
    document.body.append(this.panel);
    this.panel.querySelector("button").onclick = () =>
      (this.panel.hidden = true);
  }
  open(part, element) {
    if (!part) return;
    const info = elementByType.get(part.type);
    if (!info) return;
    this.panel.hidden = false;
    this.panel.querySelector("strong").textContent = info.name;
    this.panel.querySelector(".doc-model").textContent = info.modeled
      ? "●"
      : "○";
    this.panel.querySelector(".doc-model").title = info.modeled
      ? info.modelDescription || "Emulated"
      : "Place and wire; behavior not emulated";
    const pins = this.panel.querySelector(".doc-pinout div");
    pins.replaceChildren();
    for (const pin of element?.pinInfo || []) {
      const row = document.createElement("div");
      row.textContent = pin.name;
      pins.append(row);
    }
    const frame = this.panel.querySelector("iframe"),
      local = this.panel.querySelector(".doc-local"),
      variant = this.panel.querySelector(".doc-variant");
    variant.hidden = part.type !== "wokwi-ssd1306";
    variant.textContent = "Element: 8-pin module · reference: 4-pin I²C module";
    const url = info.docs
      ? "https://docs.wokwi.com/parts/" + info.docs
      : info.source
        ? "https://github.com/wokwi/wokwi-elements/blob/main/src/" +
          info.source.replace(".js", ".ts")
        : "https://docs.wokwi.com/guides/diagram-editor";
    this.panel.querySelector("a").href = url;
    frame.hidden = !info.docs;
    local.hidden = !!info.docs;
    if (info.docs) frame.src = url;
    else {
      frame.removeAttribute("src");
      local.replaceChildren();
      const title = document.createElement("h3");
      title.textContent = "Element reference";
      local.append(title);
      const table = document.createElement("table");
      for (const pin of element?.pinInfo || []) {
        const row = document.createElement("tr");
        for (const text of [
          pin.name,
          (pin.signals || [])
            .map((s) => s.type + (s.signal ? " · " + s.signal : ""))
            .join(", ") || "Terminal",
        ]) {
          const cell = document.createElement("td");
          cell.textContent = text;
          row.append(cell);
        }
        table.append(row);
      }
      local.append(table);
      const props = document.createElement("h3");
      props.textContent = "Properties";
      local.append(props);
      const values = document.createElement("table");
      for (const [name] of element?.constructor.elementProperties || []) {
        const value = element[name];
        if (!["string", "number", "boolean"].includes(typeof value)) continue;
        const row = document.createElement("tr");
        for (const text of [name, String(value)]) {
          const cell = document.createElement("td");
          cell.textContent = text;
          row.append(cell);
        }
        values.append(row);
      }
      local.append(values);
    }
  }
}
