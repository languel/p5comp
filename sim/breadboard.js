import { BREADBOARD_HOLE_RADIUS } from "./partGeometry.js";
export const isBreadboard = (type) =>
  /^wokwi-breadboard(?:-half|-mini)?$/.test(type);
export function boardSpec(part) {
  const mini =
    part.type === "wokwi-breadboard-mini" || part.attrs?.size === "mini";
  const full = part.attrs?.size === "full";
  return {
    columns: mini ? 17 : full ? 63 : 30,
    rails: !mini,
    width: mini ? 190 : full ? 627 : 313.5,
    height: mini ? 136 : 192,
    top: mini ? 12 : 40,
    bottom: mini ? 78.5 : 106.5,
  };
}
export function breadboardPins(part) {
  const spec = boardSpec(part),
    out = [];
  for (let n = 1; n <= spec.columns; n++) {
    const x = 18 + (n - 1) * 9.5;
    ["a", "b", "c", "d", "e"].forEach((r, i) =>
      out.push({ name: `${n}t.${r}`, x, y: spec.top + i * 9.5 }),
    );
    ["f", "g", "h", "i", "j"].forEach((r, i) =>
      out.push({ name: `${n}b.${r}`, x, y: spec.bottom + i * 9.5 }),
    );
    if (spec.rails)
      for (const [r, y] of [
        ["tp", 12],
        ["tn", 21.5],
        ["bp", 165.4],
        ["bn", 174.9],
      ])
        out.push({ name: `${r}.${n}`, x, y });
  }
  return out;
}
// Actual transformed terminal coordinates, independent of canvas pan and zoom.
export function breadboardContacts(
  parts,
  positions,
  tolerance = BREADBOARD_HOLE_RADIUS,
) {
  const boards = new Set(
    parts.filter((p) => isBreadboard(p.type)).map((p) => p.id),
  );
  const holes = [...positions].filter(([id]) => boards.has(id.split(":")[0]));
  const contacts = [];
  for (const [id, pin] of positions) {
    if (boards.has(id.split(":")[0])) continue;
    let nearest = null,
      distance = tolerance * tolerance;
    for (const [hole, q] of holes) {
      const d = (pin.x - q.x) ** 2 + (pin.y - q.y) ** 2;
      if (d <= distance) {
        nearest = hole;
        distance = d;
      }
    }
    if (nearest) contacts.push([id, nearest]);
  }
  return contacts;
}
export function breadboardSVG(part) {
  const s = boardSpec(part),
    w = s.width,
    h = s.height;
  const holes = breadboardPins(part)
    .map(
      (p) =>
        `<circle class="breadboard-hole" cx="${p.x}" cy="${p.y}" r="${BREADBOARD_HOLE_RADIUS}"/>`,
    )
    .join("");
  const columns = Array.from({ length: s.columns }, (_, i) => i + 1)
    .filter((n) => n === 1 || n % 5 === 0 || n === s.columns)
    .map(
      (n) =>
        `<text class="breadboard-label" text-anchor="middle" x="${18 + (n - 1) * 9.5}" y="${s.top - 5}">${n}</text>`,
    )
    .join("");
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
    .map(
      (r, i) =>
        `<text class="breadboard-label" x="5" y="${(i < 5 ? s.top + i * 9.5 : s.bottom + (i - 5) * 9.5) + 3}">${r}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect class="breadboard" x="1" y="1" width="${w - 2}" height="${h - 2}" rx="5"/><path d="M8 ${s.top + 52.25}H${w - 8}" stroke="#888" opacity=".2"/>${holes}${s.rails ? `<path class="breadboard-rail" stroke="#bc7770" d="M12 6H${w - 13}M12 160.4H${w - 13}"/><path class="breadboard-rail" stroke="#99a4aa" d="M12 28H${w - 13}M12 181.9H${w - 13}"/>` : ""}${columns}${rows}</svg>`;
}

export const breadboardName = (p) =>
  "Breadboard " +
  (boardSpec(p).columns === 17
    ? "mini"
    : boardSpec(p).columns === 63
      ? "long"
      : "medium");
