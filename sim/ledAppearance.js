// Presentation exposure only: electrical brightness/current remain unchanged.
export function rgbAppearance(state) {
  const channels = [state.ledRed, state.ledGreen, state.ledBlue].map((v) =>
    Math.max(0, Math.min(1, Number(v) || 0)),
  );
  const peak = Math.max(...channels);
  return {
    color: `rgb(${channels.map((v) => Math.round(peak ? (v / peak) * 255 : 0)).join(", ")})`,
    intensity: Math.min(1, Math.pow(peak, 0.65) * 1.35),
  };
}
export async function paintRGBGlow(element, state) {
  await element.updateComplete;
  const root = element.shadowRoot,
    svg = root?.querySelector("svg");
  if (!svg) return;
  let glow = svg.querySelector("[data-p5comp-glow]");
  if (!glow) {
    const ns = "http://www.w3.org/2000/svg";
    glow = document.createElementNS(ns, "g");
    glow.dataset.p5compGlow = "";
    glow.style.pointerEvents = "none";
    const halo = document.createElementNS(ns, "ellipse");
    for (const [k, v] of Object.entries({ cx: 1.3, cy: 3, rx: 9, ry: 12 }))
      halo.setAttribute(k, v);
    halo.style.filter = "blur(3px)";
    halo.dataset.halo = "";
    glow.append(halo);
    const shell = document.createElementNS(ns, "path");
    shell.setAttribute(
      "d",
      svg.querySelector('path[fill="white"]')?.getAttribute("d") || "",
    );
    shell.dataset.shell = "";
    glow.append(shell);
    const core = document.createElementNS(ns, "ellipse");
    for (const [k, v] of Object.entries({ cx: 1.3, cy: 2, rx: 3.2, ry: 7 }))
      core.setAttribute(k, v);
    core.style.filter = "blur(1.3px)";
    core.dataset.core = "";
    glow.append(core);
    svg.append(glow);
  }
  const { color, intensity } = rgbAppearance(state);
  glow.setAttribute("opacity", intensity);
  for (const child of glow.children) child.setAttribute("fill", color);
  glow.querySelector("[data-halo]").setAttribute("opacity", ".78");
  glow.querySelector("[data-shell]").setAttribute("opacity", ".62");
  glow.querySelector("[data-core]").setAttribute("opacity", ".75");
  // Retain the molded lens highlight, but let the emission show through the frosting.
  const frost = svg.querySelector('path[fill="white"]');
  if (frost) frost.setAttribute("opacity", String(0.65 - intensity * 0.4));
}
