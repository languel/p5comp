import { partPoint } from "./partGeometry.js";

export const SERVO_SIZE = { w: 170.08, h: 119.55 };
export const SERVO_PIVOT = { x: 91.467, y: 59.773 };
export const ATTACHMENT_KINDS = ["arm", "arc", "pen", "drawing"];
export function validateServoAttachment(a) {
  if (a == null) return;
  if (
    typeof a !== "object" ||
    Array.isArray(a) ||
    !ATTACHMENT_KINDS.includes(a.kind)
  )
    throw Error("Servo attachment needs an arm, arc, pen or drawing kind.");
  for (const [key, min, max] of [
    ["length", 10, 600],
    ["offset", -360, 360],
    ["pivotX", 0, 1],
    ["pivotY", 0, 1],
    ["aspect", 0.05, 20],
  ]) {
    if (
      a[key] != null &&
      (!Number.isFinite(a[key]) || a[key] < min || a[key] > max)
    )
      throw Error(`Servo attachment ${key} must be between ${min} and ${max}.`);
  }
  if (a.color != null && !/^#[\da-f]{6}$/i.test(a.color))
    throw Error("Servo attachment color must be a hex color.");
  if (a.trace != null && typeof a.trace !== "boolean")
    throw Error("Servo attachment trace must be boolean.");
  if (
    a.kind === "drawing" &&
    (typeof a.asset !== "string" || !a.asset.length || a.asset.length > 200)
  )
    throw Error("Drawing attachment needs a project asset name.");
}
export function attachmentPose(part, angle = 0, size = SERVO_SIZE) {
  const a = part.attrs?.servoAttachment;
  if (!a) return null;
  const pivot = {
    x: (SERVO_PIVOT.x * size.w) / SERVO_SIZE.w,
    y: (SERVO_PIVOT.y * size.h) / SERVO_SIZE.h,
  };
  const degrees = angle - 90 + (a.offset || 0),
    rad = (degrees * Math.PI) / 180;
  const length = a.length ?? 180;
  const tip = partPoint(
    part,
    {
      x: pivot.x + Math.cos(rad) * length,
      y: pivot.y + Math.sin(rad) * length,
    },
    size,
  );
  return {
    pivot: partPoint(part, pivot, size),
    tip,
    transform: `translate(${part.left} ${part.top}) translate(${size.w / 2} ${size.h / 2}) rotate(${part.rotate || 0}) scale(${part.flipX ? -1 : 1} ${part.flipY ? -1 : 1}) translate(${-size.w / 2} ${-size.h / 2}) translate(${pivot.x} ${pivot.y}) rotate(${degrees})`,
  };
}
export function attachmentBounds(part, size = SERVO_SIZE) {
  if (part.type !== "wokwi-servo" || !part.attrs?.servoAttachment) return null;
  const a = part.attrs.servoAttachment,
    pivot = attachmentPose(part, 0, size).pivot;
  const length = a.length ?? 180;
  const radius =
    a.kind === "drawing"
      ? length *
        Math.hypot(
          Math.max(a.pivotX ?? 0, 1 - (a.pivotX ?? 0)),
          Math.max(a.pivotY ?? 0.5, 1 - (a.pivotY ?? 0.5)) / (a.aspect || 1),
        )
      : length;
  return {
    x: pivot.x - radius - 8,
    y: pivot.y - radius - 8,
    w: radius * 2 + 16,
    h: radius * 2 + 16,
  };
}
// A capped sample trail, never written to the project or the circuit undo history.
export function addPenPoint(points, point, limit = 1200) {
  const last = points.at(-1);
  if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.7)
    return false;
  points.push(point);
  if (points.length > limit) points.splice(0, points.length - limit);
  return true;
}
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs))
    e.setAttribute(key, String(value));
  return e;
};
export class ServoAttachments {
  constructor(world) {
    this.layer = svg("svg", {
      class: "servo-attachments",
      width: 1,
      height: 1,
      "aria-label": "Servo attachments and pen trails",
    });
    this.layer.style.cssText =
      "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:3";
    world.append(this.layer);
    this.items = new Map();
  }
  clearTrails() {
    for (const item of this.items.values()) {
      item.points = [];
      item.trail.setAttribute("d", "");
    }
  }
  render(parts, elements, assets = {}) {
    this.layer.replaceChildren();
    this.items.clear();
    for (const part of parts) {
      const a = part.type === "wokwi-servo" && part.attrs?.servoAttachment;
      if (!a) continue;
      const color = a.color || "#528d9b",
        length = a.length ?? 180;
      const trail = svg("path", {
        fill: "none",
        stroke: color,
        "stroke-width": 1.4,
        "stroke-opacity": 0.45,
        "stroke-linecap": "round",
        "data-servo-trail": part.id,
      });
      const group = svg("g", { "data-servo-attachment": part.id });
      if (a.kind === "drawing") {
        const asset = assets[a.asset];
        if (asset?.src?.startsWith("data:image/")) {
          const height = length / (a.aspect || 1);
          group.append(
            svg("image", {
              href: asset.src,
              width: length,
              height,
              x: -length * (a.pivotX ?? 0),
              y: -height * (a.pivotY ?? 0.5),
            }),
          );
        } else {
          const warning = svg("text", {
            x: 12,
            y: 0,
            fill: "#ad5d48",
            "font-size": 11,
          });
          warning.textContent = `Missing artwork: ${a.asset}`;
          group.append(warning);
        }
      } else {
        const arc = a.kind === "arc";
        group.append(
          svg("path", {
            d: arc
              ? `M0 0 Q${length * 0.5} ${-length * 0.65} ${length} 0`
              : `M0 0L${length} 0`,
            fill: "none",
            stroke: color,
            "stroke-width": a.kind === "pen" ? 3 : 7,
            "stroke-linecap": "round",
          }),
        );
        group.append(
          svg("circle", {
            cx: length,
            cy: 0,
            r: a.kind === "pen" ? 4 : 3,
            fill: color,
          }),
        );
      }
      group.append(
        svg("circle", {
          cx: 0,
          cy: 0,
          r: 4.5,
          fill: color,
          stroke: "#fff",
          "stroke-width": 1,
        }),
      );
      this.layer.append(trail, group);
      this.items.set(part.id, {
        part,
        element: elements.get(part.id),
        group,
        trail,
        points: [],
      });
    }
    this.update({}, false);
  }
  update(states = {}, record = false) {
    for (const [id, item] of this.items) {
      const body = item.element?.parentElement;
      const size = {
        w: body?.offsetWidth || SERVO_SIZE.w,
        h: body?.offsetHeight || SERVO_SIZE.h,
      };
      const angle = states[id]?.angle ?? item.element?.angle ?? 0;
      const pose = attachmentPose(item.part, angle, size);
      item.group.setAttribute("transform", pose.transform);
      if (
        record &&
        states[id]?.powered &&
        states[id]?.pulse > 0 &&
        item.part.attrs.servoAttachment.trace &&
        addPenPoint(item.points, pose.tip)
      )
        item.trail.setAttribute(
          "d",
          item.points
            .map(
              (p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
            )
            .join(""),
        );
    }
  }
}
