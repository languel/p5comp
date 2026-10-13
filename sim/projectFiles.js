export const blankArduino = "void setup() {\n}\n\nvoid loop() {\n}\n";
export const blankP5 =
  "function setup() {\n  createCanvas(600, 400);\n}\n\nfunction draw() {\n  background(240);\n}\n";
export function validSourceName(name) {
  return (
    /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(ino|h|hpp|cpp|c|js)$/i.test(name) &&
    !name.includes("..")
  );
}
export async function projectFromFolder(files, fallback) {
  const entries = Array.from(files);
  const projectFile = entries.find((f) =>
    /(?:p5comp|physical-p5-project)\.json$/i.test(f.name),
  );
  if (projectFile) return JSON.parse(await projectFile.text());
  const sourceFiles = entries.filter((f) => validSourceName(f.name));
  if (!sourceFiles.length)
    throw new Error("No Arduino, JavaScript, or p5comp project files found.");
  const names = new Set();
  const content = {};
  for (const f of sourceFiles) {
    if (f.size > 100000) throw new Error(`${f.name} exceeds 100 KB.`);
    if (names.has(f.name)) throw new Error(`Duplicate filename: ${f.name}`);
    names.add(f.name);
    content[f.name] = await f.text();
  }
  const ino = sourceFiles.find((f) => /\.ino$/i.test(f.name));
  const js =
    sourceFiles.find((f) => f.name === "sketch.js") ||
    sourceFiles.find((f) => /\.js$/i.test(f.name));
  const extras = Object.fromEntries(
    Object.entries(content).filter(([n]) => n !== ino?.name && n !== js?.name),
  );
  const diagramFile = entries.find((f) => f.name === "diagram.json");
  return {
    ...fallback,
    arduino: ino ? content[ino.name] : blankArduino,
    p5: { webserial: js ? content[js.name] : blankP5 },
    diagram: diagramFile
      ? JSON.parse(await diagramFile.text())
      : { version: 1, parts: [], connections: [] },
    workbench: {
      name: entries[0]?.webkitRelativePath?.split("/")[0] || "Imported project",
      files: extras,
      arduinoName: ino?.name || "sketch.ino",
      p5Name: js?.name || "sketch.js",
    },
  };
}
