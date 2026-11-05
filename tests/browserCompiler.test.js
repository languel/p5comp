import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateCompileInput,
  prepareSketch,
} from "../shared/compile/sketch.js";
import { hexUsage, elfRam } from "../shared/compile/engine.js";
import { compilerMode } from "../shared/compile/client.js";
const manifest = JSON.parse(
  readFileSync(
    new URL("../public/compiler/avr/manifest.json", import.meta.url),
  ),
);
test("browser compilation defaults to no helper; explicit helper projects keep their choice", () => {
  assert.equal(compilerMode(), "browser");
  assert.equal(
    compilerMode({ compiler: "http://127.0.0.1/api/compile" }),
    "local",
  );
  assert.equal(
    compilerMode({ compilerMode: "browser", compiler: "old-url" }),
    "browser",
  );
  assert.equal(compilerMode({ compilerMode: "local" }), "local");
});
test("Uno, Nano and Mega use appropriate MCU, flash, SRAM, variant and timer-capable core inputs", () => {
  assert.equal(manifest.boards.uno.mcu, "atmega328p");
  assert.equal(manifest.boards.nano.variant, "eightanaloginputs");
  assert.equal(manifest.boards.nano.flash, 30720);
  assert.equal(manifest.boards.mega.mcu, "atmega2560");
  assert.equal(manifest.boards.mega.arch, "avr6");
  assert.equal(manifest.boards.mega.ramStart, 512);
  assert.equal(manifest.boards.mega.ram, 8192);
  assert.equal(manifest.boards.mega.flash, 253952);
  for (const board of Object.values(manifest.boards)) {
    assert.match(board.sha256, /^[a-f0-9]{64}$/);
    for (const lib of [
      "Servo",
      "Stepper",
      "AccelStepper",
      "LiquidCrystal",
      "Adafruit_NeoPixel",
      "Firmata",
    ])
      assert.ok(board.archives.includes(`/libs/${lib}.a`));
  }
});
test("input validation rejects traversal, invalid boards, invalid files and oversized projects", () => {
  const input = {
    board: "mega",
    source: "void setup(){}void loop(){}",
    files: { "Helper.h": "void helper();", "Helper.cpp": "void helper(){}" },
  };
  assert.doesNotThrow(() => validateCompileInput(input));
  for (const invalid of [
    { ...input, board: "esp32" },
    { ...input, source: "" },
    { ...input, files: { "../x.h": "x" } },
    { ...input, files: { "StudentSketch.ino": "x" } },
    { ...input, files: { "x.h": 1 } },
    { ...input, files: Array(2) },
  ])
    assert.throws(() => validateCompileInput(invalid));
});
test("Arduino prototypes ignore comments, strings and class methods, keep types before declarations, and restore source lines", () => {
  const source =
    "struct Point {int x; void method() {}};\n// int fake() {\nvoid setup(){ helper(); }\nint helper(){return 2;}\nvoid loop(){}";
  const out = prepareSketch(source);
  assert.ok(out.indexOf("struct Point") < out.indexOf("void setup();"));
  assert.ok(out.includes("int helper();"));
  assert.ok(!out.includes("void method();"));
  assert.ok(!out.includes("int fake();"));
  assert.match(out, /#line 3 "StudentSketch.ino"\nvoid setup\(\)/);
  const defaults = prepareSketch(
    "void setup(){helper();}\nint helper(int n=2){return n;}\nvoid loop(){}",
  );
  assert.ok(defaults.includes("int helper(int n=2);"));
  assert.match(defaults, /int helper\(int n\s+\)\{return n;/);
});
test("secondary Arduino files concatenate in stable order; explicit C++ headers are left available to the compiler", () => {
  const out = prepareSketch("void setup(){later();}void loop(){}", {
    "B.ino": "void later(){}",
    "A.ino": "int value=1;",
    "Helper.cpp": "void notArduino(){}",
  });
  assert.ok(out.indexOf('#line 1 "A.ino"') < out.indexOf('#line 1 "B.ino"'));
  assert.ok(out.includes("void later();"));
  assert.ok(!out.includes("notArduino"));
});
test("Intel HEX flash use honors extended addresses and rejects corrupt/incomplete output", () => {
  const uno = readFileSync(
    new URL("../public/sim/classroom.hex", import.meta.url),
    "utf8",
  );
  assert.ok(hexUsage(uno).flashBytes > 0);
  assert.throws(() => hexUsage(uno.replace(":", ":0")));
  assert.throws(() => hexUsage(":00000001FF"));
  assert.throws(() => elfRam(new Uint8Array(20)));
});

test("compiler input caching verifies cached bytes, supports a warm offline cache, and repairs corrupt entries", async () => {
  const { verifiedBytes } = await import("../shared/compile/engine.js");
  const previousCache = globalThis.caches,
    previousFetch = globalThis.fetch;
  const bytes = new TextEncoder().encode("compiler fixture");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let deleted = 0,
    stored = 0,
    network = 0;
  try {
    globalThis.caches = {
      open: async () => ({
        match: async () => new Response(bytes),
        delete: async () => deleted++,
        put: async () => stored++,
      }),
    };
    globalThis.fetch = async () => {
      throw Error("offline");
    };
    assert.deepEqual(
      await verifiedBytes("https://example.invalid/warm-compiler", hash),
      bytes,
    );
    globalThis.caches = {
      open: async () => ({
        match: async () => new Response("broken cache"),
        delete: async () => deleted++,
        put: async () => stored++,
      }),
    };
    globalThis.fetch = async () => {
      network++;
      return new Response(bytes);
    };
    assert.deepEqual(
      await verifiedBytes("https://example.invalid/repair-compiler", hash),
      bytes,
    );
    assert.equal(deleted, 1);
    assert.equal(stored, 1);
    assert.equal(network, 1);
    globalThis.fetch = async () => new Response("wrong download");
    await assert.rejects(
      verifiedBytes("https://example.invalid/corrupt-compiler", hash),
      /verification failed/,
    );
  } finally {
    globalThis.caches = previousCache;
    globalThis.fetch = previousFetch;
  }
});
