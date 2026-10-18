import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseParameters, parameterBindings } from "../shared/p5/parameters.js";
const catalog = JSON.parse(
  readFileSync(new URL("../public/examples/index.json", import.meta.url)),
);
const paths = [...new Set(catalog.map((e) => e.project))];
function project(path) {
  return JSON.parse(
    readFileSync(new URL("../public/" + path, import.meta.url)),
  );
}
function sketchContext(source) {
  const ctx = vm.createContext({
    window: {},
    p5: { prototype: {}, registerAddon() {} },
    console,
    TextDecoder,
    TextEncoder,
  });
  vm.runInContext(source + parameterBindings(source), ctx);
  return ctx;
}
test("every shipped p5 serial example declares live communication signals", () => {
  let count = 0;
  for (const path of paths) {
    const p = project(path);
    if (p.api === "none") continue;
    count++;
    for (const source of Object.values(p.p5)) {
      const parsed = parseParameters(source);
      assert.ok(parsed.links.length, path + " needs communication links");
      assert.ok(parsed.rows.length, path + " needs exposed variables");
      const ctx = sketchContext(source);
      for (const binding of ctx.window.__p5compBindings)
        assert.doesNotThrow(() => binding.get(), path + " " + binding.name);
      new Function(source); // Annotations remain legal, inert comments outside p5comp.
    }
  }
  assert.equal(count, 7);
});
test("four-signal and instrument demos expose received samples instead of animation estimates", () => {
  for (const name of ["four-signals", "pwm-instruments", "plotter"]) {
    const p = project("examples/" + name + ".json"),
      ctx = sketchContext(p.p5[p.api]);
    vm.runInContext('acceptLine("1,771,1,94,0,97")', ctx);
    const bindings = ctx.window.__p5compBindings;
    for (const [name, value] of [
      ["button", 1],
      ["pot", 771],
      ["led", 1],
      ["rgb", [94, 0, 97]],
    ]) {
      const actual = bindings.find((r) => r.name === name).get();
      assert.equal(JSON.stringify(actual), JSON.stringify(value));
    }
  }
});
test("minimal two-way LED parameter sends the same command as its preview button", () => {
  const p = project("examples/serial-basics.json"),
    ctx = sketchContext(p.p5.native);
  ctx.sent = [];
  vm.runInContext(
    "writer={write:bytes=>sent.push(new TextDecoder().decode(bytes))}",
    ctx,
  );
  ctx.window.__p5compBindings.find((r) => r.name === "desiredLed").set(true);
  vm.runInContext("sendLed()", ctx);
  assert.deepEqual([...ctx.sent], ["1"]);
});
