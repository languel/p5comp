import { fetchJSON } from "../loadJSON.js";
import { unzipSync } from "fflate";
import { validateCompileInput, prepareSketch } from "./sketch.js";

const CACHE = "p5comp-avr-compiler-v1";
const memoryCache = new Map();
export async function verifiedBytes(url, sha256, progress = () => {}) {
  const key = url + "#" + sha256;
  if (memoryCache.has(key)) return memoryCache.get(key);
  const pending = (async () => {
    let cache, cached;
    try {
      cache = await caches.open(CACHE);
      cached = await cache.match(url);
    } catch {}
    let bytes;
    if (cached) bytes = new Uint8Array(await cached.arrayBuffer());
    const digest = async (data) =>
      Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    if (bytes && (await digest(bytes)) !== sha256) {
      bytes = null;
      try {
        await cache.delete(url);
      } catch {}
    }
    if (!bytes) {
      progress("Downloading browser compiler inputs (cached after first use)…");
      let response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      } catch {
        throw Error(
          "Browser compiler files could not download. Check your connection and retry. The local helper is also available in Settings → Compiler.",
        );
      }
      if (!response.ok)
        throw Error(
          `Browser compiler file is unavailable (HTTP ${response.status}). Reload the app and retry.`,
        );
      bytes = new Uint8Array(await response.arrayBuffer());
      if ((await digest(bytes)) !== sha256)
        throw Error(
          "Browser compiler file verification failed. Reload the app and retry.",
        );
      try {
        await cache?.put(
          url,
          new Response(bytes, {
            headers: { "content-type": "application/octet-stream" },
          }),
        );
      } catch {}
    }
    return bytes;
  })();
  memoryCache.set(key, pending);
  try {
    return await pending;
  } catch (e) {
    memoryCache.delete(key);
    throw e;
  }
}
const toolFactories = new Map();
async function browserTool(name, manifest, progress) {
  const tool = manifest.tools[name],
    wasm = await verifiedBytes(tool.wasm.url, tool.wasm.sha256, progress);
  if (!toolFactories.has(name)) {
    const js = await verifiedBytes(tool.mjs.url, tool.mjs.sha256, progress);
    const url = URL.createObjectURL(
      new Blob([js], { type: "text/javascript" }),
    );
    try {
      toolFactories.set(name, (await import(/* @vite-ignore */ url)).default);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return { factory: toolFactories.get(name), wasm };
}
function write(fs, name, bytes) {
  const parts = name.split("/").filter(Boolean);
  let dir = "";
  for (const part of parts.slice(0, -1)) {
    dir += "/" + part;
    try {
      fs.mkdir(dir);
    } catch {}
  }
  fs.writeFile(
    name,
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
  );
}
export function hexUsage(hex) {
  let offset = 0,
    end = 0,
    eof = false,
    bytes = 0;
  for (const line of hex.trim().split(/\r?\n/)) {
    if (!/^:[\da-f]+$/i.test(line) || line.length % 2 !== 1)
      throw Error("Compiler produced invalid HEX.");
    const b = Uint8Array.from(
      line
        .slice(1)
        .match(/../g)
        .map((n) => parseInt(n, 16)),
    );
    if (eof || b.length !== b[0] + 5 || b.reduce((a, v) => a + v, 0) % 256)
      throw Error("Compiler produced invalid HEX checksum/records.");
    if (b[3] === 0) {
      end = Math.max(end, offset + b[1] * 256 + b[2] + b[0]);
      bytes += b[0];
    } else if (b[3] === 4) offset = (b[4] * 256 + b[5]) * 65536;
    else if (b[3] === 2) offset = (b[4] * 256 + b[5]) * 16;
    else if (b[3] === 1) eof = true;
    else if (![3, 5].includes(b[3]))
      throw Error("Compiler produced unsupported HEX records.");
  }
  if (!eof || !bytes) throw Error("Compiler produced no complete firmware.");
  return { flashBytes: end };
}
export function elfRam(bytes) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 52 ||
    d.getUint32(0, false) !== 0x7f454c46 ||
    bytes[4] !== 1 ||
    bytes[5] !== 1
  )
    throw Error("Compiler produced an invalid AVR ELF image.");
  const offset = d.getUint32(32, true),
    size = d.getUint16(46, true),
    count = d.getUint16(48, true);
  let ram = 0;
  for (let i = 0; i < count; i++) {
    const p = offset + i * size,
      flags = d.getUint32(p + 8, true),
      address = d.getUint32(p + 12, true);
    if ((flags & 3) === 3 && address >= 0x800000 && address < 0x810000)
      ram += d.getUint32(p + 20, true);
  }
  return ram;
}
export async function buildInBrowser(
  input,
  {
    base,
    progress = () => {},
    loadTool = browserTool,
    manifest: givenManifest,
  } = {},
) {
  validateCompileInput(input);
  if (Object.keys(input.files || {}).some((n) => n.endsWith(".c")))
    throw Error(
      "Custom .c helper files currently require the local compiler. Select Local helper in Settings → Compiler, or use C++ (.cpp) helper files.",
    );
  const started = performance.now();
  const manifest =
    givenManifest ||
    (await fetchJSON(
      new URL("manifest.json", base),
      "Browser compiler manifest",
    ));
  if (manifest.version !== 1)
    throw Error(
      "Browser compiler inputs changed. Reload the app to use the matching compiler.",
    );
  const board = manifest.boards[input.board];
  if (!board)
    throw Error(
      "This board is not in the browser compiler bundle. Select Local helper in Settings → Compiler.",
    );
  progress("Loading browser compiler…");
  const [commonData, boardData] = await Promise.all([
    verifiedBytes(
      new URL(manifest.common.file, base).href,
      manifest.common.sha256,
      progress,
    ),
    verifiedBytes(new URL(board.bundle, base).href, board.sha256, progress),
  ]);
  const headers = { ...unzipSync(commonData), ...unzipSync(boardData) },
    stderr = [],
    stdout = [];
  const tools = {};
  async function run(name, args, inputs, output, includeHeaders = false) {
    progress(
      name === "cc1plus"
        ? "Compiling in browser…"
        : name === "avr-ld"
          ? "Linking firmware…"
          : "Building firmware…",
    );
    tools[name] ||= await loadTool(name, manifest, progress);
    const { factory, wasm } = tools[name];
    const mod = await factory({
      noInitialRun: true,
      wasmBinary: wasm,
      locateFile: () => manifest.tools[name].wasm.url,
      print: (s) => stdout.push(String(s)),
      printErr: (s) => stderr.push(String(s)),
    });
    write(mod.FS, "/build/.keep", "");
    if (includeHeaders)
      for (const [name, data] of Object.entries(headers))
        if (!name.startsWith("libs/") && !name.startsWith("ldscripts/"))
          write(mod.FS, "/" + name, data);
    for (const [name, data] of Object.entries(inputs))
      write(mod.FS, name, data);
    try {
      const code = mod.callMain(args);
      if (typeof code === "number" && code !== 0) throw Error(`exit ${code}`);
    } catch (e) {
      if (e?.status !== 0 && !/exit\(0\)/.test(String(e.message)))
        throw Object.assign(
          Error(stderr.join("\n") || `${name} failed: ${e.message}`),
          { compilation: true },
        );
    }
    try {
      return mod.FS.readFile(output);
    } catch {
      throw Object.assign(
        Error(stderr.join("\n") || `${name} produced no output.`),
        { compilation: true },
      );
    }
  }
  const includes = board.includes.flatMap((p) => ["-I", p]);
  const flags = [
    "-quiet",
    "-imultilib",
    board.arch,
    `-D__AVR_${board.mcu === "atmega2560" ? "ATmega2560" : "ATmega328P"}__`,
    `-D__AVR_DEVICE_NAME__=${board.mcu}`,
    "-DF_CPU=16000000L",
    "-DARDUINO=10819",
    `-DARDUINO_AVR_${board.macro}`,
    "-DARDUINO_ARCH_AVR",
    "-isystem",
    "/sysroot/gcc/include",
    "-isystem",
    "/sysroot/avr/include",
    ...includes,
    "-I",
    "/sketch",
    `-mn-flash=${board.arch === "avr6" ? 4 : 1}`,
    "-mno-skip-bug",
    `-mmcu=${board.arch}`,
    "-Os",
    "-std=gnu++11",
    "-fpermissive",
    "-fno-exceptions",
    "-fno-threadsafe-statics",
    "-fno-rtti",
    "-fno-enforce-eh-specs",
    "-ffunction-sections",
    "-fdata-sections",
  ];
  const files = Object.fromEntries(
    Object.entries(input.files || {}).map(([n, text]) => [
      "/sketch/" + n,
      text,
    ]),
  );
  files["/build/StudentSketch.cpp"] = prepareSketch(input.source, input.files);
  const units = [
    "/build/StudentSketch.cpp",
    ...Object.keys(input.files || {})
      .filter((n) => n.endsWith(".cpp"))
      .sort()
      .map((n) => "/sketch/" + n),
  ];
  const objects = {};
  for (const [index, name] of units.entries()) {
    const assembly = await run(
      "cc1plus",
      [...flags, name, "-o", "/build/sketch.s"],
      files,
      "/build/sketch.s",
      true,
    );
    objects["/build/unit-" + index + ".o"] = await run(
      "avr-as",
      [`-mmcu=${board.mcu}`, "-o", "/build/sketch.o", "/build/sketch.s"],
      { "/build/sketch.s": assembly },
      "/build/sketch.o",
    );
  }
  const inputs = { ...objects };
  for (const [n, data] of Object.entries(headers))
    if (n.startsWith("libs/") || n.startsWith("ldscripts/"))
      inputs["/" + n] = data;
  const elf = await run(
    "avr-ld",
    [
      "-m",
      board.arch,
      "-T",
      `/ldscripts/${board.arch}.xn`,
      `-Tdata=0x${(0x800000 + board.ramStart).toString(16)}`,
      `--defsym=__DATA_REGION_LENGTH__=${board.ram}`,
      `--defsym=__TEXT_REGION_LENGTH__=${board.flash}`,
      "--gc-sections",
      "-o",
      "/build/sketch.elf",
      `/libs/crt${board.mcu}.o`,
      ...Object.keys(objects),
      "--start-group",
      ...board.archives,
      "-L/libs",
      `-l${board.mcu}`,
      "-lm",
      "-lc",
      "-lgcc",
      "--end-group",
    ],
    inputs,
    "/build/sketch.elf",
  );
  const ramBytes = elfRam(elf);
  const hex = new TextDecoder().decode(
    await run(
      "avr-objcopy",
      ["-O", "ihex", "-R", ".eeprom", "/build/sketch.elf", "/build/sketch.hex"],
      { "/build/sketch.elf": elf },
      "/build/sketch.hex",
    ),
  );
  const { flashBytes } = hexUsage(hex);
  if (flashBytes > board.flash || ramBytes > board.ram)
    throw Error(
      `Sketch does not fit this board: flash ${flashBytes}/${board.flash}, static RAM ${ramBytes}/${board.ram} bytes.`,
    );
  return {
    ok: true,
    hex,
    stderr: stderr.join("\n"),
    stdout: `Browser AVR GCC · ${input.board}\nFlash: ${flashBytes} / ${board.flash} bytes\nStatic RAM: ${ramBytes} / ${board.ram} bytes (leave space for stack/heap)\n`,
    backend: "browser",
    stats: { flashBytes, ramBytes, milliseconds: performance.now() - started },
    compiler: manifest.id,
  };
}
