import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
const root = new URL("../public/compiler/avr/", import.meta.url);
const built = new URL("../dist/compiler/avr/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root)));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const item of [
  { file: manifest.common.file, sha256: manifest.common.sha256 },
  ...Object.values(manifest.boards).map((b) => ({
    file: b.bundle,
    sha256: b.sha256,
  })),
]) {
  const bytes = await readFile(new URL(item.file, root));
  if (hash(bytes) !== item.sha256)
    throw Error("Compiler input checksum mismatch: " + item.file);
  if (!bytes.equals(await readFile(new URL(item.file, built))))
    throw Error("Compiler input missing or different in dist: " + item.file);
  const files = unzipSync(bytes);
  if (!Object.keys(files).length)
    throw Error("Empty compiler archive: " + item.file);
}
for (const name of ["manifest.json", "sources.zip", "NOTICE.md"])
  if (
    !(await readFile(new URL(name, root))).equals(
      await readFile(new URL(name, built)),
    )
  )
    throw Error("Compiler metadata/source bundle differs in dist: " + name);
console.log(
  "Verified Uno/Nano/Mega browser compiler archives, hashes and source/notice bundles in dist.",
);
