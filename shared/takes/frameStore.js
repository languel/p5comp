/** Page frames live in IndexedDB, keeping browser autosave small. Exports inline them. */
const cache = new Map();
let database;
const PREFIX = "p5comp-frame:";
async function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("p5comp-take-frames", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("frames");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return database;
}
export async function storeFrame(src) {
  if (!src.startsWith("data:image/"))
    throw new Error("Invalid recording frame.");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(src),
  );
  const ref =
    PREFIX +
    [...new Uint8Array(hash)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  if (cache.has(ref)) return ref;
  const database = await db();
  await new Promise((resolve, reject) => {
    const tx = database.transaction("frames", "readwrite");
    tx.objectStore("frames").put(src, ref);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  cache.set(ref, src);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return ref;
}
export async function frameSource(ref) {
  if (!ref?.startsWith(PREFIX)) return ref;
  if (cache.has(ref)) return cache.get(ref);
  const database = await db();
  const src = await new Promise((resolve, reject) => {
    const r = database.transaction("frames").objectStore("frames").get(ref);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!src)
    throw new Error(
      "A page frame is missing from this browser. Import the exported take or project to recover it.",
    );
  cache.set(ref, src);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return src;
}
async function visit(clips, fn) {
  for (const c of clips || []) {
    if (c.track === "frame") await fn(c);
    if (c.comp) await visit(c.comp.clips, fn);
  }
}
export async function portableTake(take, { compact = false } = {}) {
  const out = structuredClone(take),
    embedded = out.meta?.frameAssets || {},
    assets = {};
  await visit(out.clips, async (c) => {
    const src = embedded[c.src] || (await frameSource(c.src));
    if (compact && c.src.startsWith(PREFIX)) assets[c.src] = src;
    else c.src = src;
  });
  if (out.meta) delete out.meta.frameAssets;
  if (Object.keys(assets).length)
    out.meta = { ...out.meta, frameAssets: assets };
  return out;
}
export async function localTake(take) {
  const out = structuredClone(take),
    embedded = out.meta?.frameAssets || {},
    refs = new Map();
  await visit(out.clips, async (c) => {
    const src = embedded[c.src] || c.src;
    if (src?.startsWith("data:image/")) {
      if (!refs.has(src)) refs.set(src, await storeFrame(src));
      c.src = refs.get(src);
    }
  });
  if (out.meta) delete out.meta.frameAssets;
  return out;
}
export async function localProject(project) {
  const out = structuredClone(project);
  if (out.workbench?.takes)
    for (const [name, take] of Object.entries(out.workbench.takes))
      out.workbench.takes[name] = await localTake(take);
  return out;
}
export async function portableProject(project) {
  const out = structuredClone(project);
  if (out.workbench?.takes)
    for (const [name, take] of Object.entries(out.workbench.takes))
      out.workbench.takes[name] = await portableTake(take, { compact: true });
  return out;
}
