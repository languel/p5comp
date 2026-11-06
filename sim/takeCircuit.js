/** A view-only circuit diagram, rendered entirely from the recorded state. */
export function renderTakeCircuit(diagram) {
  const ns = "http://www.w3.org/2000/svg";
  const node = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  };
  const parts = diagram.parts || [],
    positions = new Map();
  const x = Math.min(0, ...parts.map((p) => Number(p.left) || 0)) - 20,
    y = Math.min(0, ...parts.map((p) => Number(p.top) || 0)) - 20;
  const width =
    Math.max(350, ...parts.map((p) => (Number(p.left) || 0) + 155)) - x;
  const height =
    Math.max(180, ...parts.map((p) => (Number(p.top) || 0) + 90)) - y;
  const svg = node("svg", {
    xmlns: ns,
    viewBox: `${x} ${y} ${width} ${height}`,
    width: "100%",
    height: "100%",
    role: "img",
    "aria-label": "Recorded circuit schematic",
  });
  for (const p of parts)
    positions.set(p.id, { x: Number(p.left) || 0, y: Number(p.top) || 0 });
  for (const c of diagram.connections || []) {
    const a = positions.get(String(c[0]).split(":")[0]),
      b = positions.get(String(c[1]).split(":")[0]);
    if (!a || !b) continue;
    svg.append(
      node("line", {
        x1: a.x + 65,
        y1: a.y + 25,
        x2: b.x + 65,
        y2: b.y + 25,
        stroke: /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(c[2]) ? c[2] : "#638fbc",
        "stroke-width": 2,
      }),
    );
    svg.append(
      node(
        "text",
        {
          x: (a.x + b.x) / 2 + 65,
          y: (a.y + b.y) / 2 + 20,
          "font-size": 9,
          fill: "#555",
        },
        `${c[0]} → ${c[1]}`,
      ),
    );
  }
  for (const p of parts) {
    const at = positions.get(p.id);
    svg.append(
      node("rect", {
        x: at.x,
        y: at.y,
        width: 130,
        height: 48,
        rx: 5,
        fill: "#e5e9ec",
        stroke: "#678",
      }),
    );
    svg.append(
      node(
        "text",
        { x: at.x + 6, y: at.y + 18, "font-size": 12, fill: "#202830" },
        p.label || p.id,
      ),
    );
    svg.append(
      node(
        "text",
        { x: at.x + 6, y: at.y + 35, "font-size": 9, fill: "#4b5965" },
        p.type.replace(/^(wokwi|p5comp)-/, ""),
      ),
    );
  }
  return svg;
}
