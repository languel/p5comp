import { zipSync, strToU8 } from "fflate";
export function projectArchive(project, libraries = {}) {
  const workbench = project.workbench || {},
    files = {},
    ino = workbench.arduinoName || "sketch.ino",
    folder = ino.replace(/\.ino$/i, "");
  const safe = (p) => {
    if (
      p.split("/").some((s) => !s || s === ".." || s === ".") ||
      p.startsWith("/")
    )
      throw new Error("Invalid project filename.");
    return p;
  };
  const put = (name, text) => (files[safe(name)] = strToU8(text));
  put("p5comp.json", JSON.stringify(project, null, 2));
  put("circuit/diagram.json", JSON.stringify(project.diagram, null, 2));
  put(`ino/${folder}/${ino}`, project.arduino || "");
  put(
    "p5/" + (workbench.p5Name || "sketch.js"),
    project.p5?.[project.api] ||
      project.p5?.webserial ||
      project.p5?.native ||
      "",
  );
  for (const [name, source] of Object.entries(workbench.files || {}))
    put(
      /\.(ino|h|hpp|cpp|c)$/i.test(name)
        ? `ino/${folder}/${name}`
        : "p5/" + name,
      source,
    );
  for (const [name, asset] of Object.entries(workbench.assets || {})) {
    const [, base64] = asset.src.split(",");
    files[safe("p5/" + name)] = Uint8Array.from(atob(base64), (c) =>
      c.charCodeAt(0),
    );
  }
  for (const [name, source] of Object.entries(libraries))
    put("p5/" + name, source);
  return zipSync(files, { level: 6 });
}
