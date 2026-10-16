import { glyphIcon } from "./uiIcons.js";
const glyphs = {
  tabs: "▣",
  horizontal: "◫",
  vertical: "⬒",
  firmata: "ƒ",
  native: "⌁",
  webserial: "∞",
  0.5: "½",
  1: "1×",
  2: "2×",
  none: "ø",
  breadboard: "▦",
  arduino: "∞",
  holes: "●",
  between: "◌",
  light: "☼",
  dark: "☾",
  subdued: "◐",
  "subdued-light": "☼",
  "subdued-dark": "☾",
  "github-light": "☼",
  "github-dark": "☾",
};
export function glyphSelect(select) {
  const wrapper = document.createElement("div");
  wrapper.className = "glyph-select";
  select.before(wrapper);
  wrapper.append(select);
  select.hidden = true;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "glyph-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  wrapper.append(trigger);
  const list = document.createElement("div");
  list.className = "glyph-select-options";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  wrapper.append(list);
  const refresh = () => {
    const option = select.selectedOptions[0];
    trigger.textContent =
      (select.dataset.glyph
        ? select.dataset.glyph +
          (select.dataset.showState ? " " + (glyphs[select.value] || "·") : "")
        : "") ||
      glyphs[select.value] ||
      option?.textContent ||
      "⋯";
    trigger.title =
      (select.getAttribute("aria-label") || "") + ": " + option?.textContent;
    trigger.setAttribute("aria-label", trigger.title);
    trigger.disabled = select.disabled;
    list.replaceChildren();
    for (const option of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      const glyph = glyphs[option.value] || "·";
      const symbol = glyphIcon(glyph) || document.createElement("span");
      if (!symbol.classList.contains("ui-icon")) {
        symbol.className = "menu-row-glyph";
        symbol.textContent = glyph;
      }
      const label = document.createElement("span");
      label.textContent = option.textContent;
      item.append(symbol, label);
      item.onclick = () => {
        select.value = option.value;
        list.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        select.dispatchEvent(new Event("change", { bubbles: false }));
        refresh();
        trigger.focus();
      };
      list.append(item);
    }
  };
  trigger.onclick = () => {
    document.querySelectorAll(".glyph-select-options").forEach((e) => {
      if (e !== list) e.hidden = true;
    });
    refresh();
    list.hidden = !list.hidden;
    trigger.setAttribute("aria-expanded", String(!list.hidden));
  };
  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      list.hidden = true;
      trigger.focus();
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      list.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      const items = [...list.querySelectorAll("button")],
        index = items.indexOf(document.activeElement);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : e.key === "ArrowUp"
              ? index <= 0
                ? items.length - 1
                : index - 1
              : (index + 1) % items.length;
      items[next]?.focus();
    }
  });
  select.addEventListener("change", refresh);
  document.addEventListener("pointerdown", (e) => {
    if (!wrapper.contains(e.target)) {
      list.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("p5comp:refresh-selects", refresh);
  refresh();
  return refresh;
}
