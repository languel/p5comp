import test from "node:test";
import assert from "node:assert/strict";
import { formatCode } from "../shared/editor/formatCode.js";
test("browser formatter handles p5 JavaScript, HTML and CSS and reports syntax errors", async () => {
  assert.equal(
    await formatCode("function draw(){background(0)}", "javascript"),
    "function draw() {\n  background(0);\n}\n",
  );
  assert.match(
    await formatCode("<main><p>Hello</p></main>", "html"),
    /<main><p>Hello<\/p><\/main>\n/,
  );
  assert.match(
    await formatCode("body{margin:0;color:red}", "css"),
    /margin: 0;/,
  );
  await assert.rejects(formatCode("function {", "javascript"));
});
