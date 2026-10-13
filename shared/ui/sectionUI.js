// Shared compact controls for the code and Firmata workspaces.
const NS = "http://www.w3.org/2000/svg";
const paths = {
  play: "m8 5 10 7-10 7Z",
  usb: "M12 3v18M8 7l4-4 4 4M12 15l-6-4V8M12 17l6-4V9",
  disconnect: "M6 8v4h12V8M12 12v9M6 3v3M18 3v3M3 3l18 18",
  upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
  reset: "M4 10a8 8 0 1 1 2 8M4 4v6h6",
  theme: "M20 13A8 8 0 0 1 11 4a8 8 0 1 0 9 9Z",
  clear: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15",
  send: "m3 3 18 9-18 9 4-9Zm4 9h14",
};
function icon(button, kind) {
  if (!button) return;
  const apply = () => {
    if (button.querySelector("svg")) return;
    const label = button.textContent.trim();
    button.title = label;
    button.setAttribute("aria-label", label);
    button.classList.add("compact-icon");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", paths[kind]);
    svg.append(p);
    button.replaceChildren(svg);
  };
  apply();
  new MutationObserver(apply).observe(button, { childList: true });
}
export function initializeSectionUI() {
  for (const [id, kind] of Object.entries({
    runBtn: "play",
    uploadBtn: "upload",
    flashBtn: "upload",
    connectBtn: "usb",
    disconnectBtn: "disconnect",
    themeToggle: "theme",
    resetExampleBtn: "reset",
    clearOutputBtn: "clear",
    sendBtn: "send",
  }))
    icon(document.getElementById(id), kind);
  // Hints remain available without taking space from editors and the sketch.
  document
    .querySelectorAll(
      ".output-hint,.api-note small,.firmata-note small,.page-footer>span:first-child,.canvas-footer>span:first-child,.editor-footer>span:last-child",
    )
    .forEach((el) => {
      el.parentElement.title = el.textContent.trim();
      el.classList.add("quiet-hint");
    });
  document.querySelectorAll(".empty-state").forEach((el) => {
    el.title = el.textContent.trim();
    el.textContent = el.closest("#pinList") ? "No board" : "No signals";
  });
  const auto = document.getElementById("autoBtn");
  if (auto) {
    auto.title = auto.textContent.trim();
    auto.textContent = "Auto";
  }
  const monitor = document.querySelector(".monitor-panel");
  if (monitor) {
    const b = document.createElement("button");
    b.textContent = "☷";
    b.title = "Show / hide inspector";
    b.setAttribute("aria-label", "Show / hide inspector");
    b.className = "compact-icon";
    b.onclick = () => {
      document.querySelector(".workbench").classList.toggle("inspector-hidden");
    };
    document.querySelector(".toolbar-actions").append(b);
  }
  const output = document.querySelector(".output-panel");
  if (output) {
    const b = document.createElement("button");
    b.textContent = "⌄";
    b.title = "Show / hide output";
    b.setAttribute("aria-label", "Show / hide output");
    b.className = "compact-icon";
    b.onclick = () => output.classList.toggle("output-collapsed");
    document.querySelector(".toolbar-actions").append(b);
  }
}
