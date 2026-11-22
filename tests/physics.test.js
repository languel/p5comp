import test from "node:test";
import assert from "node:assert/strict";
import { loadRapier, createPhysicsCore } from "../sim/physics/core.js";
import { PeripheralModels } from "../sim/peripherals.js";
import {
  attachPoliplanBodies,
  attachPoliplanCurveConstraint,
  detachPoliplanMarks,
  syncLinkedPoliplanMarks,
} from "../sim/physics/poliplanBridge.js";
import {
  createEmptyPhysicsScene,
  normalizePhysicsScene,
  validatePhysicsScene,
  poliplanDocToPhysicsBodies,
  bodyHitTest,
  selectInBox,
  selectInLasso,
  snapPhysicsPoint,
} from "../sim/physics/model.js";
import { actuatorPivot, listActuators, servoHornTip } from "../sim/physics/actuators.js";
import {
  buildCrankSlider,
  buildFourBar,
  buildScotchYoke,
  buildGearPair,
  buildRackPinion,
  buildCamFollower,
  buildRatchetPawl,
  buildBallLauncher,
} from "../sim/physics/mechanisms.js";

test("deterministic falling ball with floor and reset reproduces identical poses", async () => {
  const R = await loadRapier();
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 9.8], ppm: 50, floor: true, floorY: 300, iterations: 8 },
    bodies: [
      { id: "ball1", type: "dynamic", shape: "circle", x: 100, y: 80, r: 16, bounce: 0.7 },
    ],
    joints: [],
  });
  const core = createPhysicsCore(R, scene);
  const f1 = core.to(1.2);
  const p1 = f1.poses.get("ball1");
  assert.ok(p1.y > 120 && p1.y <= 305, `expected ball to fall and bounce near floor, got y=${p1.y}`);

  core.reset();
  const f2 = core.to(1.2);
  const p2 = f2.poses.get("ball1");
  assert.equal(p1.x, p2.x);
  assert.equal(p1.y, p2.y);
  assert.equal(p1.a, p2.a);
  core.free();
});

test("servo actuator coupling rotates a hinged arm to the commanded angle", async () => {
  const R = await loadRapier();
  const servoPart = { id: "servo1", type: "wokwi-servo", left: 100, top: 100, attrs: { model: "mg90s" } };
  const pivot = actuatorPivot(servoPart);
  const pivots = new Map([[pivot.id, pivot]]);

  const scene = normalizePhysicsScene({
    world: { gravity: [0, 0], ppm: 50, iterations: 8 },
    bodies: [
      {
        id: "arm1",
        type: "dynamic",
        shape: "link",
        x: pivot.x + 40,
        y: pivot.y,
        angle: 0,
        length: 80,
        width: 12,
      },
    ],
    joints: [
      {
        id: "j1",
        kind: "hinge",
        a: null,
        b: "arm1",
        anchor: [pivot.x, pivot.y],
        actuatorId: "servo1",
      },
    ],
  });

  const core = createPhysicsCore(R, scene, pivots);
  // Command servo to 150 degrees (+60 deg from 90 deg neutral).
  core.updateActuators({ servo1: { powered: true, pulse: 2100, angle: 150 } });
  for (let i = 0; i < 90; i++) core.step();

  const pose = core.poses().get("arm1");
  const deg = (pose.a * 180) / Math.PI;
  assert.ok(
    Math.abs(deg - 60) < 2,
    `expected servo arm to settle within 2 deg of +60 deg, got ${deg.toFixed(2)} deg`,
  );

  // Live sweep tracking check (150° -> 180° -> 90°): crank tracks wokwi-servo horn within < 2.5°.
  let maxErr = 0;
  for (let a = 150; a >= 90; a -= 2) {
    core.updateActuators({ servo1: { powered: true, pulse: 1500, angle: a } });
    core.step();
    core.step();
    const curDeg = (core.poses().get("arm1").a * 180) / Math.PI;
    maxErr = Math.max(maxErr, Math.abs(curDeg - (a - 90)));
  }
  assert.ok(maxErr < 2.5, `expected tight live servo tracking (< 2.5°), got ${maxErr.toFixed(2)}°`);
  core.free();
});

test("DC gear motor actuator spins a coupled wheel continuously", async () => {
  const R = await loadRapier();
  const motorPart = { id: "m1", type: "p5comp-gear-motor", left: 80, top: 80, attrs: { noLoadRPM: 6000, gearRatio: 100 } };
  const pivot = actuatorPivot(motorPart);
  const pivots = new Map([[pivot.id, pivot]]);

  const scene = normalizePhysicsScene({
    world: { gravity: [0, 0], ppm: 50, iterations: 8 },
    bodies: [
      { id: "wheel1", type: "dynamic", shape: "circle", x: pivot.x, y: pivot.y, r: 30 },
    ],
    joints: [
      { id: "j1", kind: "hinge", a: null, b: "wheel1", anchor: [pivot.x, pivot.y], actuatorId: "m1" },
    ],
  });

  const core = createPhysicsCore(R, scene, pivots);
  core.updateActuators({ m1: { rpm: 60 } }); // 1 rev/sec = 2*pi rad/sec
  for (let i = 0; i < 30; i++) core.step(); // 0.5 sec -> ~pi rad
  const pose = core.poses().get("wheel1");
  assert.ok(Math.abs(pose.a) > 1.5, `expected wheel to spin noticeably, got angle=${pose.a}`);
  core.free();
});

test("crank-slider mechanism converts rotary crank into linear slider motion", async () => {
  const R = await loadRapier();
  const mech = buildCrankSlider({ origin: [200, 200] });
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 0], ppm: 50, iterations: 12 },
    ...mech,
  });
  const core = createPhysicsCore(R, scene);
  const startSlider = core.poses().get(mech.bodies[2].id);
  let minX = startSlider.x;
  let maxX = startSlider.x;
  let maxDriftY = 0;

  for (let i = 0; i < 180; i++) {
    const f = core.step();
    const s = f.poses.get(mech.bodies[2].id);
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    maxDriftY = Math.max(maxDriftY, Math.abs(s.y - startSlider.y));
  }
  assert.ok(maxX - minX > 45, `expected slider stroke > 45 px, got ${(maxX - minX).toFixed(1)}`);
  assert.ok(maxDriftY < 3, `expected slider to stay on horizontal rail, driftY=${maxDriftY.toFixed(2)}`);
  core.free();
});

test("four-bar linkage articulates smoothly without diverging", async () => {
  const R = await loadRapier();
  const mech = buildFourBar({ origin: [200, 260] });
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 0], ppm: 50, iterations: 12 },
    ...mech,
  });
  const core = createPhysicsCore(R, scene);
  const startCoupler = core.poses().get(mech.bodies[1].id);
  let moved = 0;

  for (let i = 0; i < 120; i++) {
    const f = core.step();
    const c = f.poses.get(mech.bodies[1].id);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    moved = Math.max(moved, Math.hypot(c.x - startCoupler.x, c.y - startCoupler.y));
  }
  assert.ok(moved > 20, `expected four-bar coupler to articulate, moved=${moved.toFixed(1)}`);
  core.free();
});

test("meshing spur gear pair transfers rotation in the opposite direction", async () => {
  const R = await loadRapier();
  const mech = buildGearPair({ origin: [200, 200], teethA: 12, teethB: 18, module: 6 });
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 0], ppm: 50, iterations: 12 },
    ...mech,
  });
  const core = createPhysicsCore(R, scene);
  const initB = core.poses().get(mech.bodies[1].id).a;
  for (let i = 0; i < 120; i++) core.step();
  const finalA = core.poses().get(mech.bodies[0].id).a;
  const finalB = core.poses().get(mech.bodies[1].id).a;
  const deltaB = finalB - initB;
  assert.ok(finalA > 0.5, `driver gear should rotate positive, got ${finalA}`);
  assert.ok(deltaB < -0.2, `driven gear should counter-rotate via meshing teeth, got deltaB=${deltaB}`);
  core.free();
});

test("servo horn-tip kinematic pin tracks the white horn hole with zero phase lag", async () => {
  const R = await loadRapier();
  const servoPart = { id: "servo", type: "wokwi-servo", left: 420, top: 100, attrs: {} };
  const pivot = actuatorPivot(servoPart);
  const mech = buildCrankSlider({
    origin: [pivot.x, pivot.y],
    actuatorId: "servo",
    actuatorType: "wokwi-servo",
    hornTip: [pivot.hornTip.x, pivot.hornTip.y],
  });
  // No redundant crank body when attached directly to servo horn tip: only rod + slider.
  assert.equal(mech.bodies.length, 2);
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 0], ppm: 50, iterations: 12 },
    ...mech,
  });
  const core = createPhysicsCore(R, scene, new Map([[pivot.id, pivot]]));
  const sliderId = mech.bodies[1].id;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let deg = 0; deg <= 180; deg += 3) {
    core.updateActuators({ servo: { powered: true, pulse: 1500, angle: deg } });
    core.step();
    const s = core.poses().get(sliderId);
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
  }
  assert.ok(maxX - minX > 35, `expected horn-tip crank-slider stroke > 35 px, got ${(maxX - minX).toFixed(1)}`);
  const tip90 = servoHornTip(pivot, 90);
  assert.ok(tip90.x > pivot.x + 40 && Math.abs(tip90.y - pivot.y) < 1, "at 90 deg horn tip points straight right");
  core.free();
});

test("scotch-yoke, rack-pinion, cam-follower, ratchet-pawl, and ball-launcher simulate cleanly", async () => {
  const R = await loadRapier();
  for (const builder of [buildScotchYoke, buildRackPinion, buildCamFollower, buildRatchetPawl, buildBallLauncher]) {
    const mech = builder({ origin: [220, 220] });
    const scene = normalizePhysicsScene({
      world: { gravity: [0, 9.8], ppm: 50, iterations: 10 },
      ...mech,
    });
    const core = createPhysicsCore(R, scene);
    for (let i = 0; i < 60; i++) {
      const f = core.step();
      for (const pose of f.poses.values()) {
        assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.a));
      }
    }
    core.free();
  }
});

test("Poliplan marks convert to circles, convex polygons, and static chain ramps", () => {
  const circlePts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [100 + Math.cos(a) * 24, 100 + Math.sin(a) * 24];
  });
  const doc = {
    elements: [
      { id: "e1", role: "plane", closed: true, points: circlePts },
      { id: "e2", role: "plane", closed: true, points: [[0, 0], [60, 0], [60, 30], [0, 30]] },
      { id: "e3", role: "line", closed: false, points: [[10, 200], [180, 240]] },
      { id: "e4", role: "note", points: [[50, 50]] },
    ],
  };
  const bodies = poliplanDocToPhysicsBodies(doc);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0].shape, "circle");
  assert.equal(bodies[0].type, "dynamic");
  assert.equal(bodies[1].shape, "polygon");
  assert.equal(bodies[1].type, "dynamic");
  assert.equal(bodies[2].shape, "chain");
  assert.equal(bodies[2].type, "static");
  assert.equal(bodyHitTest(bodies[0], 100, 100), true);
  assert.equal(bodyHitTest(bodies[0], 200, 200), false);
});

test("box and lasso selection find enclosed physics bodies and joints", () => {
  const scene = {
    bodies: [
      { id: "b1", shape: "circle", x: 50, y: 50, r: 12 },
      { id: "b2", shape: "box", x: 150, y: 50, w: 20, h: 20 },
      { id: "b3", shape: "box", x: 300, y: 300, w: 20, h: 20 },
    ],
    joints: [
      { id: "j1", kind: "hinge", a: null, b: "b1", anchor: [50, 50] },
      { id: "j2", kind: "hinge", a: null, b: "b3", anchor: [300, 300] },
    ],
  };
  const boxHit = selectInBox(scene, { x0: 20, y0: 20, x1: 180, y1: 100 });
  assert.deepEqual(boxHit.bodyIds, ["b1", "b2"]);
  assert.deepEqual(boxHit.jointIds, ["j1"]);

  const lassoHit = selectInLasso(scene, [[0, 0], [100, 0], [100, 100], [0, 100]]);
  assert.deepEqual(lassoHit.bodyIds, ["b1"]);
  assert.deepEqual(lassoHit.jointIds, ["j1"]);
});

test("snapPhysicsPoint snaps to gear centers, link end bores, and servo horn tips", () => {
  const servo = actuatorPivot({ id: "s1", type: "wokwi-servo", left: 100, top: 100 });
  const scene = {
    bodies: [
      { id: "g1", shape: "gear", x: 300, y: 200, teeth: 12, module: 6 },
      { id: "l1", shape: "link", x: 450, y: 200, angle: 0, length: 100, width: 12 },
    ],
    joints: [],
  };
  const gearSnap = snapPhysicsPoint({ x: 304, y: 196 }, scene, [servo]);
  assert.equal(gearSnap.kind, "center");
  assert.equal(gearSnap.x, 300);
  assert.equal(gearSnap.y, 200);

  const boreSnap = snapPhysicsPoint({ x: 403, y: 202 }, scene, [servo]);
  assert.equal(boreSnap.kind, "bore");
  assert.equal(boreSnap.x, 400);
  assert.equal(boreSnap.y, 200);

  const tipSnap = snapPhysicsPoint({ x: servo.hornTip.x + 3, y: servo.hornTip.y - 2 }, scene, [servo]);
  assert.equal(tipSnap.kind, "horn-tip");
  assert.equal(tipSnap.actuator.id, "s1");
});

test("FS90R continuous-rotation servo spins forward at 2000us, stops at 1500us, and reverses at 1000us", () => {
  const pm = new PeripheralModels([
    { id: "s1", type: "wokwi-servo", powered: true, pins: { PWM: 9 }, attrs: { servoModel: "FS90R", continuous: true, maxRPM: 100 } },
  ]);
  const sendPulse = (startCycle, widthUs) => {
    pm.tick(startCycle, () => true);
    pm.tick(startCycle + widthUs * 16, () => false);
  };
  // 2000 us -> full forward (~+100 RPM = +600 deg/s). Over 0.2s (3.2e6 cycles) -> ~120 deg.
  for (let i = 0; i < 10; i++) sendPulse(i * 320000, 2000);
  const fwd = pm.snapshot(10 * 320000).s1;
  assert.equal(fwd.continuous, true);
  assert.ok(fwd.rpm > 90, `expected forward rpm > 90, got ${fwd.rpm}`);
  assert.ok(fwd.angle > 80, `expected angle to advance, got ${fwd.angle}`);

  // 1500 us -> deadband stop (0 RPM)
  const tStop = 10 * 320000;
  sendPulse(tStop, 1500);
  const stopped = pm.snapshot(tStop + 320000).s1;
  assert.equal(stopped.rpm, 0);

  // 1000 us -> full reverse (~-100 RPM)
  sendPulse(tStop + 320000, 1000);
  const rev = pm.snapshot(tStop + 640000).s1;
  assert.ok(rev.rpm < -90, `expected reverse rpm < -90, got ${rev.rpm}`);
});

test("collision layer bitmask toggles allow multi-layer collision matrix (A, B, A+B, none)", async () => {
  const R = await loadRapier();
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 9.8], ppm: 50, iterations: 8 },
    bodies: [
      { id: "floorA", type: "static", shape: "box", x: 100, y: 200, w: 300, h: 16, collisionMask: 0b0001 },
      { id: "ballA", type: "dynamic", shape: "circle", x: 60, y: 120, r: 14, collisionMask: 0b0001 },
      { id: "ballB", type: "dynamic", shape: "circle", x: 120, y: 120, r: 14, collisionMask: 0b0010 },
      { id: "ballAB", type: "dynamic", shape: "circle", x: 180, y: 120, r: 14, collisionMask: 0b0011 },
      { id: "linkPass", type: "dynamic", shape: "link", x: 240, y: 120, length: 40, width: 10, collisionMask: 0 },
    ],
    joints: [],
  });
  const core = createPhysicsCore(R, scene);
  const f = core.to(1.0);
  // ballA (A) and ballAB (A+B) stop on floorA (A), while ballB (B) and linkPass (none) pass through!
  assert.ok(f.poses.get("ballA").y < 195, `Layer A ball should stop on Layer A floor, got y=${f.poses.get("ballA").y}`);
  assert.ok(f.poses.get("ballAB").y < 195, `Layer A+B ball should stop on Layer A floor, got y=${f.poses.get("ballAB").y}`);
  assert.ok(f.poses.get("ballB").y > 260, `Layer B ball should pass through Layer A floor, got y=${f.poses.get("ballB").y}`);
  assert.ok(f.poses.get("linkPass").y > 260, `Pass-through link should pass through Layer A floor, got y=${f.poses.get("linkPass").y}`);
  core.free();
});

test("general curve constraint guides a body smoothly along a curved arc", async () => {
  const R = await loadRapier();
  // Quarter-circle downward arc from (100, 100) to (200, 200)
  const arcPts = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 19) * (Math.PI / 2);
    return [100 + Math.sin(a) * 100, 200 - Math.cos(a) * 100];
  });
  const scene = normalizePhysicsScene({
    world: { gravity: [0, 9.8], ppm: 50, iterations: 8 },
    bodies: [
      { id: "car1", type: "dynamic", shape: "circle", x: arcPts[2][0], y: arcPts[2][1], r: 10 },
    ],
    joints: [
      { id: "c1", kind: "curve", a: null, b: "car1", anchor: arcPts[2], pts: arcPts, friction: 0.02 },
    ],
  });
  const core = createPhysicsCore(R, scene);
  const start = core.poses().get("car1");
  const f = core.to(1.2);
  const end = f.poses.get("car1");
  // Under gravity, carriage glides down & right along the quarter-circle arc while staying on radius 100 from (100, 200).
  assert.ok(end.x > start.x + 25 && end.y > start.y + 15, `expected carriage to glide along curve, got (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);
  const radiusErr = Math.abs(Math.hypot(end.x - 100, end.y - 200) - 100);
  assert.ok(radiusErr < 4, `expected carriage to stay on curve (err < 4px), got ${radiusErr.toFixed(2)}px`);
  core.free();
});

test("Poliplan bridge links bodies and curve constraints and live-syncs edits and erasures", () => {
  const scene = createEmptyPhysicsScene();
  const doc = {
    elements: [
      { id: "m1", role: "plane", closed: true, points: [[0, 0], [40, 0], [40, 40], [0, 40]] },
      { id: "m2", role: "line", closed: false, points: [[100, 100], [160, 130], [220, 110]] },
    ],
  };
  const bodyRes = attachPoliplanBodies(scene, doc, ["m1"], { type: "dynamic" });
  assert.equal(bodyRes.bodies.length, 1);
  assert.equal(scene.bodies[0].sourceMarkId, "m1");

  const curveRes = attachPoliplanCurveConstraint(scene, doc, ["m2"]);
  assert.ok(curveRes.joint && curveRes.joint.kind === "curve");
  assert.equal(curveRes.joint.sourceMarkId, "m2");
  assert.ok(curveRes.createdCarriage, "creates a carriage pin when no body is near the curve");

  // Edit curve in Poliplan -> live sync updates curve points
  doc.elements[1].points = [[100, 100], [180, 180], [260, 120]];
  assert.equal(syncLinkedPoliplanMarks(scene, doc), true);
  assert.equal(scene.joints[0].pts[1][1], 180);

  // Erase m1 in Poliplan -> live sync removes its linked body
  doc.elements = doc.elements.filter((e) => e.id !== "m1");
  assert.equal(syncLinkedPoliplanMarks(scene, doc), true);
  assert.equal(scene.bodies.some((b) => b.sourceMarkId === "m1"), false);

  // Detach curve constraint from m2 directly
  const det = detachPoliplanMarks(scene, ["m2"]);
  assert.equal(det.removedJoints, 1);
  assert.equal(scene.joints.length, 0);
});

test("physics scene validation rejects malformed bodies/joints and lists actuators", () => {
  assert.doesNotThrow(() => validatePhysicsScene(createEmptyPhysicsScene()));
  assert.throws(() => validatePhysicsScene({ bodies: [{ id: "b1", shape: "invalid", x: 0, y: 0 }] }));
  assert.throws(() => validatePhysicsScene({ joints: [{ id: "j1", kind: "unknown" }] }));
  const actuators = listActuators([
    { id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 },
    { id: "s1", type: "wokwi-servo", left: 200, top: 100 },
    { id: "m1", type: "p5comp-gear-motor", left: 300, top: 100 },
  ]);
  assert.equal(actuators.length, 2);
  assert.deepEqual(
    actuators.map((a) => a.id),
    ["s1", "m1"],
  );
});
