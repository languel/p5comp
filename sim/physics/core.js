/**
 * Deterministic 60 Hz Rapier 2D physics engine for p5comp.
 * Modeled directly on artistmodelstudio/src/physics/core.js, extended with:
 * - Prismatic (slider) joints for crank-slider, rack-and-pinion, cam-follower, scotch-yoke
 * - Compound spur gear colliders that physically mesh
 * - Real-time Arduino actuator coupling (servos, DC motors, gear motors, steppers)
 * - Live pointer spring grabber for Algodoo-style direct manipulation while running
 */

import {
  collidersForBody,
  collisionGroupForBody,
  bodyLocalToWorld,
  worldToBodyLocal,
  projectPointToPolyline,
  WORLD_DEFAULTS,
} from "./model.js";
import { actuatorCommand } from "./actuators.js";

export const DT = 1 / 60;
const CHECKPOINT_INTERVAL = 30;
const MAX_CHECKPOINTS = 300;
const FAR_SEEK_STEPS = 90;

let rapierPromise = null;
export function loadRapier() {
  if (!rapierPromise) {
    rapierPromise = import("@dimforge/rapier2d-deterministic-compat").then(
      async ({ default: R }) => {
        await R.init({});
        return R;
      },
    );
  }
  return rapierPromise;
}

export function createPhysicsCore(R, scene, actuatorPivots = new Map()) {
  const W = { ...WORLD_DEFAULTS, ...(scene.world || {}) };
  const ppm = W.ppm || 50;
  const m = (v) => v / ppm;

  let world = new R.World({
    x: W.gravity?.[0] ?? 0,
    y: W.gravity?.[1] ?? 9.8,
  });
  world.timestep = DT;
  world.numSolverIterations = Math.max(1, Math.round(W.iterations || 8));

  const queue = new R.EventQueue(true);
  const handleOf = new Map();
  const idOfCollider = new Map();
  const jointHandle = new Map();
  const jointMeta = new Map();
  const restOf = new Map();
  const moving = [];

  // Fixed world ground body at origin.
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());

  for (const b of scene.bodies || []) {
    const desc =
      b.type === "dynamic"
        ? R.RigidBodyDesc.dynamic()
        : b.type === "kinematic"
          ? R.RigidBodyDesc.kinematicPositionBased()
          : R.RigidBodyDesc.fixed();
    const initAngle = ((b.angle || 0) * Math.PI) / 180;
    desc.setTranslation(m(b.x), m(b.y));
    desc.setRotation(initAngle);
    if (b.type === "dynamic") {
      desc
        .setLinearDamping(b.damping ?? 0.08)
        .setAngularDamping(b.angularDamping ?? 0.08)
        .setCcdEnabled(true);
      if (Array.isArray(b.v)) desc.setLinvel(m(b.v[0] || 0), m(b.v[1] || 0));
      if (b.spin) desc.setAngvel((b.spin * Math.PI) / 180);
    }
    const body = world.createRigidBody(desc);
    handleOf.set(b.id, body.handle);
    restOf.set(b.id, { x: b.x, y: b.y, a: initAngle });
    if (b.type !== "static") moving.push(b.id);

    for (const s of collidersForBody(b)) {
      const cd = colliderOf(R, s, m);
      if (!cd) continue;
      cd.setDensity(b.density ?? 1.2)
        .setFriction(b.friction ?? 0.45)
        .setRestitution(b.bounce ?? 0.25)
        .setSensor(b.type === "sensor" || Boolean(b.sensor));
      cd.setCollisionGroups(collisionGroupForBody(b));
      cd.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      const col = world.createCollider(cd, body);
      idOfCollider.set(col.handle, b.id);
    }
  }

  // Optional floor boundary.
  if (W.floor) {
    const fy = Number.isFinite(W.floorY) ? W.floorY : 560;
    const floorBody = world.createRigidBody(R.RigidBodyDesc.fixed());
    const col = world.createCollider(
      R.ColliderDesc.cuboid(m(4000), m(20))
        .setTranslation(m(500), m(fy + 20))
        .setFriction(0.6)
        .setRestitution(0.2)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      floorBody,
    );
    idOfCollider.set(col.handle, "#floor");
  }

  const localAnchor = (bodyId, worldPt) => {
    if (!bodyId) return { x: m(worldPt[0]), y: m(worldPt[1]) };
    const rest = restOf.get(bodyId);
    const [lx, ly] = worldToBodyLocal(rest, worldPt[0], worldPt[1]);
    return { x: m(lx), y: m(ly) };
  };
  const bodyOf = (id) => (id ? world.getRigidBody(handleOf.get(id)) : ground);
  const kinematicPinHandle = new Map(); // jointId -> kinematic RigidBody handle (for servo horn-tip pins)
  const curveConstraints = []; // General curve/spline track constraints solved every 60 Hz step

  for (const j of scene.joints || []) {
    if (j.kind === "curve") {
      const targetId = j.b || j.a;
      if (!targetId || !handleOf.has(targetId) || !Array.isArray(j.pts) || j.pts.length < 2) continue;
      const rest = restOf.get(targetId);
      const anchorWorld = Array.isArray(j.anchor) ? j.anchor : [rest.x, rest.y];
      const [lx, ly] = worldToBodyLocal(rest, anchorWorld[0], anchorWorld[1]);
      curveConstraints.push({
        id: j.id,
        bodyId: targetId,
        localAnchor: [lx, ly],
        pts: j.pts.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]),
        closed: Boolean(j.closed),
        friction: Number.isFinite(j.friction) ? j.friction : 0.04,
      });
      continue;
    }
    if ((j.a && !handleOf.has(j.a)) || (j.b && !handleOf.has(j.b))) continue;
    if (!j.a && !j.b) continue;

    // Normalize single-body joints so ground/kinematic pin is always body1 (aId = null) and dynamic body is body2.
    let aId = j.a || null;
    let bId = j.b || null;
    let pa = j.pa;
    let pb = j.pb;
    if (aId && !bId) {
      bId = aId;
      aId = null;
      if (j.kind === "spring") {
        pa = j.pb;
        pb = j.pa;
      }
    }

    let data = null;
    const pivot = j.actuatorId ? actuatorPivots.get(j.actuatorId) : null;
    const isHornTip =
      j.kind === "hinge" &&
      Boolean(j.actuatorId) &&
      j.mount === "horn-tip" &&
      pivot?.type === "wokwi-servo";
    const anchor = isHornTip
      ? j.anchor || (pivot.hornTip ? [pivot.hornTip.x, pivot.hornTip.y] : [pivot.x, pivot.y])
      : j.anchor || (pivot ? [pivot.x, pivot.y] : [0, 0]);

    let body1 = bodyOf(aId);
    const body2 = bodyOf(bId);

    if (isHornTip) {
      // Create a kinematic pin right on the white servo horn's outer mounting hole.
      // Moving this kinematic pin directly from state.angle guarantees 0.00° phase error!
      const pinBody = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(m(anchor[0]), m(anchor[1])),
      );
      kinematicPinHandle.set(j.id, pinBody.handle);
      body1 = pinBody;
      const a2 = localAnchor(bId, anchor);
      data = R.JointData.revolute({ x: 0, y: 0 }, a2);
    } else if (j.kind === "spring") {
      const a1 = localAnchor(aId, pa);
      const a2 = localAnchor(bId, pb);
      const restLen =
        Number.isFinite(j.rest) && j.rest > 0
          ? j.rest
          : Math.hypot((pb[0] || 0) - (pa[0] || 0), (pb[1] || 0) - (pa[1] || 0));
      data = R.JointData.spring(
        m(restLen),
        Number.isFinite(j.stiffness) ? j.stiffness : 40,
        Number.isFinite(j.damping) ? j.damping : 2.0,
        a1,
        a2,
      );
    } else if (j.kind === "weld") {
      const a1 = localAnchor(aId, anchor);
      const a2 = localAnchor(bId, anchor);
      const rot1 = aId ? restOf.get(aId).a : 0;
      const rot2 = bId ? restOf.get(bId).a : 0;
      data = R.JointData.fixed(a1, 0, a2, rot2 - rot1);
    } else if (j.kind === "slider") {
      const a1 = localAnchor(aId, anchor);
      const a2 = localAnchor(bId, anchor);
      const rawAxis = Array.isArray(j.axis) ? j.axis : [1, 0];
      const len = Math.hypot(rawAxis[0], rawAxis[1]) || 1;
      // Express axis in body1's local frame.
      const rot1 = aId ? restOf.get(aId).a : 0;
      const cs = Math.cos(-rot1);
      const sn = Math.sin(-rot1);
      const ux = rawAxis[0] / len;
      const uy = rawAxis[1] / len;
      const axisLocal = { x: ux * cs - uy * sn, y: ux * sn + uy * cs };
      data = R.JointData.prismatic(a1, a2, axisLocal);
    } else {
      // Revolute hinge (with optional limits, motor, or actuator binding).
      const a1 = localAnchor(aId, anchor);
      const a2 = localAnchor(bId, anchor);
      data = R.JointData.revolute(a1, a2);
    }

    const joint = world.createImpulseJoint(data, body1, body2, true);
    jointHandle.set(j.id, joint.handle);
    const initRelAngle =
      (bId ? restOf.get(bId).a : 0) - (aId ? restOf.get(aId).a : 0);
    jointMeta.set(j.id, {
      ...j,
      aId,
      bId,
      isHornTip,
      initRelAngle,
    });

    if (j.kind === "hinge") {
      if (Array.isArray(j.limits) && j.limits.length === 2) {
        joint.setLimits(
          (j.limits[0] * Math.PI) / 180,
          (j.limits[1] * Math.PI) / 180,
        );
      }
      if (j.motor && j.motor.on !== false && !j.actuatorId) {
        const speedRad = ((Number(j.motor.speed) || 0) * Math.PI) / 180;
        const torque = Math.max(0.5, Number(j.motor.torque ?? 180));
        joint.configureMotorVelocity(speedRad, Math.max(0.5, torque / 10));
        joint.setMotorMaxForce?.(torque);
      }
    } else if (j.kind === "slider") {
      if (Array.isArray(j.limits) && j.limits.length === 2) {
        joint.setLimits(m(j.limits[0]), m(j.limits[1]));
      }
    }

    // Joined bodies do not collide with each other (crank & rod, gear & housing).
    if (aId && bId) joint.setContactsEnabled?.(false);
  }

  // Pointer grab state (temporary kinematic spring for Algodoo-style live dragging).
  let grab = null;

  let n = 0;
  const checkpoints = new Map([[0, world.takeSnapshot()]]);
  let beforeVel = null;

  const contactPoint = (c1, c2) => {
    let p = null;
    try {
      world.contactPair(world.getCollider(c1), world.getCollider(c2), (manifold) => {
        if (!p && manifold.numSolverContacts() > 0) p = manifold.solverContactPoint(0);
      });
    } catch {
      /* ignore */
    }
    return p;
  };

  const speedBetween = (a, b) => {
    const va = beforeVel?.get(a) || { x: 0, y: 0 };
    const vb = beforeVel?.get(b) || { x: 0, y: 0 };
    return Math.hypot((va.x || 0) - (vb.x || 0), (va.y || 0) - (vb.y || 0)) * ppm;
  };

  function applyCurveConstraints() {
    for (const c of curveConstraints) {
      const body = world.getRigidBody(handleOf.get(c.bodyId));
      if (!body || !body.isDynamic()) continue;
      const pos = body.translation();
      const rot = body.rotation();
      const pose = { x: pos.x * ppm, y: pos.y * ppm, a: rot };
      const [ax, ay] = bodyLocalToWorld(pose, c.localAnchor[0], c.localAnchor[1]);
      const proj = projectPointToPolyline(ax, ay, c.pts, c.closed);
      if (!proj) continue;

      const vel = body.linvel();
      const vx = vel.x * ppm;
      const vy = vel.y * ppm;
      const errX = proj.x - ax;
      const errY = proj.y - ay;

      // Cancel normal velocity and pull anchor tightly back onto the curve (Baumgarte-style position correction).
      const vT = vx * proj.tx + vy * proj.ty;
      const corrRate = 0.85 / DT;
      const damp = Math.max(0, 1 - c.friction * DT);
      let nextVx = proj.tx * vT * damp + errX * corrRate;
      let nextVy = proj.ty * vT * damp + errY * corrRate;

      // End-stops on open curves so the pin stops cleanly at the ends instead of flying off.
      if ((proj.atStart && vT < 0) || (proj.atEnd && vT > 0)) {
        nextVx = errX * corrRate;
        nextVy = errY * corrRate;
      }

      body.setLinvel({ x: m(nextVx), y: m(nextVy) }, true);
    }
  }

  function stepOnce(events) {
    beforeVel = events
      ? new Map(
          moving.map((id) => [
            id,
            world.getRigidBody(handleOf.get(id))?.linvel() || { x: 0, y: 0 },
          ]),
        )
      : null;

    applyCurveConstraints();
    world.step(queue);
    n++;

    queue.drainCollisionEvents((h1, h2, started) => {
      if (!events) return;
      const a = idOfCollider.get(h1);
      const b = idOfCollider.get(h2);
      if (a == null || b == null) return;
      const p = started ? contactPoint(h1, h2) : null;
      const pos =
        p ||
        (handleOf.has(a) ? world.getRigidBody(handleOf.get(a))?.translation() : null) ||
        { x: 0, y: 0 };
      events.push({
        t: n * DT,
        type: started ? "collide" : "release",
        a,
        b,
        x: pos.x * ppm,
        y: pos.y * ppm,
        speed: started ? speedBetween(a, b) : 0,
      });
    });

    if (n % CHECKPOINT_INTERVAL === 0 && !checkpoints.has(n)) {
      checkpoints.set(n, world.takeSnapshot());
      if (checkpoints.size > MAX_CHECKPOINTS) {
        const keys = [...checkpoints.keys()].sort((x, y) => x - y);
        checkpoints.delete(keys[1]);
      }
    }
  }

  function restore(k) {
    const snap = checkpoints.get(k);
    if (!snap) return;
    grab = null;
    world.free();
    world = R.World.restoreSnapshot(snap);
    n = k;
  }

  function posesMap() {
    const map = new Map();
    for (const id of moving) {
      const body = world.getRigidBody(handleOf.get(id));
      if (!body) continue;
      const p = body.translation();
      map.set(id, { x: p.x * ppm, y: p.y * ppm, a: body.rotation() });
    }
    return map;
  }

  function posesArray() {
    const out = new Float32Array(moving.length * 3);
    moving.forEach((id, i) => {
      const body = world.getRigidBody(handleOf.get(id));
      if (!body) return;
      const p = body.translation();
      out[i * 3] = p.x * ppm;
      out[i * 3 + 1] = p.y * ppm;
      out[i * 3 + 2] = body.rotation();
    });
    return out;
  }

  return {
    moving,
    get n() {
      return n;
    },
    get t() {
      return n * DT;
    },

    /** Advance one fixed 60 Hz step and return poses & contact events. */
    step() {
      const events = [];
      stepOnce(events);
      return { n, t: n * DT, poses: posesMap(), posesArray: posesArray(), events };
    },

    /** Bring the world to simulation time t (seconds). */
    to(t) {
      const target = Math.max(0, Math.round(t / DT));
      const events = [];
      if (target < n || target - n > FAR_SEEK_STEPS) {
        let k = 0;
        for (const key of checkpoints.keys()) if (key <= target && key > k) k = key;
        if (target < n || k > n) restore(k);
        while (n < target) stepOnce(null);
      } else {
        while (n < target) stepOnce(events);
      }
      return { n, t: n * DT, poses: posesMap(), posesArray: posesArray(), events };
    },

    reset() {
      restore(0);
      return { n: 0, t: 0, poses: posesMap(), posesArray: posesArray(), events: [] };
    },

    poses() {
      return posesMap();
    },

    /** Drive all actuator-coupled joints from real Arduino simulation part states. */
    updateActuators(partStates = {}) {
      for (const [jid, meta] of jointMeta) {
        if (!meta.actuatorId || meta.kind !== "hinge") continue;
        const pivot = actuatorPivots.get(meta.actuatorId);
        const state = partStates[meta.actuatorId];
        if (!pivot || !state) continue;
        const cmd = actuatorCommand(pivot, state);
        const h = jointHandle.get(jid);
        const joint = h != null ? world.getImpulseJoint(h) : null;
        if (!joint || !cmd) continue;
        // Wake connected dynamic body so changes take effect immediately.
        if (meta.bId) world.getRigidBody(handleOf.get(meta.bId))?.wakeUp();
        if (meta.aId) world.getRigidBody(handleOf.get(meta.aId))?.wakeUp();
        if (meta.isHornTip && cmd.hornTip) {
          const pin = world.getRigidBody(kinematicPinHandle.get(jid));
          pin?.setNextKinematicTranslation({ x: m(cmd.hornTip[0]), y: m(cmd.hornTip[1]) });
          continue;
        }
        if (cmd.mode === "position") {
          const target = cmd.targetRad + ((meta.offsetDeg || 0) * Math.PI) / 180;
          joint.configureMotorPosition(target, cmd.stiffness, cmd.damping);
          joint.setMotorMaxForce?.(cmd.maxTorque);
        } else if (cmd.mode === "velocity") {
          joint.configureMotorVelocity(cmd.radPerSec, cmd.damping);
          if (cmd.maxTorque != null) joint.setMotorMaxForce?.(cmd.maxTorque);
        } else {
          // Unpowered / idle actuator: gentle friction, no drive torque.
          joint.configureMotorVelocity(0, 1.5);
          joint.setMotorMaxForce?.(4);
        }
      }
    },

    /** Set a hinge motor velocity manually (degrees/sec). */
    motor(id, speedDeg, torque = 180) {
      const h = jointHandle.get(id);
      const j = h != null ? world.getImpulseJoint(h) : null;
      if (!j) return false;
      j.configureMotorVelocity((speedDeg * Math.PI) / 180, Math.max(0.5, torque / 10));
      j.setMotorMaxForce?.(torque);
      return true;
    },

    /** Apply a velocity impulse (pixels/sec) to a dynamic body. */
    impulse(id, [vx, vy]) {
      const b = handleOf.has(id) ? world.getRigidBody(handleOf.get(id)) : null;
      if (!b) return false;
      const v = b.linvel();
      b.setLinvel({ x: v.x + m(vx), y: v.y + m(vy) }, true);
      return true;
    },

    /** Start grabbing a dynamic body at world point (wx, wy) with a spring. */
    grabStart(bodyId, wx, wy) {
      this.grabEnd();
      const bh = handleOf.get(bodyId);
      const body = bh != null ? world.getRigidBody(bh) : null;
      if (!body || !body.isDynamic()) return false;
      const anchorBody = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(m(wx), m(wy)),
      );
      const p = body.translation();
      const [lx, ly] = worldToBodyLocal(
        { x: p.x * ppm, y: p.y * ppm, a: body.rotation() },
        wx,
        wy,
      );
      const j = world.createImpulseJoint(
        R.JointData.spring(0, 120, 12, { x: 0, y: 0 }, { x: m(lx), y: m(ly) }),
        anchorBody,
        body,
        true,
      );
      body.wakeUp();
      grab = { anchorHandle: anchorBody.handle, jointHandle: j.handle, bodyId };
      return true;
    },

    grabMove(wx, wy) {
      if (!grab) return;
      const anchorBody = world.getRigidBody(grab.anchorHandle);
      anchorBody?.setNextKinematicTranslation({ x: m(wx), y: m(wy) });
      const body = world.getRigidBody(handleOf.get(grab.bodyId));
      body?.wakeUp();
    },

    grabEnd() {
      if (!grab) return;
      const j = world.getImpulseJoint(grab.jointHandle);
      if (j) world.removeImpulseJoint(j, true);
      const a = world.getRigidBody(grab.anchorHandle);
      if (a) world.removeRigidBody(a);
      grab = null;
    },

    free() {
      this.grabEnd();
      world.free();
      queue.free?.();
      checkpoints.clear();
    },
  };
}

function colliderOf(R, s, m) {
  if (s.kind === "ball") {
    return R.ColliderDesc.ball(Math.max(m(1), m(s.r))).setTranslation(
      m(s.at[0]),
      m(s.at[1]),
    );
  }
  if (s.kind === "cuboid") {
    return R.ColliderDesc.cuboid(Math.max(m(1), m(s.hx)), Math.max(m(1), m(s.hy))).setTranslation(
      m(s.at[0]),
      m(s.at[1]),
    );
  }
  if (s.kind === "capsule") {
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    const len = Math.hypot(dx, dy);
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    if (len < 0.5) return R.ColliderDesc.ball(m(s.r)).setTranslation(m(mx), m(my));
    return R.ColliderDesc.capsule(m(len / 2), m(s.r))
      .setTranslation(m(mx), m(my))
      .setRotation(Math.atan2(dy, dx) - Math.PI / 2);
  }
  if (s.kind === "hull") {
    const pts = new Float32Array(s.pts.flatMap(([x, y]) => [m(x), m(y)]));
    return R.ColliderDesc.convexHull(pts) || R.ColliderDesc.ball(m(4));
  }
  return null;
}
