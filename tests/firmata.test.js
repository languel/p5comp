import test from "node:test";
import assert from "node:assert/strict";
import { FirmataClient } from "../firmata/FirmataClient.js";
import { FirmataParser } from "../firmata/FirmataParser.js";

test("parses version and digital messages across input chunks", () => {
  const parser = new FirmataParser();
  const events = [];
  parser.addEventListener("version", event => events.push(["version", event.detail]));
  parser.addEventListener("digitalPort", event => events.push(["digital", event.detail]));

  parser.feed(Uint8Array.of(0xf9, 2));
  parser.feed(Uint8Array.of(5, 0x92, 0x05, 0));

  assert.deepEqual(events, [
    ["version", { major: 2, minor: 5 }],
    ["digital", { port: 2, value: 5 }]
  ]);
});

test("decodes pin capabilities and analog mappings", () => {
  const parser = new FirmataParser();
  let capabilities;
  let mapping;
  parser.addEventListener("capabilities", event => { capabilities = event.detail; });
  parser.addEventListener("analogMapping", event => { mapping = event.detail; });

  parser.feed(Uint8Array.of(
    0xf0, 0x6c, 0, 1, 1, 1, 3, 8, 0x7f, 2, 1, 0x7f, 0xf7,
    0xf0, 0x6a, 0, 0x7f, 0xf7
  ));

  assert.deepEqual(capabilities, [
    [{ mode: 0, resolution: 1 }, { mode: 1, resolution: 1 }, { mode: 3, resolution: 8 }],
    [{ mode: 2, resolution: 1 }]
  ]);
  assert.deepEqual(mapping, [0, 127]);
});

test("uses extended analog writes for PWM pins above pin 15", async () => {
  const serial = new EventTarget();
  const writes = [];
  serial.write = async bytes => writes.push([...bytes]);
  const client = new FirmataClient(serial);
  client.pins = [{
    id: "D44",
    pin: 44,
    mode: 0,
    value: null,
    capabilities: [{ mode: 3 }]
  }];

  await client.setPinMode("D44", 3);
  await client.write("D44", 128);

  assert.deepEqual(writes, [
    [0xf4, 44, 3],
    [0xf0, 0x6f, 44, 0, 1, 0xf7]
  ]);
  client.destroy();
});

test("preserves other digital port bits while writing outputs", async () => {
  const serial = new EventTarget();
  const writes = [];
  serial.write = async bytes => writes.push([...bytes]);
  const client = new FirmataClient(serial);
  client.pins = [5, 6].map(pin => ({
    id: `D${pin}`,
    pin,
    mode: 1,
    value: 0,
    capabilities: [{ mode: 1 }]
  }));
  client.digitalPorts[0] = 0x80;

  await client.write("D5", 1);
  await client.write("D6", 1);
  await client.write("D5", 0);

  assert.deepEqual(writes, [
    [0x90, 0x20, 1],
    [0x90, 0x60, 1],
    [0x90, 0x40, 1]
  ]);
  client.destroy();
});
