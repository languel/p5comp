import { partPoint } from "../partGeometry.js";
import { SERVO_SIZE, SERVO_PIVOT } from "../servoAttachments.js";
import { servoModel } from "../servoCatalog.js";

// Exact distance (in wokwi-servo SVG units) from shaft center (91.467, 59.773)
// to the outermost mounting hole (91.467, 13.722) on the white single horn.
export const SERVO_HORN_TIP_RADIUS = 46.051;

export const ACTUATOR_SPECS = Object.freeze({
  "wokwi-servo": {
    kind: "position",
    label: "Servo",
    size: SERVO_SIZE,
    pivot: SERVO_PIVOT,
    baseAngleDeg: -90,
    hornTipRadius: SERVO_HORN_TIP_RADIUS,
  },
  "p5comp-dc-motor": {
    kind: "velocity",
    label: "DC motor",
    size: { w: 126, h: 100 },
    pivot: { x: 73, y: 40 },
    baseAngleDeg: 0,
  },
  "p5comp-gear-motor": {
    kind: "velocity",
    label: "Gear motor",
    size: { w: 126, h: 100 },
    pivot: { x: 73, y: 40 },
    baseAngleDeg: 0,
  },
  "wokwi-stepper-motor": {
    kind: "position",
    label: "Stepper",
    size: { w: 162, h: 162 },
    pivot: { x: 81, y: 81 },
    baseAngleDeg: 0,
  },
  "wokwi-biaxial-stepper": {
    kind: "position",
    label: "Biaxial stepper",
    size: { w: 162, h: 162 },
    pivot: { x: 81, y: 81 },
    baseAngleDeg: 0,
  },
});

export const isActuatorPart = (part) => Boolean(part && ACTUATOR_SPECS[part.type]);

/**
 * Compute the exact world-space position of a wokwi-servo's outermost horn mounting hole
 * at any commanded servo angle (degrees, 0..180; 0° points straight UP in local SVG space).
 */
export function servoHornTip(pivot, angleDeg = 0) {
  if (!pivot || pivot.type !== "wokwi-servo") return null;
  const rad = (((Number(angleDeg) || 0) - 90) * Math.PI) / 180;
  const r = pivot.hornTipRadius ?? SERVO_HORN_TIP_RADIUS;
  const localTip = {
    x: pivot.localPivot.x + Math.cos(rad) * r * (pivot.size.w / SERVO_SIZE.w),
    y: pivot.localPivot.y + Math.sin(rad) * r * (pivot.size.h / SERVO_SIZE.h),
  };
  const world = partPoint(pivot.part, localTip, pivot.size);
  return { x: world.x, y: world.y };
}

/**
 * Compute world-space shaft pivot, horn-tip hole (for servos), and drive metadata for an actuator part.
 */
export function actuatorPivot(part, element = null) {
  const spec = ACTUATOR_SPECS[part?.type];
  if (!spec) return null;
  const body = element?.parentElement;
  const size = {
    w: body?.offsetWidth || spec.size.w,
    h: body?.offsetHeight || spec.size.h,
  };
  const localPivot = {
    x: (spec.pivot.x * size.w) / spec.size.w,
    y: (spec.pivot.y * size.h) / spec.size.h,
  };
  const world = partPoint(part, localPivot, size);
  const flipSign = (part.flipX ? -1 : 1) * (part.flipY ? -1 : 1);
  const partRotateDeg = Number(part.rotate) || 0;
  const baseAngleRad =
    ((partRotateDeg + spec.baseAngleDeg * flipSign) * Math.PI) / 180;
  let maxTorque = 650;
  let stiffness = 3200;
  let damping = 115;
  if (part.type === "wokwi-servo") {
    const profile = servoModel(part);
    const isMetal = profile?.name === "MG90S";
    maxTorque = isMetal ? 950 : 650;
    stiffness = isMetal ? 4400 : 3200;
    damping = isMetal ? 135 : 115;
  } else if (part.type === "p5comp-gear-motor") {
    maxTorque = 600;
    stiffness = 3200;
    damping = 115;
  } else if (part.type === "p5comp-dc-motor") {
    maxTorque = 280;
    stiffness = 2400;
    damping = 96;
  } else if (part.type.includes("stepper")) {
    maxTorque = 1100;
    stiffness = 5000;
    damping = 145;
  }
  const initAngle = Number(element?.angle ?? part.attrs?.angle ?? 0) || 0;
  const info = {
    id: part.id,
    type: part.type,
    kind: spec.kind,
    label: `${spec.label} (${part.id})`,
    part,
    size,
    localPivot,
    hornTipRadius: spec.hornTipRadius || 0,
    x: world.x,
    y: world.y,
    flipSign,
    partRotateDeg,
    baseAngleRad,
    maxTorque,
    stiffness,
    damping,
  };
  if (part.type === "wokwi-servo") {
    info.hornTip = servoHornTip(info, initAngle);
  }
  return info;
}

/** List all actuators in a circuit diagram with their world-space shaft pivots & horn tips. */
export function listActuators(parts = [], partElements = null) {
  const out = [];
  for (const part of parts) {
    if (!isActuatorPart(part)) continue;
    const el = partElements?.get?.(part.id) || null;
    const info = actuatorPivot(part, el);
    if (info) out.push(info);
  }
  return out;
}

/**
 * Convert a live runtime part state (from worker.js / runtime.js) into a motor/kinematic command.
 */
export function actuatorCommand(pivot, state) {
  if (!pivot || !state) return null;
  if (pivot.type === "wokwi-servo") {
    if (state.powered === false || !(state.pulse > 0)) return { mode: "idle" };
    const angleDeg = Number(state.angle);
    if (!Number.isFinite(angleDeg)) return { mode: "idle" };
    const worldDeg = (pivot.partRotateDeg || 0) + (angleDeg - 90) * pivot.flipSign;
    const tip = servoHornTip(pivot, angleDeg);
    return {
      mode: "position",
      targetRad: (worldDeg * Math.PI) / 180,
      hornTip: tip ? [tip.x, tip.y] : null,
      stiffness: pivot.stiffness,
      damping: pivot.damping,
      maxTorque: pivot.maxTorque,
    };
  }
  if (pivot.type === "p5comp-dc-motor" || pivot.type === "p5comp-gear-motor") {
    // Prefer exact velocity from RPM so continuous rotation never wraps/snaps,
    // with high damping so the crank/gear tracks the motor's speed crisply.
    const rpm = Number(state.rpm ?? 0);
    if (!Number.isFinite(rpm) || Math.abs(rpm) < 0.01) {
      return { mode: "velocity", radPerSec: 0, damping: 16, maxTorque: 20 };
    }
    const clampedRpm = Math.max(-360, Math.min(360, rpm));
    const radPerSec = ((clampedRpm * 2 * Math.PI) / 60) * pivot.flipSign;
    return {
      mode: "velocity",
      radPerSec,
      damping: pivot.damping,
      maxTorque: pivot.maxTorque,
    };
  }
  if (pivot.type === "wokwi-stepper-motor" || pivot.type === "wokwi-biaxial-stepper") {
    const angleDeg = Number(state.angle ?? 0);
    if (!Number.isFinite(angleDeg)) return { mode: "idle" };
    const worldDeg = (pivot.partRotateDeg || 0) + angleDeg * pivot.flipSign;
    return {
      mode: "position",
      targetRad: (worldDeg * Math.PI) / 180,
      stiffness: pivot.stiffness,
      damping: pivot.damping,
      maxTorque: pivot.maxTorque,
    };
  }
  return null;
}
