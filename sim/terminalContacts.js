import { isBreadboard } from "./breadboard.js";
import { BREADBOARD_HOLE_RADIUS } from "./partGeometry.js";
const owner = (id) => id.split(":")[0];
const pairKey = ([a, b]) => [a, b].sort().join("|");
// Exposed leads and male headers mate with sockets, never with each other.
export function connectorRole(part, terminal) {
  const override =
    part?.attrs?.connectors?.[terminal] || part?.attrs?.connector;
  if (["socket", "pin", "contact"].includes(override)) return override;
  return isBreadboard(part?.type || "") ||
    ["wokwi-arduino-uno", "wokwi-arduino-mega"].includes(part?.type)
    ? "socket"
    : "pin";
}
export function terminalContacts(
  parts,
  positions,
  detached = [],
  tolerance = BREADBOARD_HOLE_RADIUS,
) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const sockets = [],
    pins = [];
  for (const [id, p] of positions) {
    const part = byId.get(owner(id));
    if (!part) continue;
    const role = connectorRole(part, id.slice(id.indexOf(":") + 1));
    if (role === "socket") sockets.push([id, p]);
    if (role === "pin") pins.push([id, p]);
  }
  const blocked = new Set(detached.map(pairKey)),
    contacts = [];
  for (const [id, p] of pins) {
    let nearest = null,
      distance = tolerance * tolerance;
    for (const [socket, q] of sockets) {
      if (owner(id) === owner(socket)) continue;
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d <= distance) {
        nearest = socket;
        distance = d;
      }
    }
    if (nearest && !blocked.has(pairKey([id, nearest])))
      contacts.push([id, nearest]);
  }
  return contacts;
}
export function syncSeating(diagram, positions) {
  const known = new Set(diagram.parts.map((p) => p.id));
  if (diagram.groups)
    diagram.groups = diagram.groups
      .map((g) => g.filter((id) => known.has(id)))
      .filter((g) => g.length > 1);
  const raw = terminalContacts(diagram.parts, positions);
  const present = new Set(raw.map(pairKey));
  const blocked = (diagram.detachedContacts || []).filter((pair) =>
    present.has(pairKey(pair)),
  );
  const contacts = terminalContacts(diagram.parts, positions, blocked);
  const changed =
    JSON.stringify(diagram.attachments || []) !== JSON.stringify(contacts) ||
    JSON.stringify(diagram.detachedContacts || []) !== JSON.stringify(blocked);
  if (contacts.length || diagram.attachments) diagram.attachments = contacts;
  if (blocked.length || diagram.detachedContacts)
    diagram.detachedContacts = blocked;
  return changed;
}
export function unplugContacts(diagram, pairs) {
  const keys = new Set(pairs.map(pairKey));
  diagram.attachments = (diagram.attachments || []).filter(
    (pair) => !keys.has(pairKey(pair)),
  );
  diagram.detachedContacts = [
    ...new Map(
      [...(diagram.detachedContacts || []), ...pairs].map((pair) => [
        pairKey(pair),
        pair,
      ]),
    ).values(),
  ];
}
// Manual groups move symmetrically; mounted parts follow only their receiving host.
export function movingParts(diagram, roots, followMounts = true) {
  const known = new Set(diagram.parts.map((p) => p.id)),
    result = new Set([...roots].filter((id) => known.has(id)));
  let size;
  do {
    size = result.size;
    for (const group of diagram.groups || [])
      if (group.some((id) => result.has(id)))
        for (const id of group) if (known.has(id)) result.add(id);
    for (const [child, host] of followMounts ? diagram.attachments || [] : [])
      if (result.has(owner(host)) && known.has(owner(child)))
        result.add(owner(child));
  } while (size !== result.size);
  return result;
}
export function groupParts(diagram, ids) {
  const selected = new Set(ids);
  const rest = [];
  let groups = diagram.groups || [],
    changed = true;
  while (changed) {
    changed = false;
    const remaining = [];
    for (const group of groups) {
      if (group.some((id) => selected.has(id))) {
        for (const id of group) selected.add(id);
        changed = true;
      } else remaining.push(group);
    }
    groups = remaining;
  }
  rest.push(...groups);
  if (selected.size > 1) rest.push([...selected]);
  diagram.groups = rest;
}
export function ungroupParts(diagram, ids) {
  const remove = new Set(ids);
  diagram.groups = (diagram.groups || [])
    .map((g) => g.filter((id) => !remove.has(id)))
    .filter((g) => g.length > 1);
}

// Magnetize mating terminals during placement, independently of the workbench grid.
export function snapInsertion(
  diagram,
  positions,
  moving,
  dx,
  dy,
  tolerance = 4,
) {
  const parts = new Map(diagram.parts.map((p) => [p.id, p]));
  const list = [...positions].map(([id, p]) => ({
    id,
    p,
    role: connectorRole(parts.get(owner(id)), id.slice(id.indexOf(":") + 1)),
    moving: moving.has(owner(id)),
  }));
  let best = null;
  for (const a of list.filter((t) => t.moving))
    for (const b of list.filter((t) => !t.moving)) {
      if (!(
        (a.role === "pin" && b.role === "socket") ||
        (a.role === "socket" && b.role === "pin")
      ))
        continue;
      const distance = Math.hypot(a.p.x + dx - b.p.x, a.p.y + dy - b.p.y);
      if (distance > tolerance) continue;
      const x = b.p.x - a.p.x,
        y = b.p.y - a.p.y;
      const translated = new Map(
        [...positions].map(([id, p]) => [
          id,
          moving.has(owner(id)) ? { ...p, x: p.x + x, y: p.y + y } : p,
        ]),
      );
      const score = terminalContacts(diagram.parts, translated).filter(
        ([c, h]) => moving.has(owner(c)) !== moving.has(owner(h)),
      ).length;
      if (
        !best ||
        score > best.score ||
        (score === best.score && distance < best.distance)
      )
        best = { dx: x, dy: y, score, distance };
    }
  return best;
}
