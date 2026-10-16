const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const encode = (s) => s.replace(/~/g, "~0").replace(/\//g, "~1");
export function diff(before, after, path = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    !Array.isArray(before) &&
    !Array.isArray(after) &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const patches = [];
    for (const k of Object.keys(before))
      if (!(k in after))
        patches.push({ op: "remove", path: path + "/" + encode(k) });
    for (const k of Object.keys(after))
      patches.push(
        ...(k in before
          ? diff(before[k], after[k], path + "/" + encode(k))
          : [{ op: "add", path: path + "/" + encode(k), value: after[k] }]),
      );
    return patches;
  }
  return [{ op: "replace", path, value: after }];
}
export function applyPatch(project, patches) {
  let result = structuredClone(project);
  for (const p of patches) {
    if (
      !["add", "replace", "remove", "test"].includes(p.op) ||
      typeof p.path !== "string" ||
      (p.path && !p.path.startsWith("/"))
    )
      throw Error("Invalid patch operation/path.");
    const keys = p.path
      ? p.path
          .slice(1)
          .split("/")
          .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"))
      : [];
    if (keys.some((k) => forbidden.has(k))) throw Error("Unsafe patch path.");
    if (!keys.length) {
      if (p.op === "test") {
        if (JSON.stringify(result) !== JSON.stringify(p.value))
          throw Error("Patch test failed.");
      } else if (p.op === "remove") throw Error("Cannot remove project root.");
      else result = structuredClone(p.value);
      continue;
    }
    let parent = result;
    for (const key of keys.slice(0, -1)) {
      if (!parent || !Object.hasOwn(parent, key))
        throw Error("Patch parent not found.");
      parent = parent[key];
    }
    const key = keys.at(-1);
    if (!parent || typeof parent !== "object")
      throw Error("Patch parent is not a container.");
    if (p.op === "test") {
      if (
        !Object.hasOwn(parent, key) ||
        JSON.stringify(parent[key]) !== JSON.stringify(p.value)
      )
        throw Error("Patch test failed.");
      continue;
    }
    if (Array.isArray(parent)) {
      if (!/^(0|[1-9][0-9]*|-)$/.test(key) || (key === "-" && p.op !== "add"))
        throw Error("Invalid array index.");
      const i = key === "-" ? parent.length : Number(key);
      if (
        !Number.isInteger(i) ||
        i < 0 ||
        i > parent.length ||
        (p.op !== "add" && i === parent.length)
      )
        throw Error("Invalid array index.");
      if (p.op === "add") parent.splice(i, 0, structuredClone(p.value));
      else if (p.op === "remove") parent.splice(i, 1);
      else parent[i] = structuredClone(p.value);
    } else {
      if (p.op !== "add" && !Object.hasOwn(parent, key))
        throw Error("Patch target not found.");
      if (p.op === "remove") delete parent[key];
      else parent[key] = structuredClone(p.value);
    }
  }
  return result;
}
