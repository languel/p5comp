import { cppLanguage } from "@codemirror/lang-cpp";
export function validateCompileInput({ board, source, files = {} }) {
  if (!["uno", "nano", "mega"].includes(board))
    throw Error("Choose an Uno, classic Nano or Mega 2560 board.");
  if (typeof source !== "string" || !source.length || source.length > 100000)
    throw Error("Arduino source must contain 1–100,000 characters.");
  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    Object.keys(files).length > 30
  )
    throw Error("Arduino project must have at most 30 helper source files.");
  let total = source.length;
  for (const [name, text] of Object.entries(files)) {
    if (
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(ino|h|hpp|cpp|c)$/.test(name) ||
      name.includes("..") ||
      name === "StudentSketch.ino" ||
      typeof text !== "string" ||
      text.length > 100000
    )
      throw Error("Invalid Arduino project source file: " + name);
    total += text.length;
  }
  if (total > 450000)
    throw Error(
      "Arduino project exceeds the browser compiler source budget (450 KB).",
    );
}
// Ordinary Arduino-style top-level prototypes from the C++ syntax tree.
// Namespaces, templates and member definitions retain explicit declarations.
export function prepareSketch(source, files = {}) {
  const names = [
    "StudentSketch.ino",
    ...Object.keys(files)
      .filter((n) => n.endsWith(".ino"))
      .sort(),
  ];
  const original = names
    .map(
      (name) =>
        `#line 1 "${name}"\n${name === "StudentSketch.ino" ? source : files[name]}\n`,
    )
    .join("\n");
  const tree = cppLanguage.parser.parse(original),
    functions = [],
    defaults = [],
    declared = new Set();
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    if (n.name === "Declaration") {
      const d = n.getChild("FunctionDeclarator"),
        id = d?.getChild("Identifier");
      if (id) declared.add(original.slice(id.from, id.to));
    }
  }
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    if (n.name !== "FunctionDefinition") continue;
    const block = n.getChild("CompoundStatement"),
      d = n.getChild("FunctionDeclarator"),
      id = d?.getChild("Identifier");
    if (!block) continue;
    const signature = original.slice(n.from, block.from).trim();
    if (
      signature.startsWith("template") ||
      signature.includes("::") ||
      (id && declared.has(original.slice(id.from, id.to)))
    )
      continue;
    functions.push({ at: n.from, signature });
    const params = d?.getChild("ParameterList");
    for (let p = params?.firstChild; p; p = p.nextSibling)
      if (p.name === "OptionalParameterDeclaration") {
        const equal = original.indexOf("=", p.from);
        if (equal >= p.from && equal < p.to) defaults.push([equal, p.to]);
      }
  }
  const body = original.split("");
  for (const [from, to] of defaults)
    for (let i = from; i < to; i++) if (body[i] !== "\n") body[i] = " ";
  const text = body.join(""),
    at = functions[0]?.at ?? text.length;
  const prefix = original.slice(0, at),
    directives = [...prefix.matchAll(/^#line (\d+) "([^"]+)"/gm)],
    last = directives.at(-1);
  const line = last
    ? Number(last[1]) +
      prefix.slice(last.index + last[0].length).split("\n").length -
      2
    : prefix.split("\n").length;
  const name = last?.[2] || "StudentSketch.ino";
  return (
    "#include <Arduino.h>\n" +
    text.slice(0, at) +
    "\n" +
    functions.map((f) => f.signature + ";").join("\n") +
    `\n#line ${Math.max(1, line)} "${name}"\n` +
    text.slice(at)
  );
}
