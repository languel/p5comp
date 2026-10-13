export const BREADBOARD_HOLE_RADIUS = 1.8;
export const CONNECTION_DOT_RADIUS = BREADBOARD_HOLE_RADIUS * 1.12;
export const usesOriginalColors = (p) =>
  !p.attrs?.tint && p.attrs?.appearance !== "gray";
// Match CSS rotate(...) scale(...) about the component body's center.
export function partPoint(p, q, size) {
  const a = ((p.rotate || 0) * Math.PI) / 180;
  const x = (q.x - size.w / 2) * (p.flipX ? -1 : 1);
  const y = (q.y - size.h / 2) * (p.flipY ? -1 : 1);
  return {
    x: p.left + size.w / 2 + x * Math.cos(a) - y * Math.sin(a),
    y: p.top + size.h / 2 + x * Math.sin(a) + y * Math.cos(a),
  };
}
export function partBounds(p, size) {
  const corners = [
    { x: 0, y: 0 },
    { x: size.w, y: 0 },
    { x: 0, y: size.h },
    { x: size.w, y: size.h },
  ].map((q) => partPoint(p, q, size));
  const x = Math.min(...corners.map((q) => q.x)),
    y = Math.min(...corners.map((q) => q.y));
  return {
    id: p.id,
    x,
    y,
    w: Math.max(...corners.map((q) => q.x)) - x,
    h: Math.max(...corners.map((q) => q.y)) - y,
  };
}
export function intersects(a, b) {
  return (
    a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
  );
}
export function lineInBox(points, b) {
  // Liang-Barsky clipping catches lines through the box, without bounding-box false positives.
  return points.slice(1).some((q, i) => {
    const p = points[i],
      dx = q.x - p.x,
      dy = q.y - p.y;
    let lo = 0,
      hi = 1;
    for (const [u, v] of [
      [-dx, p.x - b.x],
      [dx, b.x + b.w - p.x],
      [-dy, p.y - b.y],
      [dy, b.y + b.h - p.y],
    ]) {
      if (u === 0) {
        if (v < 0) return false;
      } else {
        const t = v / u;
        if (u < 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
        if (lo > hi) return false;
      }
    }
    return true;
  });
}
export function freePoint(id) {
  if (typeof id !== "string" || !id.startsWith("free:")) return null;
  const coords = id.slice(5).split(",");
  if (coords.some((n) => !n.trim())) return null;
  const nums = coords.map(Number);
  return nums.length === 2 &&
    nums.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e9)
    ? { x: nums[0], y: nums[1] }
    : null;
}
export const freeEnd = (p) =>
  `free:${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
