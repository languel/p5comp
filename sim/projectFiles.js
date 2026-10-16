export function defaultP5HTML(sketch = "sketch.js", serial = false) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>p5 sketch</title>
    <script src="p5.js"></script>
${serial ? '    <script src="p5.webserial.js"></script>\n' : ""}    <style>
      html, body {
        margin: 0;
        padding: 0;
      }
      canvas {
        display: block;
      }
    </style>
  </head>
  <body>
    <main id="canvas"></main>
    <script src="${sketch}"></script>
  </body>
</html>
`;
}
export const blankArduino = "void setup() {\n}\n\nvoid loop() {\n}\n";
export const blankP5 =
  "function setup() {\n  createCanvas(600, 400);\n}\n\nfunction draw() {\n  background(240);\n}\n";
export function validSourceName(name) {
  return (
    /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(ino|h|hpp|cpp|c|js|html|css)$/i.test(
      name,
    ) && !name.includes("..")
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
  const assets = {};
  for (const f of entries.filter(
    (f) =>
      /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|mp4|webm|woff2?|ttf|json)$/i.test(
        f.name,
      ) && !["diagram.json", "p5comp.json"].includes(f.name),
  )) {
    if (f.size > 4000000) throw new Error(`${f.name} exceeds 4 MB.`);
    const path = f.webkitRelativePath?.split("/").slice(1).join("/") || f.name;
    assets[path] = {
      src: await assetDataURL(f),
      type: f.type || "application/octet-stream",
      size: f.size,
    };
  }
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
      assets,
      arduinoName: ino?.name || "sketch.ino",
      p5Name: js?.name || "sketch.js",
    },
  };
}

export async function assetDataURL(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
