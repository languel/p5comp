const NS = "http://www.w3.org/2000/svg";
const paths = {
  play: "m8 5 10 7-10 7Z",
  pause: "M8 5v14M16 5v14",
  reset: "M4 10a8 8 0 1 1 2 8M4 4v6h6",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7",
  open: "M3 7h7l2 2h9l-3 11H3ZM3 7V4h7l2 3",
  add: "M12 4v16M4 12h16",
  wire: "M5 5h6v14h8M3 3h4v4H3ZM17 17h4v4h-4Z",
  select: "M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6",
  fit: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z",
  expand: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  controls: "M5 3v18M12 3v18M19 3v18M2 8h6M9 15h6M16 6h6",
  hide: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM3 3l18 18",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  original:
    "M12 3a9 9 0 1 0 9 9c0-2-2-3-4-3h-2c-2 0-3-1-3-3V3ZM6 12h.01M8 7h.01M8 17h.01",
  gray: "M12 3a9 9 0 1 0 0 18Z",
  theme: "M20 13A8 8 0 0 1 11 4a8 8 0 1 0 9 9Z",
  usb: "M12 3v18M8 7l4-4 4 4M12 15l-6-4V8M12 17l6-4V9",
  upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
};
function svg(kind) {
  const n = document.createElementNS(NS, "svg");
  n.setAttribute("viewBox", "0 0 24 24");
  n.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", paths[kind] || paths.play);
  n.append(p);
  return n;
}
function iconButton(id, kind) {
  const b = document.getElementById(id);
  if (!b) return;
  const update = () => {
    if (b.querySelector("svg")) return;
    const label = b.getAttribute("aria-label") || b.textContent.trim();
    b.title = b.title || label;
    b.setAttribute("aria-label", label);
    b.replaceChildren(
      svg(kind === "pause" && /resume/i.test(label) ? "play" : kind),
    );
  };
  update();
  new MutationObserver(() => {
    if (!b.querySelector("svg")) {
      const label = b.textContent.trim();
      if (label) {
        b.title = label;
        b.setAttribute("aria-label", label);
      }
      update();
    }
  }).observe(b, { childList: true });
}
export function initializeCompactUI({ canvas, key }) {
  for (const [id, kind] of Object.entries({
    run: "play",
    pause: "pause",
    reset: "reset",
    save: "save",
    open: "open",
    lesson: "reset",
    toggleCode: "code",
    toggleControls: "controls",
    hideUI: "hide",
    themeToggle: "theme",
    addElement: "add",
    wireMode: "wire",
    selectTool: "select",
    fit: "fit",
    expandCanvas: "expand",
    removePart: "trash",
    grayTint: "gray",
    originalTint: "original",
    runP5: "play",
    compile: "play",
    loadExample: "reset",
    usb: "usb",
    upload: "upload",
    clearLog: "trash",
  }))
    iconButton(id, kind);
  const mobile = matchMedia("(max-width:760px)"),
    nav = document.querySelector(".app-menu nav"),
    menuSummary = document.querySelector(".app-menu summary");
  const tucked = ["save", "open", "lesson", "reset", "toggleControls"].map(
    (id) => {
      const button = document.getElementById(id),
        anchor = document.createComment(id);
      button.before(anchor);
      return { button, anchor };
    },
  );
  const responsive = () => {
    for (const { button, anchor } of tucked) {
      if (mobile.matches) nav.append(button);
      else anchor.after(button);
    }
    menuSummary.title = mobile.matches ? "Project and sections" : "Sections";
    menuSummary.setAttribute("aria-label", menuSummary.title);
  };
  mobile.addEventListener("change", responsive);
  responsive();
  const uiKey = key + ".ui";
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(uiKey) || "{}");
  } catch {}
  const save = () => localStorage.setItem(uiKey, JSON.stringify(prefs));
  const apply = () => {
    document
      .querySelector(".workspace")
      .classList.toggle("canvas-expanded", !!prefs.previewHidden);
    document.body.classList.toggle("controls-hidden", !!prefs.controlsHidden);
    document
      .getElementById("expandCanvas")
      .setAttribute("aria-pressed", String(!!prefs.previewHidden));
    document
      .getElementById("toggleControls")
      .setAttribute("aria-pressed", String(!prefs.controlsHidden));
  };
  apply();
  document.getElementById("expandCanvas").addEventListener("click", () => {
    prefs.previewHidden = document
      .querySelector(".workspace")
      .classList.contains("canvas-expanded");
    save();
  });
  document.getElementById("toggleControls").onclick = () => {
    prefs.controlsHidden = !prefs.controlsHidden;
    apply();
    save();
  };
  document.getElementById("toggleCode").onclick = () => {
    const code = document.getElementById("code");
    code.open = !code.open;
    if (code.open) code.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const hideUI = (hidden) => {
    document.body.classList.toggle("ui-hidden", hidden);
    document.getElementById("showUI").hidden = !hidden;
  };
  document.getElementById("hideUI").onclick = () => hideUI(true);
  document.getElementById("showUI").onclick = () => hideUI(false);
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Tab" &&
      !e.shiftKey &&
      (e.target === document.body || e.target.id === "stage")
    ) {
      e.preventDefault();
      hideUI(!document.body.classList.contains("ui-hidden"));
    }
  });
  document
    .querySelectorAll(".canvas-settings input,.canvas-settings select")
    .forEach(
      (n) =>
        (n.title =
          n.getAttribute("aria-label") || n.parentElement.textContent.trim()),
    );
  const stage = document.getElementById("stage");
  stage.removeAttribute("title");
  document.querySelectorAll(".app-menu,.canvas-settings").forEach((d) =>
    document.addEventListener("pointerdown", (e) => {
      if (!d.contains(e.target)) d.open = false;
    }),
  );
}
