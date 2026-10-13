import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { projectArchive } from "../sim/projectArchive.js";
test("ZIP separates Arduino, p5, assets and circuit and preserves full project manifest", () => {
  const p = {
    arduino: "void setup(){}",
    api: "native",
    p5: { native: "function setup(){}" },
    diagram: { parts: [], connections: [] },
    workbench: {
      files: {
        "Sensor.h": "class Sensor {};",
        "index.html": "<main></main>",
        "style.css": "body{}",
      },
      assets: { "images/a.png": { src: "data:image/png;base64,AQID" } },
    },
  };
  const files = unzipSync(projectArchive(p));
  assert.equal(strFromU8(files["ino/sketch/sketch.ino"]), p.arduino);
  assert.equal(strFromU8(files["ino/sketch/Sensor.h"]), "class Sensor {};");
  assert.ok(files["p5/index.html"]);
  assert.ok(files["p5/style.css"]);
  assert.equal(strFromU8(files["p5/sketch.js"]), p.p5.native);
  assert.deepEqual(Array.from(files["p5/images/a.png"]), [1, 2, 3]);
  assert.deepEqual(JSON.parse(strFromU8(files["p5comp.json"])), p);
  assert.deepEqual(
    JSON.parse(strFromU8(files["circuit/diagram.json"])),
    p.diagram,
  );
});
