/**
 * Parametric mechanical-engineering presets inspired by ~/dev/mechanisms:
 * - Crank & slider (pins directly to servo horn-tip hole when attached to wokwi-servo!)
 * - Four-bar linkage (with linkage turning-layer separation & coupler curve tracer)
 * - Scotch yoke (pure sinusoidal linear motion from rotary input)
 * - Spur gear pair (meshing involute teeth)
 * - Rack & pinion (rotary to linear)
 * - Cam & follower (eccentric lobe + spring-loaded follower)
 * - Ratchet & pawl (oscillating lever advancing a toothed wheel one direction)
 * - Catapult & ramp (Algodoo-style playground)
 */

import { MATERIAL_DEFAULTS, nextPhysicsId } from "./model.js";

export const MECHANISM_PRESETS = [
  {
    id: "crank-slider",
    name: "Crank & slider",
    tagline: "Rotary actuator in, reciprocating linear piston out",
    build: buildCrankSlider,
  },
  {
    id: "four-bar",
    name: "Four-bar linkage",
    tagline: "Crank, coupler (with pen trail) and grounded rocker",
    build: buildFourBar,
  },
  {
    id: "scotch-yoke",
    name: "Scotch yoke",
    tagline: "Pin in a vertical slot producing pure sinusoidal linear motion",
    build: buildScotchYoke,
  },
  {
    id: "gear-pair",
    name: "Spur gear pair",
    tagline: "Meshing 12T driving gear and 18T driven gear",
    build: buildGearPair,
  },
  {
    id: "rack-pinion",
    name: "Rack & pinion",
    tagline: "Pinion gear driving a linear toothed rack on a slider",
    build: buildRackPinion,
  },
  {
    id: "cam-follower",
    name: "Cam & follower",
    tagline: "Eccentric cam lifting a spring-returned sliding follower",
    build: buildCamFollower,
  },
  {
    id: "ratchet-pawl",
    name: "Ratchet & pawl",
    tagline: "Oscillating lever advancing a toothed wheel in one direction",
    build: buildRatchetPawl,
  },
  {
    id: "curve-track",
    name: "Curved guide track",
    tagline: "Curved arc track constraining a sliding carriage pin (connect a link to drive it)",
    build: buildCurveTrack,
  },
  {
    id: "ball-launcher",
    name: "Catapult & ramp",
    tagline: "Actuator paddle launching bouncy balls onto a sloped track",
    build: buildBallLauncher,
  },
];

function mkId(prefix, taken) {
  const id = nextPhysicsId(prefix, taken);
  taken.push({ id });
  return id;
}

const deg = (r) => (r * 180) / Math.PI;

/**
 * 1. Crank & Slider (~/dev/mechanisms/mechanisms/crank-slider + servo-crank)
 * When attached to a wokwi-servo with `hornTip`, the white servo horn IS the crank
 * and the connecting rod pins directly to its outer mounting hole (0° phase error!).
 */
export function buildCrankSlider({
  origin = [360, 240],
  actuatorId = null,
  actuatorType = null,
  hornTip = null,
  crankRadius = 46,
  rodLength = 148,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const useHornTip = Boolean(actuatorId && actuatorType === "wokwi-servo" && hornTip);
  const rodId = mkId("rod", bTaken);
  const sliderId = mkId("slider", bTaken);

  if (useHornTip) {
    const [pinX, pinY] = hornTip;
    const sliderY = oy;
    const dy = sliderY - pinY;
    const dx = Math.sqrt(Math.max(400, rodLength ** 2 - dy ** 2));
    const sliderX = pinX + dx;
    const rodAngle = deg(Math.atan2(sliderY - pinY, sliderX - pinX));
    const actualLen = Math.hypot(sliderX - pinX, sliderY - pinY);

    return {
      bodies: [
        {
          id: rodId,
          label: "Connecting rod",
          type: "dynamic",
          shape: "link",
          collisionMask: 0,
          x: (pinX + sliderX) / 2,
          y: (pinY + sliderY) / 2,
          angle: rodAngle,
          length: actualLen,
          width: 12,
          color: "#4e8da6",
          ...MATERIAL_DEFAULTS,
          density: 0.7,
        },
        {
          id: sliderId,
          label: "Slider piston",
          type: "dynamic",
          shape: "box",
          x: sliderX,
          y: sliderY,
          angle: 0,
          w: 44,
          h: 28,
          color: "#5b8f74",
          trace: true,
          ...MATERIAL_DEFAULTS,
          density: 0.9,
          friction: 0.05,
        },
      ],
      joints: [
        {
          id: mkId("j", jTaken),
          kind: "hinge",
          a: null,
          b: rodId,
          anchor: [pinX, pinY],
          actuatorId,
          mount: "horn-tip",
        },
        {
          id: mkId("j", jTaken),
          kind: "hinge",
          a: rodId,
          b: sliderId,
          anchor: [sliderX, sliderY],
        },
        {
          id: mkId("j", jTaken),
          kind: "slider",
          a: null,
          b: sliderId,
          anchor: [sliderX, sliderY],
          axis: [1, 0],
          limits: [-crankRadius * 2.5, crankRadius * 2.5],
        },
      ],
    };
  }

  const crankId = mkId("crank", bTaken);
  const pinX = ox + crankRadius;
  const pinY = oy;
  const sliderX = pinX + rodLength;
  const sliderY = oy;

  return {
    bodies: [
      {
        id: crankId,
        label: "Crank",
        type: "dynamic",
        shape: "link",
        collisionMask: 0,
        x: ox + crankRadius / 2,
        y: oy,
        angle: 0,
        length: crankRadius,
        width: 14,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
        density: 1.4,
      },
      {
        id: rodId,
        label: "Connecting rod",
        type: "dynamic",
        shape: "link",
        collisionMask: 0,
        x: pinX + rodLength / 2,
        y: oy,
        angle: 0,
        length: rodLength,
        width: 12,
        color: "#4e8da6",
        ...MATERIAL_DEFAULTS,
        density: 0.8,
      },
      {
        id: sliderId,
        label: "Slider piston",
        type: "dynamic",
        shape: "box",
        x: sliderX,
        y: sliderY,
        angle: 0,
        w: 44,
        h: 28,
        color: "#5b8f74",
        trace: true,
        ...MATERIAL_DEFAULTS,
        density: 1.0,
        friction: 0.05,
      },
    ],
    joints: [
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: crankId,
        anchor: [ox, oy],
        ...(actuatorId
          ? { actuatorId, mount: "shaft" }
          : { motor: { on: true, speed: 90, torque: 260 } }),
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: crankId,
        b: rodId,
        anchor: [pinX, pinY],
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: rodId,
        b: sliderId,
        anchor: [sliderX, sliderY],
      },
      {
        id: mkId("j", jTaken),
        kind: "slider",
        a: null,
        b: sliderId,
        anchor: [sliderX, sliderY],
        axis: [1, 0],
        limits: [-crankRadius * 2.5, crankRadius * 2.5],
      },
    ],
  };
}

/**
 * 2. Four-Bar Linkage (~/dev/mechanisms/mechanisms/four-bar)
 * Grashof crank-rocker geometry on a dedicated linkage turning layer so bars never self-collide.
 */
export function buildFourBar({
  origin = [340, 260],
  actuatorId = null,
  actuatorType = null,
  hornTip = null,
  crankRadius = 46,
  couplerLength = 136,
  rockerLength = 94,
  groundSpan = 148,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const useHornTip = Boolean(actuatorId && actuatorType === "wokwi-servo" && hornTip);
  const ax = useHornTip ? hornTip[0] : ox;
  const ay = useHornTip ? hornTip[1] : oy - crankRadius;
  const gx = ox + groundSpan;
  const gy = oy;

  // Solve circle-circle intersection for joint B (coupler-rocker pin) above ground line.
  const dx = gx - ax;
  const dy = gy - ay;
  const d = Math.hypot(dx, dy);
  const aDist = (couplerLength ** 2 - rockerLength ** 2 + d ** 2) / (2 * d);
  const h = Math.sqrt(Math.max(1, couplerLength ** 2 - aDist ** 2));
  const mx = ax + (aDist * dx) / d;
  const my = ay + (aDist * dy) / d;
  const b1 = [mx + (h * dy) / d, my - (h * dx) / d];
  const b2 = [mx - (h * dy) / d, my + (h * dx) / d];
  const [bx, by] = b1[1] < b2[1] ? b1 : b2;

  const couplerId = mkId("coupler", bTaken);
  const rockerId = mkId("rocker", bTaken);
  const couplerAngle = deg(Math.atan2(by - ay, bx - ax));
  const rockerAngle = deg(Math.atan2(by - gy, bx - gx));

  const bodies = [];
  const joints = [];

  if (!useHornTip) {
    const crankId = mkId("crank", bTaken);
    const crankAngle = deg(Math.atan2(ay - oy, ax - ox));
    bodies.push({
      id: crankId,
      label: "Input crank",
      type: "dynamic",
      shape: "link",
      collisionMask: 0,
      x: (ox + ax) / 2,
      y: (oy + ay) / 2,
      angle: crankAngle,
      length: crankRadius,
      width: 14,
      color: "#d97742",
      ...MATERIAL_DEFAULTS,
      density: 1.4,
    });
    joints.push(
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: crankId,
        anchor: [ox, oy],
        ...(actuatorId
          ? { actuatorId, mount: "shaft" }
          : { motor: { on: true, speed: 85, torque: 280 } }),
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: crankId,
        b: couplerId,
        anchor: [ax, ay],
      },
    );
  } else {
    joints.push({
      id: mkId("j", jTaken),
      kind: "hinge",
      a: null,
      b: couplerId,
      anchor: [ax, ay],
      actuatorId,
      mount: "horn-tip",
    });
  }

  bodies.push(
    {
      id: couplerId,
      label: "Coupler",
      type: "dynamic",
      shape: "link",
      collisionMask: 0,
      x: (ax + bx) / 2,
      y: (ay + by) / 2,
      angle: couplerAngle,
      length: Math.hypot(bx - ax, by - ay),
      width: 12,
      color: "#4e8da6",
      trace: true,
      ...MATERIAL_DEFAULTS,
      density: 0.8,
    },
    {
      id: rockerId,
      label: "Output rocker",
      type: "dynamic",
      shape: "link",
      collisionMask: 0,
      x: (gx + bx) / 2,
      y: (gy + by) / 2,
      angle: rockerAngle,
      length: Math.hypot(bx - gx, by - gy),
      width: 13,
      color: "#5b8f74",
      ...MATERIAL_DEFAULTS,
      density: 0.9,
    },
  );

  joints.push(
    {
      id: mkId("j", jTaken),
      kind: "hinge",
      a: couplerId,
      b: rockerId,
      anchor: [bx, by],
    },
    {
      id: mkId("j", jTaken),
      kind: "hinge",
      a: null,
      b: rockerId,
      anchor: [gx, gy],
    },
  );

  return { bodies, joints };
}

/**
 * 3. Scotch Yoke (~/dev/mechanisms/mechanisms/scotch-yoke)
 * Pin slides vertically inside a slotted yoke constrained to horizontal pure-sine motion.
 */
export function buildScotchYoke({
  origin = [360, 240],
  actuatorId = null,
  actuatorType = null,
  hornTip = null,
  crankRadius = 46,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const useHornTip = Boolean(actuatorId && actuatorType === "wokwi-servo" && hornTip);
  const pinX = useHornTip ? hornTip[0] : ox + crankRadius;
  const pinY = useHornTip ? hornTip[1] : oy;

  const pinBlockId = mkId("pin", bTaken);
  const yokeId = mkId("yoke", bTaken);
  const bodies = [];
  const joints = [];

  if (!useHornTip) {
    const crankId = mkId("crank", bTaken);
    bodies.push({
      id: crankId,
      label: "Crank",
      type: "dynamic",
      shape: "link",
      collisionMask: 0,
      x: ox + crankRadius / 2,
      y: oy,
      angle: 0,
      length: crankRadius,
      width: 14,
      color: "#d97742",
      ...MATERIAL_DEFAULTS,
      density: 1.4,
    });
    joints.push(
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: crankId,
        anchor: [ox, oy],
        ...(actuatorId
          ? { actuatorId, mount: "shaft" }
          : { motor: { on: true, speed: 90, torque: 260 } }),
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: crankId,
        b: pinBlockId,
        anchor: [pinX, pinY],
      },
    );
  } else {
    joints.push({
      id: mkId("j", jTaken),
      kind: "hinge",
      a: null,
      b: pinBlockId,
      anchor: [pinX, pinY],
      actuatorId,
      mount: "horn-tip",
    });
  }

  // Sliding pin carriage (constrained vertically inside the yoke) + horizontal yoke bar.
  bodies.push(
    {
      id: pinBlockId,
      label: "Yoke pin",
      type: "dynamic",
      shape: "circle",
      collisionMask: 0,
      x: pinX,
      y: pinY,
      angle: 0,
      r: 8,
      color: "#d97742",
      ...MATERIAL_DEFAULTS,
      density: 0.6,
    },
    {
      id: yokeId,
      label: "Scotch yoke",
      type: "dynamic",
      shape: "box",
      collisionMask: 0,
      x: pinX,
      y: oy,
      angle: 0,
      w: 22,
      h: crankRadius * 2 + 28,
      color: "#5b8f74",
      trace: true,
      ...MATERIAL_DEFAULTS,
      density: 0.9,
      friction: 0.05,
    },
  );

  joints.push(
    // Pin slides vertically relative to the yoke!
    {
      id: mkId("j", jTaken),
      kind: "slider",
      a: yokeId,
      b: pinBlockId,
      anchor: [pinX, pinY],
      axis: [0, 1],
      limits: [-crankRadius * 1.4, crankRadius * 1.4],
    },
    // Yoke slides horizontally relative to ground!
    {
      id: mkId("j", jTaken),
      kind: "slider",
      a: null,
      b: yokeId,
      anchor: [pinX, oy],
      axis: [1, 0],
      limits: [-crankRadius * 2.2, crankRadius * 2.2],
    },
  );

  return { bodies, joints };
}

/**
 * 4. Spur Gear Pair (~/dev/mechanisms/mechanisms/gear-pair)
 */
export function buildGearPair({
  origin = [360, 240],
  actuatorId = null,
  teethA = 12,
  teethB = 18,
  module = 6,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const pitchA = (teethA * module) / 2;
  const pitchB = (teethB * module) / 2;
  const centerDist = pitchA + pitchB + module * 0.12;
  const phaseB = 180 / teethB;

  const gearAId = mkId("gear", bTaken);
  const gearBId = mkId("gear", bTaken);

  return {
    bodies: [
      {
        id: gearAId,
        label: `Driver gear (${teethA}T)`,
        type: "dynamic",
        shape: "gear",
        x: ox,
        y: oy,
        angle: 0,
        teeth: teethA,
        module,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
        density: 1.5,
        friction: 0.12,
        bounce: 0.05,
      },
      {
        id: gearBId,
        label: `Driven gear (${teethB}T)`,
        type: "dynamic",
        shape: "gear",
        x: ox + centerDist,
        y: oy,
        angle: phaseB,
        teeth: teethB,
        module,
        color: "#4e8da6",
        ...MATERIAL_DEFAULTS,
        density: 1.2,
        friction: 0.12,
        bounce: 0.05,
      },
    ],
    joints: [
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: gearAId,
        anchor: [ox, oy],
        ...(actuatorId
          ? { actuatorId, mount: "shaft" }
          : { motor: { on: true, speed: 75, torque: 280 } }),
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: gearBId,
        anchor: [ox + centerDist, oy],
      },
    ],
  };
}

/**
 * 5. Rack & Pinion (~/dev/mechanisms/mechanisms/rack-pinion)
 */
export function buildRackPinion({
  origin = [360, 230],
  actuatorId = null,
  teeth = 12,
  module = 6,
  rackTeeth = 9,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const pitchR = (teeth * module) / 2;
  const pitch = Math.PI * module;
  const rackW = rackTeeth * pitch;
  const rackY = oy + pitchR + module * 1.45;

  const pinionId = mkId("pinion", bTaken);
  const rackBarId = mkId("rack", bTaken);

  const bodies = [
    {
      id: pinionId,
      label: `Pinion (${teeth}T)`,
      type: "dynamic",
      shape: "gear",
      x: ox,
      y: oy,
      angle: 0,
      teeth,
      module,
      color: "#d97742",
      ...MATERIAL_DEFAULTS,
      density: 1.5,
      friction: 0.15,
      bounce: 0.05,
    },
    {
      id: rackBarId,
      label: "Rack bar",
      type: "dynamic",
      shape: "box",
      x: ox,
      y: rackY,
      angle: 0,
      w: rackW,
      h: 18,
      color: "#5b8f74",
      trace: true,
      ...MATERIAL_DEFAULTS,
      density: 0.8,
      friction: 0.15,
      bounce: 0.05,
    },
  ];

  const joints = [
    {
      id: mkId("j", jTaken),
      kind: "hinge",
      a: null,
      b: pinionId,
      anchor: [ox, oy],
      ...(actuatorId
        ? { actuatorId, mount: "shaft" }
        : { motor: { on: true, speed: 60, torque: 260 } }),
    },
    {
      id: mkId("j", jTaken),
      kind: "slider",
      a: null,
      b: rackBarId,
      anchor: [ox, rackY],
      axis: [1, 0],
      limits: [-rackW * 0.42, rackW * 0.42],
    },
  ];

  const startX = ox - ((rackTeeth - 1) * pitch) / 2;
  for (let i = 0; i < rackTeeth; i++) {
    const tx = startX + i * pitch;
    const ty = rackY - 9 - module * 0.65;
    const toothId = mkId("tooth", bTaken);
    bodies.push({
      id: toothId,
      label: "Rack tooth",
      type: "dynamic",
      shape: "polygon",
      x: tx,
      y: ty,
      angle: 0,
      pts: [
        [-module * 0.58, module * 0.65],
        [-module * 0.28, -module * 0.65],
        [module * 0.28, -module * 0.65],
        [module * 0.58, module * 0.65],
      ],
      color: "#5b8f74",
      ...MATERIAL_DEFAULTS,
      density: 0.4,
      friction: 0.12,
      bounce: 0.05,
    });
    joints.push({
      id: mkId("j", jTaken),
      kind: "weld",
      a: rackBarId,
      b: toothId,
      anchor: [tx, rackY - 9],
    });
  }

  return { bodies, joints };
}

/**
 * 6. Cam & Follower (~/dev/mechanisms/mechanisms/cam-follower)
 */
export function buildCamFollower({
  origin = [360, 260],
  actuatorId = null,
  baseRadius = 32,
  eccentricity = 14,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const camId = mkId("cam", bTaken);
  const followerId = mkId("follower", bTaken);
  const followerY = oy - baseRadius - eccentricity - 24;

  return {
    bodies: [
      {
        id: camId,
        label: "Eccentric cam",
        type: "dynamic",
        shape: "circle",
        x: ox + eccentricity,
        y: oy,
        angle: 0,
        r: baseRadius,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
        density: 1.8,
        friction: 0.08,
        bounce: 0.05,
      },
      {
        id: followerId,
        label: "Follower",
        type: "dynamic",
        shape: "box",
        x: ox,
        y: followerY,
        angle: 0,
        w: 24,
        h: 44,
        color: "#4e8da6",
        trace: true,
        ...MATERIAL_DEFAULTS,
        density: 0.8,
        friction: 0.08,
        bounce: 0.05,
      },
    ],
    joints: [
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: camId,
        anchor: [ox, oy],
        ...(actuatorId
          ? { actuatorId, mount: "shaft" }
          : { motor: { on: true, speed: 95, torque: 260 } }),
      },
      {
        id: mkId("j", jTaken),
        kind: "slider",
        a: null,
        b: followerId,
        anchor: [ox, followerY],
        axis: [0, 1],
        limits: [-60, 40],
      },
      {
        id: mkId("j", jTaken),
        kind: "spring",
        a: null,
        b: followerId,
        pa: [ox, followerY + 34],
        pb: [ox, followerY],
        rest: 24,
        stiffness: 28,
        damping: 3.0,
      },
    ],
  };
}

/**
 * 7. Ratchet & Pawl (~/dev/mechanisms/mechanisms/ratchet-pawl)
 * Back-and-forth drive pawl pushes a toothed ratchet wheel while a spring-loaded holding pawl prevents reversal.
 */
export function buildRatchetPawl({
  origin = [360, 240],
  actuatorId = null,
  actuatorType = null,
  hornTip = null,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const useHornTip = Boolean(actuatorId && actuatorType === "wokwi-servo" && hornTip);
  const wheelX = ox + 135;
  const wheelY = oy + 10;
  const wheelId = mkId("ratchet", bTaken);
  const drivePawlId = mkId("pawl", bTaken);
  const holdPawlId = mkId("hold", bTaken);

  const pinX = useHornTip ? hornTip[0] : ox;
  const pinY = useHornTip ? hornTip[1] : oy;
  const pawlTipX = wheelX - 38;
  const pawlTipY = wheelY - 30;
  const pawlLen = Math.hypot(pawlTipX - pinX, pawlTipY - pinY);
  const pawlAng = deg(Math.atan2(pawlTipY - pinY, pawlTipX - pinX));

  return {
    bodies: [
      {
        id: wheelId,
        label: "Ratchet wheel (14T)",
        type: "dynamic",
        shape: "gear",
        x: wheelX,
        y: wheelY,
        angle: 0,
        teeth: 14,
        module: 6,
        color: "#4e8da6",
        ...MATERIAL_DEFAULTS,
        density: 1.4,
        angularDamping: 0.45,
        friction: 0.25,
        bounce: 0.05,
      },
      {
        id: drivePawlId,
        label: "Drive pawl",
        type: "dynamic",
        shape: "link",
        x: (pinX + pawlTipX) / 2,
        y: (pinY + pawlTipY) / 2,
        angle: pawlAng,
        length: pawlLen,
        width: 11,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
        density: 1.0,
        friction: 0.25,
      },
      {
        id: holdPawlId,
        label: "Holding pawl",
        type: "dynamic",
        shape: "link",
        x: wheelX + 54,
        y: wheelY - 36,
        angle: 162,
        length: 44,
        width: 10,
        color: "#5b8f74",
        ...MATERIAL_DEFAULTS,
        density: 0.8,
        friction: 0.2,
      },
    ],
    joints: [
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: wheelId,
        anchor: [wheelX, wheelY],
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: drivePawlId,
        anchor: [pinX, pinY],
        ...(useHornTip
          ? { actuatorId, mount: "horn-tip" }
          : actuatorId
            ? { actuatorId, mount: "shaft" }
            : { motor: { on: true, speed: 60, torque: 200 } }),
      },
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: holdPawlId,
        anchor: [wheelX + 74, wheelY - 42],
        limits: [-28, 18],
      },
      {
        id: mkId("j", jTaken),
        kind: "spring",
        a: null,
        b: holdPawlId,
        pa: [wheelX + 44, wheelY - 12],
        pb: [wheelX + 42, wheelY - 32],
        rest: 14,
        stiffness: 18,
        damping: 2.5,
      },
    ],
  };
}

/**
 * 8. Algodoo-style Catapult / Paddle & Ramp Contraption
 */
export function buildBallLauncher({
  origin = [360, 260],
  actuatorId = null,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const paddleId = mkId("paddle", bTaken);
  const rampId = mkId("ramp", bTaken);
  const ball1Id = mkId("ball", bTaken);
  const ball2Id = mkId("ball", bTaken);

  return {
    bodies: [
      {
        id: paddleId,
        label: "Actuator arm",
        type: "dynamic",
        shape: "link",
        x: ox + 45,
        y: oy,
        angle: 0,
        length: 100,
        width: 14,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
        density: 2.0,
        bounce: 0.55,
      },
      {
        id: rampId,
        label: "Catch ramp",
        type: "static",
        shape: "chain",
        x: ox + 170,
        y: oy + 65,
        angle: 0,
        pts: [
          [-90, -18],
          [40, 24],
          [130, 24],
          [145, -24],
        ],
        thickness: 8,
        color: "#6c7b88",
        ...MATERIAL_DEFAULTS,
        friction: 0.25,
        bounce: 0.35,
      },
      {
        id: ball1Id,
        label: "Rubber ball",
        type: "dynamic",
        shape: "circle",
        x: ox + 78,
        y: oy - 36,
        angle: 0,
        r: 14,
        color: "#c45b4a",
        trace: true,
        ...MATERIAL_DEFAULTS,
        density: 0.9,
        friction: 0.6,
        bounce: 0.78,
      },
      {
        id: ball2Id,
        label: "Steel ball",
        type: "dynamic",
        shape: "circle",
        x: ox + 125,
        y: oy - 50,
        angle: 0,
        r: 11,
        color: "#5b8f74",
        ...MATERIAL_DEFAULTS,
        density: 2.2,
        friction: 0.3,
        bounce: 0.5,
      },
    ],
    joints: [
      {
        id: mkId("j", jTaken),
        kind: "hinge",
        a: null,
        b: paddleId,
        anchor: [ox, oy],
        ...(actuatorId
          ? { actuatorId, mount: "shaft" }
          : { motor: { on: true, speed: 120, torque: 240 } }),
      },
    ],
  };
}

/**
 * 9. Curved Guide Track (general `curve` constraint building block)
 * Drops a smooth arc track with a sliding carriage pin at its start point.
 * Connect a link bar to the carriage pin to drive it along the curve!
 */
export function buildCurveTrack({
  origin = [360, 240],
  radius = 90,
  spanDeg = 120,
  existingBodies = [],
  existingJoints = [],
} = {}) {
  const bTaken = [...existingBodies];
  const jTaken = [...existingJoints];
  const [ox, oy] = origin;

  const carId = mkId("car", bTaken);
  const pts = [];
  const steps = 16;
  const startRad = ((-90 - spanDeg / 2) * Math.PI) / 180;
  const endRad = ((-90 + spanDeg / 2) * Math.PI) / 180;
  const cx = ox;
  const cy = oy + radius;
  for (let i = 0; i <= steps; i++) {
    const a = startRad + (i / steps) * (endRad - startRad);
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  const mid = pts[Math.floor(pts.length / 2)];

  return {
    bodies: [
      {
        id: carId,
        label: "Curve carriage",
        type: "dynamic",
        shape: "circle",
        collisionMask: 1,
        x: mid[0],
        y: mid[1],
        angle: 0,
        r: 10,
        color: "#4e8da6",
        trace: true,
        ...MATERIAL_DEFAULTS,
        density: 1.0,
      },
    ],
    joints: [
      {
        id: mkId("j", jTaken),
        kind: "curve",
        a: null,
        b: carId,
        anchor: [mid[0], mid[1]],
        pts,
        closed: false,
        friction: 0.03,
      },
    ],
  };
}
