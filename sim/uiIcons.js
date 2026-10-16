// Interface icon reference: 24-unit viewBox, 20-unit ink box, 1.75-unit stroke.
// Keep this geometry shared: matching CSS boxes alone cannot normalize glyphs.
const paths = {
  record:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  simulation: "M2 12h4l3-8 6 16 3-8h4",
  windowShare: "M2 2h20v20H2ZM2 7h20M9 17l8-8M11 9h6v6",
  mirror: "M12 2v20M8 6l-6 6 6 6ZM16 6l6 6-6 6Z",
  camera: "M2 6h5l2-3h6l2 3h5v15H2ZM12 9a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
  terminal: "M3 4l7 8-7 8M13 20h8",
  arduino:
    "M12 12C8 2 2 2 2 12s6 10 10 0S22 2 22 12s-6 10-10 0M4 12h4M16 12h4M18 10v4",
  play: "M5 2l16 10L5 22Z",
  native: "M2 12c4-14 6-14 10 0s6 14 10 0",
  firmata: "M20 2h-5c-4 0-6 3-6 7v10c0 2-1 3-4 3H2M4 10h14",
  tabs: "M2 2h20v20H2ZM6 6h12v12H6Z",
  vertical: "M2 2h20v20H2ZM2 12h20",
  half: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 2v20",
  stop: "M2 2h20v20H2Z",
  pause: "M7 2v20M17 2v20",
  reset: "M3 10a9 9 0 1 1 2 8M3 2v8h8",
  auto: "M3 8a9 9 0 0 1 16-3l2 3M21 2v6h-6M21 16a9 9 0 0 1-16 3l-2-3M3 22v-6h6",
  file: "M2 6h20l-4 14H2ZM2 6V3h8l3 3",
  examples: "M2 2h20v20H2ZM7 2v20M12 2v20M17 2v20M2 7h20M2 12h20M2 17h20",
  gear: "M12.00 2.00L13.95 2.19L15.06 4.61L16.44 5.35L19.07 4.93L20.31 6.44L19.39 8.94L19.85 10.44L22.00 12.00L21.81 13.95L19.39 15.06L18.65 16.44L19.07 19.07L17.56 20.31L15.06 19.39L13.56 19.85L12.00 22.00L10.05 21.81L8.94 19.39L7.56 18.65L4.93 19.07L3.69 17.56L4.61 15.06L4.15 13.56L2.00 12.00L2.19 10.05L4.61 8.94L5.35 7.56L4.93 4.93L6.44 3.69L8.94 4.61L10.44 4.15ZM15.5 12a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0Z",
  properties: "M5 2v20M12 2v20M19 2v20M2 8h6M9 16h6M16 6h6",
  settings: "M2 5h20M2 12h20M2 19h20M7 2v6M17 9v6M9 16v6",
  panels: "M2 2h20v20H2ZM10 2v20",
  more: "M3 12h.01M12 12h.01M21 12h.01",
  add: "M12 2v20M2 12h20",
  addPart: "M2 2h20v20H2ZM12 6v12M6 12h12",
  minus: "M2 12h20",
  wire: "M4 4h8v16h8M2 2h4v4H2ZM18 18h4v4h-4Z",
  select: "M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6",
  fit: "M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6M7 7h10v10H7Z",
  code: "m8 3-6 9 6 9m8-18 6 9-6 9M15 2L9 22",
  eye: "M2 12S6 3 12 3s10 9 10 9-4 9-10 9S2 12 2 12ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  usb: "M12 4v16M12 16l-7-4V8M12 13l7-4V6",
  upload: "M12 17V2M6 8l6-6 6 6M2 16v6h20v-6",
  tidy: "M2 3h20M2 12h20M2 21h20",
  image: "M2 2h20v20H2ZM2 17l6-7 5 6 4-4 5 6M16 7h.01",
  infinity: "M12 12C7 0 2 1 2 12s5 12 10 0S22 1 22 12 17 24 12 12Z",
  help: "M6 7a6 5 0 0 1 12 0c0 4-6 4-6 8",
  close: "M2 2l20 20M22 2L2 22",
  popup: "M3 21L21 3M3 3h18v18",
  chevron: "m7 2 10 10-10 10",
  undo: "M9 2L2 9l7 7M2 9h11a8 8 0 0 1 0 13",
  redo: "m15 2 7 7-7 7M22 9H11a8 8 0 0 0 0 13",
  moon: "M21 14A12 12 0 0 1 10 2a10 10 0 1 0 11 12Z",
  sun: "M12 2V0M12 24v-2M2 12H0M24 12h-2M4 4L2 2m20 20-2-2M4 20l-2 2M22 2l-2 2M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  comms: "M2 12h20M8 5l-7 7 7 7M16 5l7 7-7 7",
  none: "M2 22L22 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  chip: "M5 5h14v14H5ZM8 1v4m4-4v4m4-4v4M8 19v4m4-4v4m4-4v4M1 8h4m-4 4h4m-4 4h4m14-8h4m-4 4h4m-4 4h4",
};
const glyphs = {
  "⌁": "native",
  ƒ: "firmata",
  "▣": "tabs",
  "⬒": "vertical",
  "◐": "half",
  "▱": "file",
  "▦": "examples",
  "⚙": "settings",
  "◫": "panels",
  "⋯": "more",
  "+": "add",
  "−": "minus",
  "↶": "undo",
  "↷": "redo",
  "∞": "infinity",
  "?": "help",
  "×": "close",
  "☷": "settings",
  "↗": "popup",
  "›": "chevron",
  "☾": "moon",
  "☼": "sun",
  "↔": "comms",
  ø: "none",
  "▷": "play",
  "⇧": "upload",
};
export function icon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ui-icon");
  svg.dataset.icon = kind;
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[kind]);
  svg.append(path);
  if (kind === "usb" || kind === "help") {
    const terminals = document.createElementNS(svg.namespaceURI, "path");
    terminals.setAttribute("fill", "currentColor");
    terminals.setAttribute("stroke", "none");
    terminals.setAttribute(
      "d",
      kind === "usb"
        ? "M12 1l4 5H8ZM17 3h4v4h-4ZM5 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 19a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
        : "M12 19a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
    );
    svg.append(terminals);
  }
  return svg;
}
export function glyphIcon(glyph) {
  return glyphs[glyph] ? icon(glyphs[glyph]) : null;
}
const ids = {
  run: "play",
  compile: "play",
  p5EditorRun: "play",
  pause: "pause",
  reset: "reset",
  toggleCode: "code",
  toggleControls: "settings",
  hideUI: "eye",
  addElement: "addPart",
  settingsPanelToggle: "gear",
  wireMode: "wire",
  selectTool: "select",
  fit: "fit",
  zoomIn: "add",
  zoomOut: "minus",
  undoCanvas: "undo",
  redoCanvas: "redo",
  usb: "usb",
  compileUpload: "upload",
  loadExample: "reset",
  projectCircuit: "popup",
  projectP5: "popup",
  p5Autorun: "auto",
  applyProperties: "play",
  closeInspector: "close",
};
export function initializeIconSystem(root = document) {
  const refresh = () => {
    root
      .querySelectorAll("button,summary,.menu-row-glyph")
      .forEach((control) => {
        if (control.closest(".cm-editor,.part,.element-picker")) return;
        // A menu row contains a glyph plus a text label; normalize only its glyph.
        if (control.querySelector(".menu-row-glyph")) return;
        const text = control.textContent.trim();
        let kind = ids[control.id] || glyphs[text];
        if (control.dataset.bottom) {
          kind = {
            simulation: "simulation",
            serial: "comms",
            console: "terminal",
          }[control.dataset.bottom];
          const label = control.getAttribute("aria-label") || text;
          control.setAttribute("aria-label", label);
          control.title = label;
        }
        if (
          ["run", "compile", "p5EditorRun"].includes(control.id) &&
          control.dataset.running === "true" &&
          control.dataset.paused !== "true"
        )
          kind = "stop";
        if (
          control.id === "pause" &&
          /resume/i.test(control.getAttribute("aria-label") || "")
        )
          kind = "play";
        if (
          control.id === "hideUI" &&
          document.body.classList.contains("ui-hidden")
        )
          kind = "panels";
        if (control.dataset.mainView === "circuit") kind = "chip";
        if (control.dataset.tab === "arduino") kind = "arduino";
        if (control.dataset.tab === "properties") kind = "properties";
        if (control.dataset.tab === "settings") kind = "gear";
        if (control.id === "collapseBottom") kind = "chevron";
        const label = control.getAttribute("aria-label") || "";
        if (/^Run p5 sketch/.test(label)) kind = "play";
        if (label === "Stop p5") kind = "stop";
        if (/^Tidy .* code/.test(label)) kind = "tidy";
        if (label === "Project assets") kind = "image";
        if (
          control.classList.contains("glyph-select-trigger") &&
          text.startsWith("↔")
        ) {
          const state = text.slice(1).trim();
          if (!control.querySelector(".ui-icon")) {
            control.replaceChildren(icon("comms"));
            if (state)
              control.append(
                glyphs[state]
                  ? icon(glyphs[state])
                  : Object.assign(document.createElement("span"), {
                      textContent: state,
                    }),
              );
          }
          control.classList.add("ui-icon-button");
          return;
        }
        if (
          ["p5.js", "p5⋆", "p5"].includes(text) &&
          control.matches('[role="tab"]')
        ) {
          if (!control.querySelector(".ui-wordmark")) {
            control.replaceChildren(
              Object.assign(document.createElement("span"), {
                className: "ui-wordmark",
                textContent: text === "p5⋆" ? "p5⋆" : "p5",
              }),
            );
          }
          control.classList.add("ui-icon-button");
          return;
        }
        if (!kind) return;
        if (control.querySelector(".ui-icon")?.dataset.icon !== kind)
          control.replaceChildren(icon(kind));
        if (control.matches("button,summary"))
          control.classList.add("ui-icon-button");
      });
  };
  refresh();
  const observer = new MutationObserver(refresh);
  root
    .querySelectorAll(
      ".bar,.canvas-tools,.canvas-inspector,.main-view-tools,.wb-tabs,.section-bar,#globalSettings",
    )
    .forEach((bar) =>
      observer.observe(bar, { childList: true, subtree: true }),
    );
}
