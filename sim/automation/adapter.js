import { projectArchive } from "../projectArchive.js";
import { circuitSVG, svgPNG } from "../exportCircuit.js";
import {
  editorPreferences,
  setEditorPreferences,
} from "../../shared/editor/editorPreferences.js";
import { ELEMENTS as elementCatalog } from "../elements.js";
import { basePath } from "../../shared/basePath.js";
import { validSourceName } from "../projectFiles.js";
export function createAgentAdapter(ctx) {
  const project = () => structuredClone(ctx.project());
  const edit = async (fn) => {
    const p = project();
    await fn(p);
    await ctx.applyProject(p);
    return { updated: true };
  };
  return {
    workspace: ctx.workspace,
    project: ctx.project,
    state: ctx.state,
    applyProject: ctx.applyProject,
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    async command(op, a) {
      if (op === "settings") {
        const field = (id, value) => {
          const el = document.getElementById(id);
          el.value = value;
          el.dispatchEvent(new Event("change"));
        };
        if (a.theme) field("appTheme", a.theme);
        if (a.editorTheme || a.fontSize)
          setEditorPreferences({
            ...(a.editorTheme ? { theme: a.editorTheme } : {}),
            ...(a.fontSize ? { fontSize: a.fontSize } : {}),
          });
        if (a.iconSize) field("uiIconSize", a.iconSize);
        if (a.pwmRefreshHz) field("pwmRefreshHz", a.pwmRefreshHz);
        return {
          theme: document.documentElement.dataset.theme,
          editor: editorPreferences(),
          iconSize: Number(document.getElementById("uiIconSize").value),
          pwmRefreshHz: Number(document.getElementById("pwmRefreshHz").value),
        };
      }
      if (op === "library") {
        const key = "p5comp.sketchLibrary",
          items = JSON.parse(localStorage.getItem(key) || "[]");
        if (a.action === "list")
          return items.filter((x) => !a.kind || x.kind === a.kind);
        if (a.action === "get") return items.find((x) => x.id === a.id) || null;
        if (a.action === "remove") {
          localStorage.setItem(
            key,
            JSON.stringify(items.filter((x) => x.id !== a.id)),
          );
          return { removed: a.id };
        }
        const p = project(),
          kind = a.kind || a.item?.kind;
        if (!["arduino", "p5"].includes(kind))
          throw Error("Sketch kind required.");
        const item = a.item || {
          version: 1,
          kind,
          name: a.name || p.workbench.name,
          source: kind === "arduino" ? p.arduino : p.p5[p.api],
          files: Object.fromEntries(
            Object.entries(p.workbench.files).filter(([n]) =>
              kind === "arduino"
                ? /\.(ino|h|hpp|cpp|c)$/.test(n)
                : /\.(js|css|html)$/.test(n),
            ),
          ),
          assets: kind === "p5" ? p.workbench.assets : {},
        };
        if (typeof item.source !== "string")
          throw Error("Sketch source required.");
        const value = { ...item, kind, id: a.id || crypto.randomUUID() };
        localStorage.setItem(
          key,
          JSON.stringify([...items.filter((x) => x.id !== value.id), value]),
        );
        return value;
      }
      if (op === "export") {
        const p = project(),
          name = p.workbench.name || "p5comp";
        const base64 = (bytes) => {
          let s = "";
          for (let i = 0; i < bytes.length; i += 8192)
            s += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return btoa(s);
        };
        if (a.format === "json")
          return {
            name: name + ".json",
            mimeType: "application/json",
            text: JSON.stringify(p, null, 2),
          };
        if (a.format === "zip") {
          const libraries = {};
          for (const [name, path] of [
            ["p5.js", "libraries/p5.min.js"],
            ["p5.webserial.js", "libraries/p5.webserial.js"],
          ]) {
            const response = await fetch(basePath(path));
            if (!response.ok)
              throw Error("Bundled library unavailable: " + path);
            libraries[name] = await response.text();
          }
          return {
            name: name + ".zip",
            mimeType: "application/zip",
            base64: base64(projectArchive(p, libraries)),
          };
        }
        if (a.format === "pdf") return ctx.exportPDF();
        const sources = a.includeCode
          ? {
              [p.workbench.arduinoName]: p.arduino,
              [p.workbench.p5Name]: p.p5[p.api],
              ...p.workbench.files,
            }
          : {};
        const { svg, width, height } = circuitSVG(
          p.diagram,
          p.workbench.references || [],
          getComputedStyle(document.getElementById("stage")).backgroundColor,
          sources,
        );
        if (a.format === "svg")
          return { name: name + ".svg", mimeType: "image/svg+xml", text: svg };
        const data = await svgPNG(svg, width, height);
        return {
          name: name + ".png",
          mimeType: "image/png",
          base64: data.split(",")[1],
        };
      }
      if (op === "catalog")
        return elementCatalog.filter(
          (p) =>
            !a.query ||
            JSON.stringify(p).toLowerCase().includes(a.query.toLowerCase()),
        );
      if (op === "part_put")
        return edit((p) => {
          const i = p.diagram.parts.findIndex((x) => x.id === a.part.id);
          if (i < 0) p.diagram.parts.push(a.part);
          else p.diagram.parts[i] = a.part;
        });
      if (op === "part_remove")
        return edit((p) => {
          p.diagram.parts = p.diagram.parts.filter((x) => x.id !== a.id);
          p.diagram.connections = p.diagram.connections.filter(
            (c) => !c.slice(0, 2).some((t) => t.startsWith(a.id + ":")),
          );
        });
      if (op === "wire_put")
        return edit((p) => {
          if (a.index == null) p.diagram.connections.push(a.connection);
          else {
            if (!p.diagram.connections[a.index])
              throw Error("Wire index not found.");
            p.diagram.connections[a.index] = a.connection;
          }
        });
      if (op === "wire_remove")
        return edit((p) => {
          if (!p.diagram.connections[a.index])
            throw Error("Wire index not found.");
          p.diagram.connections.splice(a.index, 1);
        });
      if (op === "code_set")
        return edit((p) => {
          const name =
            a.name ||
            (a.language === "arduino"
              ? p.workbench.arduinoName
              : p.workbench.p5Name);
          if (!validSourceName(name)) throw Error("Invalid source filename.");
          const main =
            a.language === "arduino"
              ? p.workbench.arduinoName
              : p.workbench.p5Name;
          if (name === main) {
            if (a.language === "arduino") {
              p.arduino = a.source;
              p.artifact = null;
            } else p.p5[p.api] = a.source;
          } else p.workbench.files[name] = a.source;
        });
      if (op === "control_set") {
        if (!ctx.project().diagram.parts.some((p) => p.id === a.id))
          throw Error("Component not found.");
        ctx.setControl(a.id, a.value);
        return { value: a.value };
      }
      if (op === "runtime") return ctx.runtime(a.action);
      if (op === "canvas") return ctx.canvas(a);
      if (op === "media_put")
        return edit((p) => {
          const m = a.media;
          if (!m.id || !["note", "image", "video", "webcam"].includes(m.kind))
            throw Error("Media needs id and kind.");
          if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !(m.width > 0))
            throw Error("Media needs numeric x/y and positive width.");
          p.workbench.references ??= [];
          const i = p.workbench.references.findIndex((x) => x.id === m.id);
          const value = {
            opacity: 1,
            blend: "normal",
            showLabel: false,
            name: m.kind === "note" ? "Note" : "Media",
            ...m,
          };
          if (i < 0) p.workbench.references.push(value);
          else p.workbench.references[i] = value;
        });
      if (op === "media_remove")
        return edit(
          (p) =>
            (p.workbench.references = (p.workbench.references || []).filter(
              (x) => x.id !== a.id,
            )),
        );
      if (op === "asset") {
        const assets = ctx.project().workbench.assets || {};
        if (a.action === "list")
          return Object.entries(assets).map(([name, v]) => ({
            name,
            type: v.type,
            size: v.size,
          }));
        if (!a.name) throw Error("Asset name required.");
        if (a.action === "get") return assets[a.name] || null;
        return edit((p) => {
          p.workbench.assets ??= {};
          if (a.action === "put") {
            if (!a.asset || typeof a.asset.src !== "string")
              throw Error("Asset src required.");
            p.workbench.assets[a.name] = a.asset;
          } else delete p.workbench.assets[a.name];
        });
      }
      if (op === "view") return ctx.view(a);
      if (op === "examples") {
        const index = await (
          await fetch(basePath("examples/index.json"))
        ).json();
        if (!a.path) return index;
        if (!index.some((x) => x.project === a.path))
          throw Error("Choose a path from the example catalog.");
        const p = await (await fetch(basePath(a.path))).json();
        await ctx.applyProject(p, { replace: true });
        return { loaded: a.path };
      }
      if (op === "serial") return ctx.serial(a);
      throw Error("Unknown operation: " + op);
    },
  };
}
