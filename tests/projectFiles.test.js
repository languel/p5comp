import test from "node:test";
import assert from "node:assert/strict";
import { projectFromFolder, validSourceName } from "../sim/projectFiles.js";
const file = (name, source, path = "Class/" + name) => ({
  name,
  size: source.length,
  webkitRelativePath: path,
  text: async () => source,
});
test("folder import pairs main sources and preserves Arduino classes and p5 helper files", async () => {
  const p = await projectFromFolder(
    [
      file("Blink.ino", "void setup() {}"),
      file("sketch.js", "function draw() {}"),
      file("Sensor.h", "class Sensor {};"),
      file("graphics.js", "const palette=[];"),
    ],
    {},
  );
  assert.equal(p.arduino, "void setup() {}");
  assert.equal(p.p5.webserial, "function draw() {}");
  assert.deepEqual(p.workbench.files, {
    "Sensor.h": "class Sensor {};",
    "graphics.js": "const palette=[];",
  });
  assert.equal(p.workbench.name, "Class");
});
test("source-only project fills missing p5 and diagram and rejects duplicate filenames", async () => {
  const p = await projectFromFolder([file("Blink.ino", "void loop() {}")], {});
  assert.match(p.p5.webserial, /createCanvas/);
  assert.equal(p.diagram.parts.length, 0);
  await assert.rejects(
    projectFromFolder([file("foo.js", "1"), file("foo.js", "2")], {}),
    /Duplicate/,
  );
  assert.equal(validSourceName("../secret.h"), false);
});
test("whole project manifest takes precedence over individual sources", async () => {
  const p = {
    version: 2,
    workbench: { references: [{ src: "data:image/png;base64,AA" }] },
  };
  assert.deepEqual(
    await projectFromFolder(
      [file("p5comp.json", JSON.stringify(p)), file("sketch.js", "discarded")],
      {},
    ),
    p,
  );
});
test("p5 folder import retains HTML, CSS and nested image assets", async () => {
  const image = {
    name: "sample.png",
    webkitRelativePath: "Class/assets/sample.png",
    size: 3,
    type: "image/png",
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
  const p = await projectFromFolder(
    [
      file("sketch.js", "function setup() {}"),
      file("index.html", "<main></main>"),
      file("style.css", "body { margin:0 }"),
      image,
    ],
    {},
  );
  assert.equal(p.workbench.files["index.html"], "<main></main>");
  assert.equal(p.workbench.files["style.css"], "body { margin:0 }");
  assert.equal(
    p.workbench.assets["assets/sample.png"].src,
    "data:image/png;base64,AQID",
  );
});
