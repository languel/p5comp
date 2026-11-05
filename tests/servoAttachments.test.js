import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  attachmentPose,
  attachmentBounds,
  validateServoAttachment,
  addPenPoint,
  SERVO_PIVOT,
  SERVO_SIZE,
} from "../sim/servoAttachments.js";
import { resolveCircuit, validateDiagram } from "../sim/circuit.js";
import { UnoRuntime } from "../sim/runtime.js";
const garden = () =>
  JSON.parse(
    readFileSync(
      new URL("../public/examples/servo-garden.json", import.meta.url),
    ),
  );
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} ≠ ${b}`);
test("attachment tips share the native servo shaft and follow rotation, flip and component movement", () => {
  const p = {
    type: "wokwi-servo",
    left: 20,
    top: 30,
    attrs: { servoAttachment: { kind: "pen", length: 100 } },
  };
  let g = attachmentPose(p, 90);
  near(g.pivot.x, 20 + SERVO_PIVOT.x);
  near(g.tip.x, g.pivot.x + 100);
  near(g.tip.y, g.pivot.y);
  g = attachmentPose(p, 0);
  near(g.tip.x, g.pivot.x);
  near(g.tip.y, g.pivot.y - 100);
  p.flipX = true;
  g = attachmentPose(p, 90);
  near(g.tip.x, g.pivot.x - 100);
  p.rotate = 90;
  g = attachmentPose(p, 90);
  near(g.tip.y, g.pivot.y - 100);
  const before = g;
  p.left += 50;
  p.top -= 60;
  g = attachmentPose(p, 90);
  near(g.tip.x, before.tip.x + 50);
  near(g.tip.y, before.tip.y - 60);
  // Native SVG viewBox and CSS body size can differ slightly.
  p.rotate = 0;
  p.flipX = false;
  g = attachmentPose(p, 90, { w: SERVO_SIZE.w * 2, h: SERVO_SIZE.h * 2 });
  near(g.pivot.x, p.left + SERVO_PIVOT.x * 2);
  near(g.tip.x, g.pivot.x + 100);
});
test("bounds include artwork for every servo angle and pivot, including flipped bodies", () => {
  const p = {
    type: "wokwi-servo",
    left: 20,
    top: 30,
    rotate: 45,
    flipY: true,
    attrs: {
      servoAttachment: {
        kind: "drawing",
        asset: "arm.svg",
        length: 200,
        aspect: 0.5,
        pivotX: 0.3,
        pivotY: 0.7,
      },
    },
  };
  const b = attachmentBounds(p);
  for (let angle = 0; angle <= 180; angle += 5) {
    const tip = attachmentPose(p, angle).tip;
    assert.ok(
      tip.x > b.x && tip.x < b.x + b.w && tip.y > b.y && tip.y < b.y + b.h,
    );
  }
  assert.equal(attachmentBounds({ ...p, type: "wokwi-resistor" }), null);
});
test("pen trails skip duplicate samples and have bounded memory", () => {
  const points = [];
  assert.equal(addPenPoint(points, { x: 0, y: 0 }, 20), true);
  assert.equal(addPenPoint(points, { x: 0.1, y: 0.1 }, 20), false);
  for (let i = 1; i < 500; i++) addPenPoint(points, { x: i, y: i }, 20);
  assert.equal(points.length, 20);
  assert.deepEqual(points.at(-1), { x: 499, y: 499 });
});
test("invalid attachment configuration is rejected by circuit validation", () => {
  for (const a of [
    { kind: "bad" },
    { kind: "pen", length: 0 },
    { kind: "arm", offset: Infinity },
    { kind: "drawing", asset: "" },
    { kind: "drawing", asset: "x.svg", pivotX: 2 },
    { kind: "arc", color: "bad" },
  ]) {
    assert.throws(() => validateServoAttachment(a));
    assert.throws(() =>
      validateDiagram({
        parts: [
          {
            id: "servo",
            type: "wokwi-servo",
            left: 0,
            top: 0,
            attrs: { servoAttachment: a },
          },
        ],
        connections: [],
      }),
    );
  }
});
test("twelve-channel compiled firmware drives every servo with distinct phase and responds to pattern selection", () => {
  const p = garden(),
    r = new UnoRuntime(p.artifact.hex, resolveCircuit(p.diagram), p.controls);
  r.advance(8e6);
  const first = r.snapshot().parts;
  const states = Array.from({ length: 12 }, (_, i) => first[`servo${i + 1}`]);
  assert.equal(states.length, 12);
  for (const s of states) {
    assert.equal(s.powered, true);
    assert.ok(s.pulse > 700 && s.pulse < 2250);
  }
  assert.ok(new Set(states.map((s) => Math.round(s.angle))).size >= 8);
  r.setControls({ speed: 420, mode: 1 });
  r.advance(4e6);
  const alternate = r.snapshot().parts;
  near(Math.round(alternate.servo1.angle), Math.round(alternate.servo3.angle));
  assert.ok(Math.abs(alternate.servo1.angle - alternate.servo2.angle) > 15);
  const before = alternate.servo12.angle;
  r.advance(4e6);
  assert.ok(Math.abs(r.snapshot().parts.servo12.angle - before) > 10);
});
test("garden includes editable Poliplan source, exported leaf and consistent standalone firmware", () => {
  const p = garden();
  assert.equal(
    p.diagram.parts.filter((p) => p.type === "wokwi-servo").length,
    12,
  );
  assert.equal(p.artifact.source, p.arduino);
  assert.equal(p.artifact.buildKey, p.arduino + "{}");
  assert.equal(
    readFileSync(
      new URL("../public/examples/servo-garden/sketch.ino", import.meta.url),
      "utf8",
    ),
    p.arduino,
  );
  assert.equal(p.workbench.drawing.elements[0].role, "plane");
  for (const s of p.diagram.parts.filter(
    (p) => p.attrs.servoAttachment?.kind === "drawing",
  ))
    assert.ok(
      p.workbench.assets[s.attrs.servoAttachment.asset].src.startsWith(
        "data:image/svg+xml;",
      ),
    );
});

test('SG90 and MG90S catalog profiles preserve servo pins, attachments and compiled behavior', async () => {
  const {searchElements,elementPins}=await import('../sim/elements.js');
  const {SERVO_MODELS}=await import('../sim/servoCatalog.js');
  for(const name of ['SG90','MG90S']) {
    const entries=searchElements(name);
    assert.equal(entries.length,1);
    assert.equal(entries[0].type,'wokwi-servo');
    assert.equal(entries[0].attrs.servoModel,name);
    assert.deepEqual(elementPins({type:'wokwi-servo',attrs:entries[0].attrs}),['GND','V+','PWM']);
    assert.match(SERVO_MODELS[name].url,/^https:\/\/towerpro.com.tw\/product\//);
  }
  const p=garden();
  const profiles=p.diagram.parts.filter(p=>p.type==='wokwi-servo');
  assert.equal(profiles.filter(p=>p.attrs.servoModel==='SG90').length,6);
  assert.equal(profiles.filter(p=>p.attrs.servoModel==='MG90S').length,6);
  const note=p.workbench.references.find(r=>r.id==='servo-hardware-specs');
  for(const model of Object.values(SERVO_MODELS))assert.ok(note.source.includes(model.url));
  const r=new UnoRuntime(p.artifact.hex,resolveCircuit(p.diagram),p.controls);r.advance(2e6);
  for(const part of profiles){assert.ok(r.snapshot().parts[part.id].pulse>400);assert.ok(part.attrs.servoAttachment);}
});
