import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCircuit } from "../sim/circuit.js";
import { UnoRuntime } from "../sim/runtime.js";
const project = (slug) =>
  JSON.parse(
    readFileSync(new URL(`../public/examples/${slug}.json`, import.meta.url)),
  );
const runtime = (slug, edit = () => {}) => {
  const p = project(slug);
  edit(p);
  return new UnoRuntime(p.artifact.hex, resolveCircuit(p.diagram), p.controls);
};
test("real Servo.h firmware sweeps and follows potentiometer position", () => {
  const sweep = runtime("servo-sweep");
  sweep.advance(16e6 * 0.2);
  const angle = sweep.snapshot().parts.servo.angle;
  sweep.advance(16e6 * 0.2);
  assert.ok(sweep.snapshot().parts.servo.angle > angle + 10);
  const knob = runtime("servo-knob");
  knob.setControls({ pot: 0 });
  knob.advance(2e6);
  assert.ok(knob.snapshot().parts.servo.angle < 2);
  knob.setControls({ pot: 1023 });
  knob.advance(2e6);
  assert.ok(knob.snapshot().parts.servo.angle > 178);
});
test("real Stepper.h and AccelStepper firmware move their wired motors", () => {
  for (const slug of ["stepper-library", "stepper-acceleration"]) {
    const r = runtime(slug);
    r.advance(8e6);
    const first = r.snapshot().parts.motor.angle;
    assert.ok(Math.abs(first) > 5, `${slug}: ${first}`);
    r.advance(24e6);
    assert.notEqual(r.snapshot().parts.motor.angle, first);
  }
});
test("DC PWM speed increases, stops and reverses; gear ratio scales output shaft", () => {
  const r = runtime("gear-motor-ratio");
  r.advance(8e6);
  let s = r.snapshot().parts;
  const slow = s.motor.rpm;
  assert.ok(slow > 1400 && slow < 1600, String(slow));
  assert.ok(Math.abs(s.motor.rpm / s.geared.rpm - 100) < 0.001);
  r.advance(16e6 * 0.7);
  r.snapshot();
  r.advance(16e6 * 0.1);
  s = r.snapshot().parts;
  assert.ok(Math.abs(s.motor.rpm) < 1, String(s.motor.rpm));
  r.advance(16e6 * 0.4);
  s = r.snapshot().parts;
  assert.ok(s.motor.rpm < 0);
  const fast = runtime("dc-motor-pwm");
  fast.advance(16e6 * 0.65);
  fast.snapshot();
  fast.advance(4e6);
  assert.ok(fast.snapshot().parts.motor.rpm > slow * 2.8);
});
test("missing driver supply, ground, enable or motor wire stops DC shaft", () => {
  for (const endpoint of [
    "driver:VMOT",
    "driver:VCC",
    "driver:GND",
    "driver:ENA",
    "motor:+",
  ]) {
    const r = runtime("dc-motor-pwm", (p) => {
      p.diagram.connections = p.diagram.connections.filter(
        (c) => !c.slice(0, 2).includes(endpoint),
      );
    });
    r.advance(4e6);
    assert.equal(r.snapshot().parts.motor.rpm, 0, endpoint);
  }
});
test("disconnected stepper coil prevents complete library-driven revolutions", () => {
  const r = runtime("stepper-library", (p) => {
    p.diagram.connections = p.diagram.connections.filter(
      (c) => !c.slice(0, 2).includes("driver:VMOT"),
    );
  });
  r.advance(4e6);
  assert.equal(r.snapshot().parts.motor.angle, 0);
});
