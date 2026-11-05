import test from "node:test";
import assert from "node:assert/strict";
import { responseJSON, fetchJSON } from "../shared/loadJSON.js";
import { validateProject } from "../sim/validateProject.js";
test("missing, HTML fallback, empty and malformed JSON have readable errors", async () => {
  for (const [body, init, message] of [
    ["<!doctype html><title>Not found</title>", { status: 404 }, /HTTP 404/],
    [
      "<!doctype html><title>App fallback</title>",
      { status: 200 },
      /web page instead of JSON/,
    ],
    [
      "page",
      { headers: { "content-type": "text/html" } },
      /web page instead of JSON/,
    ],
    ["", {}, /empty/],
    ["{broken", {}, /invalid JSON/],
  ])
    await assert.rejects(
      responseJSON(new Response(body, init), "Example"),
      message,
    );
  await assert.rejects(
    fetchJSON("/missing", "Example", async () => {
      throw Error("offline");
    }),
    /connection/,
  );
  assert.deepEqual(await responseJSON(new Response('{"ok":true}')), {
    ok: true,
  });
});
test("compiler JSON diagnostics survive HTTP errors; HTML error pages do not", async () => {
  assert.deepEqual(
    await responseJSON(
      new Response('{"ok":false,"stderr":"Servo.h missing"}', { status: 422 }),
      "Compiler",
      { allowHTTPError: true },
    ),
    { ok: false, stderr: "Servo.h missing" },
  );
  await assert.rejects(
    responseJSON(
      new Response("<h1>Bad gateway</h1>", { status: 502 }),
      "Compiler",
      { allowHTTPError: true },
    ),
    /web page/,
  );
});
test("project validation catches malformed sources before the workspace is changed; missing HTML is allowed", () => {
  const p = {
    diagram: { parts: [], connections: [] },
    arduino: "",
    p5: { none: "function setup() {}" },
    workbench: { files: {} },
  };
  assert.equal(validateProject(p), p);
  for (const invalid of [
    null,
    [],
    { ...p, p5: { none: 42 } },
    { ...p, arduino: 3 },
    { ...p, workbench: { files: { "index.html": { bad: true } } } },
  ])
    assert.throws(() => validateProject(invalid));
});
