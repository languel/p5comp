// Maintainer-only: rebuild the static inputs. Students never run this script.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
const cli = process.env.ARDUINO_CLI || "arduino-cli";
const wasmPackage = process.env.AVR_WASM_PACKAGE;
if (!wasmPackage)
  throw Error(
    "Set AVR_WASM_PACKAGE to an extracted @horang-corp/avr-gcc-wasm@0.2.0 package (see docs/browser-compilation.md).",
  );
const packageInfo = JSON.parse(
  await readFile(path.join(wasmPackage, "package.json"), "utf8"),
);
if (
  packageInfo.name !== "@horang-corp/avr-gcc-wasm" ||
  packageInfo.version !== "0.2.0"
)
  throw Error(
    "The browser compiler tools must be @horang-corp/avr-gcc-wasm@0.2.0.",
  );
const config = (k) =>
  execFileSync(cli, ["config", "get", `directories.${k}`], {
    encoding: "utf8",
  }).trim();
const data = config("data"),
  user = config("user");
const core = path.join(data, "packages/arduino/hardware/avr/1.8.8");
const tool = path.join(
  data,
  "packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7",
);
const destination = new URL("../public/compiler/avr/", import.meta.url);
const libraries = JSON.parse(
  await readFile(new URL("./arduino-libraries.json", import.meta.url), "utf8"),
);
const definitions = [
  { name: "Servo", folder: "Servo", source: "src" },
  { name: "Stepper", folder: "Stepper", source: "src" },
  { name: "AccelStepper", folder: "AccelStepper", source: "src" },
  { name: "LiquidCrystal", folder: "LiquidCrystal", source: "src" },
  { name: "Adafruit NeoPixel", folder: "Adafruit_NeoPixel", source: "." },
  { name: "Firmata", folder: "Firmata", source: "." },
  ...["Wire", "SPI", "EEPROM", "SoftwareSerial"].map((name) => ({
    name,
    folder: name,
    source: "src",
    core: true,
  })),
];
const common = {},
  sources = {},
  includePaths = ["/arduino/core", "/arduino/variant"];
async function files(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (
      e.name.startsWith(".") ||
      ["examples", "extras", "test", "tests", "docs"].includes(e.name)
    )
      continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await files(f)));
    else result.push(f);
  }
  return result.sort();
}
async function addTree(dir, prefix, filter, target) {
  for (const f of await files(dir)) {
    if (filter(f))
      target[
        path.posix.join(prefix, path.relative(dir, f).split(path.sep).join("/"))
      ] = new Uint8Array(await readFile(f));
  }
}
const hash = (b) => createHash("sha256").update(b).digest("hex");
const headers = (f) =>
  /\.(h|hpp|inc)$/.test(f) ||
  ["new", "stdint-gcc.h"].includes(path.basename(f));
const deviceHeaders = new Set(["io.h", "iom328p.h", "iom2560.h", "iomxx0_1.h"]);
await addTree(
  path.join(tool, "avr/include"),
  "sysroot/avr/include",
  (f) =>
    headers(f) &&
    (!/^io.*\.h$/.test(path.basename(f)) ||
      deviceHeaders.has(path.basename(f))),
  common,
);
await addTree(
  path.join(tool, "lib/gcc/avr/7.3.0/include"),
  "sysroot/gcc/include",
  headers,
  common,
);
await addTree(
  path.join(core, "cores/arduino"),
  "arduino/core",
  headers,
  common,
);
await addTree(
  path.join(core, "cores/arduino"),
  "ArduinoCore-avr/cores/arduino",
  () => true,
  sources,
);
await addTree(
  path.join(core, "variants"),
  "ArduinoCore-avr/variants",
  () => true,
  sources,
);
const roots = [];
for (const d of definitions) {
  const root = path.join(
    d.core ? path.join(core, "libraries") : path.join(user, "libraries"),
    d.folder,
  );
  const props = await readFile(path.join(root, "library.properties"), "utf8");
  const version = props.match(/^version=(.+)$/m)?.[1].trim();
  if (
    !d.core &&
    version !== libraries[d.name] &&
    !(
      d.name === "AccelStepper" &&
      version === "1.64" &&
      libraries[d.name] === "1.64.0"
    )
  )
    throw Error(`${d.name}: expected ${libraries[d.name]}, got ${version}`);
  const src = path.join(root, d.source),
    virtual = `/libraries/${d.folder}`;
  includePaths.push(virtual);
  roots.push({ ...d, root, src, virtual });
  await addTree(src, virtual.slice(1), headers, common);
  await addTree(root, `sources/${d.folder}`, () => true, sources);
}
const boards = {
  uno: {
    mcu: "atmega328p",
    arch: "avr5",
    variant: "standard",
    macro: "UNO",
    ramStart: 256,
    ram: 2048,
    flash: 32256,
  },
  nano: {
    mcu: "atmega328p",
    arch: "avr5",
    variant: "eightanaloginputs",
    macro: "NANO",
    ramStart: 256,
    ram: 2048,
    flash: 30720,
  },
  mega: {
    mcu: "atmega2560",
    arch: "avr6",
    variant: "mega",
    macro: "MEGA2560",
    ramStart: 512,
    ram: 8192,
    flash: 253952,
  },
};
const temp = await mkdtemp(path.join(tmpdir(), "p5comp-browser-avr-"));
const run = (name, args) =>
  execFileSync(path.join(tool, "bin", name), args, { stdio: "pipe" });
await mkdir(destination, { recursive: true });
try {
  for (const [id, b] of Object.entries(boards)) {
    const bundle = {};
    await addTree(
      path.join(core, "variants", b.variant),
      `arduino/variants/${b.variant}`,
      headers,
      bundle,
    );
    if (id === "nano")
      await addTree(
        path.join(core, "variants/standard"),
        "arduino/variants/standard",
        headers,
        bundle,
      );
    const work = path.join(temp, id);
    await mkdir(work);
    const flags = [
      `-mmcu=${b.mcu}`,
      "-DF_CPU=16000000L",
      "-DARDUINO=10819",
      `-DARDUINO_AVR_${b.macro}`,
      "-DARDUINO_ARCH_AVR",
      "-Os",
      "-ffunction-sections",
      "-fdata-sections",
      "-fno-lto",
      "-I" + path.join(core, "cores/arduino"),
      "-I" + path.join(core, "variants", b.variant),
    ];
    async function archive(name, dir, predicate) {
      const objects = [];
      for (const [i, f] of (await files(dir)).filter(predicate).entries()) {
        const out = path.join(work, `${name}-${i}.o`),
          cpp = f.endsWith(".cpp");
        const includes = roots.flatMap((r) => ["-I" + r.src]);
        const args = [
          ...flags,
          ...includes,
          ...(cpp
            ? [
                "-std=gnu++11",
                "-fpermissive",
                "-fno-exceptions",
                "-fno-threadsafe-statics",
                "-fno-rtti",
              ]
            : []),
          ...(f.endsWith(".S") ? ["-x", "assembler-with-cpp"] : []),
          "-c",
          f,
          "-o",
          out,
        ];
        try {
          run(cpp ? "avr-g++" : "avr-gcc", args);
        } catch (e) {
          throw Error(`${id} ${f}: ${e.stderr?.toString() || e.message}`);
        }
        objects.push(out);
      }
      if (!objects.length) return;
      const out = path.join(work, `${name}.a`);
      run("avr-ar", ["rcsD", out, ...objects]);
      bundle[`libs/${name}.a`] = new Uint8Array(await readFile(out));
    }
    await archive("core", path.join(core, "cores/arduino"), (f) =>
      /\.(c|cpp|S)$/.test(f),
    );
    for (const r of roots) {
      const wanted = (f) =>
        /\.(c|cpp|S)$/.test(f) &&
        (!r.name.includes("Servo") ||
          !/\/(sam|samd|megaavr|mbed|nrf52|stm32f4|renesas|esp32|zephyr|xmc|silabs)\//.test(
            f,
          ));
      await archive(r.folder, r.src, wanted);
    }
    for (const name of [`crt${b.mcu}.o`, "libc.a", "libm.a", `lib${b.mcu}.a`])
      bundle[`libs/${name}`] = new Uint8Array(
        await readFile(path.join(tool, "avr/lib", b.arch, name)),
      );
    bundle["libs/libgcc.a"] = new Uint8Array(
      await readFile(path.join(tool, "lib/gcc/avr/7.3.0", b.arch, "libgcc.a")),
    );
    bundle[`ldscripts/${b.arch}.xn`] = new Uint8Array(
      await readFile(path.join(tool, "avr/lib/ldscripts", `${b.arch}.xn`)),
    );
    const bytes = zipSync(bundle, {
      level: 9,
      mtime: new Date("2026-01-01T00:00:00Z"),
    });
    await writeFile(new URL(`${id}.zip`, destination), bytes);
    b.bundle = `${id}.zip`;
    b.sha256 = hash(bytes);
    b.includes = includePaths.map((p) =>
      p === "/arduino/variant" ? `/arduino/variants/${b.variant}` : p,
    );
    b.archives = ["core", ...roots.map((r) => r.folder)]
      .map((n) => `/libs/${n}.a`)
      .filter((n) => bundle[n.slice(1)]);
    console.log(
      `${id}: ${bytes.length} bytes; ${Object.keys(bundle).length} inputs`,
    );
  }
  const bytes = zipSync(common, {
    level: 9,
    mtime: new Date("2026-01-01T00:00:00Z"),
  });
  await writeFile(new URL("common.zip", destination), bytes);
  await writeFile(
    new URL("sources.zip", destination),
    zipSync(sources, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") }),
  );
  const npm = wasmPackage;
  const tools = {};
  for (const name of ["cc1plus", "avr-as", "avr-ld", "avr-objcopy"]) {
    tools[name] = {};
    for (const ext of ["mjs", "wasm"]) {
      const f = `${name}.${ext}`,
        bytes = await readFile(path.join(npm, "tools", f));
      tools[name][ext] = {
        url: `https://cdn.jsdelivr.net/npm/@horang-corp/avr-gcc-wasm@0.2.0/tools/${f}`,
        sha256: hash(bytes),
        bytes: bytes.length,
      };
    }
  }
  const manifest = {
    version: 1,
    id: "p5comp-avr-1",
    core: "arduino:avr@1.8.8",
    gcc: "7.3.0-atmel3.6.1-arduino7",
    libraries,
    common: { file: "common.zip", sha256: hash(bytes) },
    boards,
    tools,
  };
  await writeFile(
    new URL("manifest.json", destination),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Common headers: ${bytes.length} bytes. Sources included separately.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
