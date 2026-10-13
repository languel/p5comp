import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { embedComms } from "../sim/commsCode.js";
import { webserialSketch, nativeSketch } from "../sim/examples.js";
test("communications adapters preserve custom drawing code and replace only their managed block", () => {
  const source =
    "function setup(){createCanvas(100,100);}\nfunction draw(){circle(10,10,5);}";
  const native = embedComms(source, "native");
  assert.ok(native.startsWith(source));
  assert.match(native, /navigator.serial/);
  new Function(native);
  const web = embedComms(native, "webserial");
  assert.equal(web.split("// p5comp communications: begin").length, 2);
  assert.match(web, /createSerial\(\)/);
  assert.doesNotMatch(web, /navigator.serial/);
  new Function(web);
  const none = embedComms(web, "none");
  assert.ok(none.startsWith(source));
  assert.doesNotMatch(none, /createSerial|navigator.serial/);
  new Function(none);
});
test("stock classroom sketches switch transport without replacing the visualization", () => {
  for (const source of [webserialSketch, nativeSketch]) {
    const updated = embedComms(source, "native");
    assert.match(updated, /history.forEach/);
    assert.match(updated, /arduinoComms.poll/);
    assert.doesNotMatch(updated, /let port/);
    new Function(updated);
  }
});
test("Firmata adapter embeds the actual parser/client and uses its firmware baud rate", () => {
  const sources = {
    parser: readFileSync(
      new URL("../firmata/FirmataParser.js", import.meta.url),
      "utf8",
    ),
    client: readFileSync(
      new URL("../firmata/FirmataClient.js", import.meta.url),
      "utf8",
    ),
  };
  const source = embedComms("function setup(){}", "firmata", sources);
  assert.match(source, /baudRate:57600/);
  assert.match(source, /class FirmataClient/);
  assert.match(source, /class FirmataParser/);
  new Function(source);
});
