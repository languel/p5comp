import test from "node:test";
import assert from "node:assert/strict";
import {
  breadboardPins,
  breadboardContacts,
  boardSpec,
} from "../sim/breadboard.js";
import { partPoint } from "../sim/partGeometry.js";
import { resolveCircuit } from "../sim/circuit.js";
import { passiveStates } from "../sim/passiveStates.js";
const board = { id: "bb", type: "wokwi-breadboard-half", left: 390, top: 245 };
function positions(parts, pins) {
  const map = new Map();
  for (const p of parts) {
    const list = p.id === "bb" ? breadboardPins(p) : pins[p.id] || [];
    const size =
      p.id === "bb"
        ? { w: boardSpec(p).width, h: boardSpec(p).height }
        : { w: 40, h: 40 };
    for (const pin of list)
      map.set(p.id + ":" + pin.name, partPoint(p, pin, size));
  }
  return map;
}
test("a placed LED connects through its breadboard holes without authored wires, moving a leg off disconnects it", () => {
  const d = {
    parts: [
      { id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 },
      board,
      { id: "led", type: "wokwi-led", left: 468.5, top: 281 },
    ],
    connections: [
      ["uno:13", "bb:10t.a"],
      ["uno:GND.1", "bb:9t.a"],
    ],
  };
  const pins = {
    led: [
      { name: "A", x: 25, y: 42 },
      { name: "C", x: 15, y: 42 },
    ],
  };
  const contacts = breadboardContacts(d.parts, positions(d.parts, pins));
  assert.deepEqual(contacts, [
    ["led:A", "bb:10t.e"],
    ["led:C", "bb:9t.e"],
  ]);
  const volts = Array(20).fill(null);
  volts[13] = 5;
  assert.equal(
    passiveStates(resolveCircuit(d, contacts).passive, volts).led.lit,
    true,
  );
  d.parts[2] = { ...d.parts[2], top: 286 };
  const lifted = breadboardContacts(d.parts, positions(d.parts, pins));
  assert.equal(lifted.length, 0);
  assert.equal(
    passiveStates(resolveCircuit(d, lifted).passive, volts).led.lit,
    false,
  );
  assert.equal(d.connections.length, 2);
});
test("seating uses transformed positions for any terminal, including flipped/rotated parts and boards", () => {
  for (const rotate of [0, 45, 90, 180]) {
    const b = { ...board, rotate };
    const hole = breadboardPins(b)[0];
    const q = partPoint(b, hole, {
      w: boardSpec(b).width,
      h: boardSpec(b).height,
    });
    const generic = { id: "sensor", type: "wokwi-dht22" };
    const map = new Map([
      ["bb:" + hole.name, q],
      ["sensor:VCC", { x: q.x + 0.4, y: q.y - 0.4 }],
      ["sensor:GND", { x: q.x + 4, y: q.y + 4 }],
    ]);
    assert.deepEqual(breadboardContacts([b, generic], map), [
      ["sensor:VCC", "bb:" + hole.name],
    ]);
  }
});
test("mini, medium and long have separate five-hole strips; mini has no power rails", () => {
  for (const [type, attrs, columns] of [
    ["wokwi-breadboard-mini", {}, 17],
    ["wokwi-breadboard-half", {}, 30],
    ["wokwi-breadboard", { size: "full" }, 63],
  ]) {
    const b = { ...board, type, attrs };
    assert.equal(boardSpec(b).columns, columns);
    const d = {
      parts: [
        { id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 },
        b,
        { id: "led", type: "wokwi-led", left: 0, top: 0 },
      ],
      connections: [
        ["uno:5V", `bb:${columns}t.a`],
        ["led:A", `bb:${columns}t.e`],
        ["led:C", "uno:GND.1"],
      ],
    };
    assert.equal(passiveStates(resolveCircuit(d).passive).led.lit, true);
    d.connections[1][1] = `bb:${columns}b.f`;
    assert.equal(passiveStates(resolveCircuit(d).passive).led.lit, false);
    if (type.endsWith("mini"))
      assert.ok(!breadboardPins(b).some((p) => /^[bt][pn]\./.test(p.name)));
  }
});

test("inferred contacts participate in the same supply-short checks as authored wires", () => {
  const d = {
    parts: [{ id: "uno", type: "wokwi-arduino-uno", left: 0, top: 0 }, board],
    connections: [],
  };
  assert.throws(
    () =>
      resolveCircuit(d, [
        ["uno:5V", "bb:1t.a"],
        ["uno:GND.1", "bb:1t.e"],
      ]),
    /shorted/,
  );
});
