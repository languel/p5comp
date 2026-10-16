import test from "node:test";
import assert from "node:assert/strict";
import {
  connectorRole,
  terminalContacts,
  syncSeating,
  movingParts,
  unplugContacts,
  groupParts,
  ungroupParts,
} from "../sim/terminalContacts.js";
import { resolveCircuit } from "../sim/circuit.js";
const uno = { id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 },
  led = { id: "led", type: "wokwi-led", left: 0, top: 0 };
const pins = () =>
  new Map([
    ["uno:13", { x: 10, y: 0 }],
    ["uno:GND.1", { x: 0, y: 0 }],
    ["led:A", { x: 10, y: 0 }],
    ["led:C", { x: 0, y: 0 }],
  ]);
const diagram = () => ({ parts: [uno, led], connections: [] });
test("a seated LED mates with Uno sockets, is connected electrically and follows its host", () => {
  const d = diagram(),
    p = pins();
  assert.equal(syncSeating(d, p), true);
  assert.equal(d.attachments.length, 2);
  const topology = resolveCircuit(d);
  assert.equal(topology.passive.leds.length, 1);
  assert.deepEqual([...movingParts(d, ["uno"])], ["uno", "led"]);
  assert.deepEqual([...movingParts(d, ["led"])], ["led"]);
  assert.equal(syncSeating(d, p), false);
});
test("pulling a child out disconnects while an ordinary authored wire survives", () => {
  const d = diagram(),
    p = pins();
  d.connections = [["led:A", "uno:13"]];
  syncSeating(d, p);
  p.set("led:A", { x: 10, y: -20 });
  p.set("led:C", { x: 0, y: -20 });
  syncSeating(d, p);
  assert.equal(d.attachments.length, 0);
  assert.equal(d.connections.length, 1);
  assert.deepEqual([...movingParts(d, ["uno"])], ["uno"]);
});
test("unplugged coincident contacts stay open until physically separated, then can be reinserted", () => {
  const d = diagram(),
    p = pins();
  syncSeating(d, p);
  unplugContacts(d, [d.attachments[0]]);
  syncSeating(d, p);
  assert.equal(d.attachments.length, 1);
  assert.equal(d.detachedContacts.length, 1);
  p.set("led:A", { x: 10, y: -20 });
  p.set("led:C", { x: 0, y: -20 });
  syncSeating(d, p);
  assert.equal(d.detachedContacts.length, 0);
  syncSeating(d, pins());
  assert.equal(d.attachments.length, 2);
});
test("male headers never auto-connect to other male headers and adjacency does not short neighboring sockets", () => {
  const nano = { ...uno, type: "wokwi-arduino-nano" };
  assert.equal(terminalContacts([nano, led], pins()).length, 0);
  const p = pins();
  p.set("led:A", { x: 14, y: 0 });
  assert.deepEqual(terminalContacts([uno, led], p), [["led:C", "uno:GND.1"]]);
  assert.equal(
    connectorRole({ ...nano, attrs: { connectors: { 13: "socket" } } }, "13"),
    "socket",
  );
});
test("manual groups merge transitively, expand mounted children and ungroup independently of seating", () => {
  const d = {
    parts: [uno, led, { id: "r", type: "wokwi-resistor" }],
    connections: [],
  };
  syncSeating(d, pins());
  groupParts(d, ["uno", "r"]);
  assert.deepEqual([...movingParts(d, ["r"])].sort(), ["led", "r", "uno"]);
  ungroupParts(d, ["uno", "r"]);
  assert.deepEqual([...movingParts(d, ["r"])], ["r"]);
  assert.deepEqual([...movingParts(d, ["uno"])], ["uno", "led"]);
});

test("insertion magnet aligns mating contacts even off the workbench grid", async () => {
  const { snapInsertion } = await import("../sim/terminalContacts.js");
  const d = diagram(),
    p = pins();
  p.set("led:A", { x: 10, y: -30 });
  p.set("led:C", { x: 0, y: -30 });
  const result = snapInsertion(d, p, new Set(["led"]), 2, 28);
  assert.equal(result.dx, 0);
  assert.equal(result.dy, 30);
  assert.equal(result.score, 2);
  assert.equal(
    snapInsertion(
      { ...d, parts: [{ ...uno, type: "wokwi-arduino-nano" }, led] },
      p,
      new Set(["led"]),
      2,
      28,
    ),
    null,
  );
});
