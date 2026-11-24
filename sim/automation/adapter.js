import { projectArchive } from "../projectArchive.js";
import { portableProject } from "../../shared/takes/frameStore.js";
import { circuitSVG, svgPNG } from "../exportCircuit.js";
import { toPng } from "html-to-image";
import {
  editorPreferences,
  setEditorPreferences,
} from "../../shared/editor/editorPreferences.js";
import { ELEMENTS as elementCatalog } from "../elements.js";
import { basePath } from "../../shared/basePath.js";
import { validSourceName } from "../projectFiles.js";
import { defaultServoSweepSketch } from "./physics.js";
import { renderDiagramSVG } from "../lessonContent.js";
import { embedComms } from "../commsCode.js";
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
        if (typeof a.scoreTransport === "boolean") {
          const el = document.getElementById("scoreTransportToggle");
          if (el) {
            el.checked = a.scoreTransport;
            el.dispatchEvent(new Event("change"));
          }
        }
        return {
          theme: document.documentElement.dataset.theme,
          editor: editorPreferences(),
          iconSize: Number(document.getElementById("uiIconSize").value),
          pwmRefreshHz: Number(document.getElementById("pwmRefreshHz").value),
          scoreTransport: Boolean(document.getElementById("scoreTransportToggle")?.checked),
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
        const p = await portableProject(project()),
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
        if (a.format === "stage_png") {
          const stageEl = document.getElementById("stage");
          if (stageEl) {
            try {
              const dataUrl = await toPng(stageEl, {
                cacheBust: true,
                pixelRatio: 1,
                backgroundColor: getComputedStyle(stageEl).backgroundColor || "#1e1f1e",
                filter: (node) =>
                  !(node instanceof HTMLElement && node.classList.contains("canvas-menu")),
              });
              return {
                name: name + "-stage.png",
                mimeType: "image/png",
                dataUrl,
                base64: dataUrl.split(",")[1],
              };
            } catch {
              /* fall through to circuit SVG -> PNG */
            }
          }
        }
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
      if (op === "p5_parameters") return ctx.p5Parameters(a);
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
      if (op === "build") {
        const addedParts = [];
        const addedWires = [];
        await edit((p) => {
          if (a.clear) {
            const keepBoard = a.keepBoard !== false;
            const board = keepBoard
              ? p.diagram.parts.find((x) => x.type.startsWith("wokwi-arduino-")) || {
                  id: "board",
                  type: "wokwi-arduino-uno",
                  left: 0,
                  top: 80,
                  attrs: {},
                }
              : null;
            p.diagram.parts = board ? [board] : [];
            p.diagram.connections = [];
          }
          for (const rawPart of a.parts || []) {
            if (!rawPart || !rawPart.type) continue;
            const spec = elementCatalog.find((e) => e.type === rawPart.type);
            const idx = p.diagram.parts.length;
            const id =
              rawPart.id ||
              rawPart.type.replace(/^(wokwi|p5comp)-/, "").replace(/[^a-z0-9]/gi, "") +
                (idx + 1);
            const part = {
              id,
              type: rawPart.type,
              left: Number.isFinite(Number(rawPart.left)) ? Number(rawPart.left) : 340 + (idx % 3) * 140,
              top: Number.isFinite(Number(rawPart.top)) ? Number(rawPart.top) : 80 + Math.floor(idx / 3) * 120,
              ...(Number.isFinite(Number(rawPart.rotate)) ? { rotate: Number(rawPart.rotate) } : {}),
              ...(rawPart.label ? { label: rawPart.label } : {}),
              attrs: { ...(spec?.attrs || {}), ...(rawPart.attrs || {}) },
            };
            const existing = p.diagram.parts.findIndex((x) => x.id === part.id);
            if (existing < 0) p.diagram.parts.push(part);
            else p.diagram.parts[existing] = part;
            addedParts.push(part.id);
          }
          for (const rawConn of a.connections || []) {
            let conn = null;
            if (Array.isArray(rawConn) && rawConn.length >= 2) {
              conn = [String(rawConn[0]), String(rawConn[1]), String(rawConn[2] || "#4e8da6"), Array.isArray(rawConn[3]) ? rawConn[3] : []];
            } else if (rawConn && typeof rawConn === "object" && rawConn.from && rawConn.to) {
              conn = [String(rawConn.from), String(rawConn.to), String(rawConn.color || "#4e8da6"), []];
            }
            if (conn) {
              p.diagram.connections.push(conn);
              addedWires.push(`${conn[0]}->${conn[1]}`);
            }
          }
          if (typeof a.arduino === "string" && a.arduino.trim()) {
            p.arduino = a.arduino;
            p.artifact = null;
          }
          if (typeof a.p5 === "string" && a.p5.trim()) {
            p.p5[p.api] = a.p5;
          }
        });
        let mech = null;
        const mechs = [];
        if (a.clear || a.physics?.clear) {
          try {
            await ctx.physics?.({ action: "clear" });
          } catch {}
        }
        if (a.mechanism?.preset) {
          mech = await ctx.physics?.({
            action: "mechanism",
            preset: a.mechanism.preset,
            ...(a.mechanism.actuatorId ? { actuatorId: a.mechanism.actuatorId } : {}),
            ...(Array.isArray(a.mechanism.origin) ? { origin: a.mechanism.origin } : {}),
            ...(a.mechanism.clear ? { clear: true } : {}),
            ...(a.mechanism.params ? { params: a.mechanism.params } : {}),
          });
          if (mech) mechs.push(mech);
        }
        for (const m of a.mechanisms || []) {
          if (!m?.preset) continue;
          const r = await ctx.physics?.({
            action: "mechanism",
            preset: m.preset,
            ...(m.actuatorId ? { actuatorId: m.actuatorId } : {}),
            ...(Array.isArray(m.origin) ? { origin: m.origin } : {}),
            ...(m.clear ? { clear: true } : {}),
            ...(m.params ? { params: m.params } : {}),
          });
          if (r) mechs.push(r);
        }
        let physicsBatch = null;
        if (a.physics && (a.physics.bodies?.length || a.physics.joints?.length || a.physics.gravity)) {
          physicsBatch = await ctx.physics?.({
            action: "batch",
            bodies: a.physics.bodies || [],
            joints: a.physics.joints || [],
            ...(a.physics.gravity ? { settings: { gravity: a.physics.gravity } } : {}),
          });
        }
        let runtime = null;
        if (a.run) {
          try {
            runtime = await ctx.runtime?.("start");
          } catch (err) {
            runtime = { running: false, error: err.message };
          }
        }
        return {
          parts: addedParts,
          wires: addedWires.length,
          arduinoUpdated: Boolean(a.arduino),
          p5Updated: Boolean(a.p5),
          mechanism: mech || mechs[0] || null,
          ...(mechs.length > 1 ? { mechanisms: mechs } : {}),
          ...(physicsBatch ? { physics: physicsBatch } : {}),
          runtime,
        };
      }
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
      if (op === "code_get") {
        const p = project();
        const lang = a.language || "all";
        if (a.name) {
          if (a.name === p.workbench.arduinoName) {
            return { language: "arduino", name: a.name, source: p.arduino || "" };
          }
          if (a.name === p.workbench.p5Name) {
            return { language: "p5", name: a.name, source: p.p5?.[p.api] || "" };
          }
          if (a.name in (p.workbench.files || {})) {
            return { name: a.name, source: p.workbench.files[a.name] };
          }
          // Graceful fallback: small models often pass guessed names like "main" or "sketch".
          if (lang === "arduino") {
            return {
              language: "arduino",
              name: p.workbench.arduinoName,
              source: p.arduino || "",
              note: `Returned active Arduino sketch (${p.workbench.arduinoName}); no separate file named "${a.name}".`,
            };
          }
          if (lang === "p5") {
            return {
              language: "p5",
              name: p.workbench.p5Name,
              api: p.api,
              source: p.p5?.[p.api] || "",
              note: `Returned active p5.js sketch (${p.workbench.p5Name}); no separate file named "${a.name}".`,
            };
          }
        }
        return {
          ...(lang === "all" || lang === "arduino"
            ? { arduinoName: p.workbench.arduinoName, arduino: p.arduino || "" }
            : {}),
          ...(lang === "all" || lang === "p5"
            ? { p5Name: p.workbench.p5Name, api: p.api, p5: p.p5?.[p.api] || "" }
            : {}),
          extraFiles: Object.keys(p.workbench.files || {}).filter(
            (n) => n !== p.workbench.arduinoName && n !== p.workbench.p5Name,
          ),
        };
      }
      if (op === "code_set") {
        let targetName = "";
        let isMain = true;
        await edit((p) => {
          const main =
            a.language === "arduino"
              ? p.workbench.arduinoName
              : p.workbench.p5Name;
          const existingFiles = p.workbench.files || {};
          // Route to the active main file unless an existing extra file is targeted or createFile is true.
          const useExtra =
            a.name &&
            a.name !== main &&
            (a.createFile === true || Object.prototype.hasOwnProperty.call(existingFiles, a.name));
          const name = useExtra ? a.name : main;
          if (!validSourceName(name)) throw Error("Invalid source filename.");
          targetName = name;
          isMain = name === main;
          if (isMain) {
            if (a.language === "arduino") {
              p.arduino = a.source;
              p.artifact = null;
            } else {
              let nextP5 = String(a.source || "");
              const prevP5 = String(p.p5[p.api] || "");
              const beginMarker = "// p5comp communications: begin";
              const beginIdx = prevP5.indexOf(beginMarker);
              if (beginIdx >= 0 && !nextP5.includes(beginMarker)) {
                nextP5 = `${nextP5.trimEnd()}\n\n${prevP5.slice(beginIdx)}`;
              } else if (
                !nextP5.includes(beginMarker) &&
                /\bfunction\s+acceptLine\b|\barduinoComms\b/.test(nextP5)
              ) {
                nextP5 = embedComms(nextP5, p.api || "webserial");
              }
              p.p5[p.api] = nextP5;
            }
          } else {
            p.workbench.files[name] = a.source;
          }
        });
        return {
          updated: true,
          language: a.language,
          name: targetName,
          isMain,
          lines: String(a.source || "").split("\n").length,
        };
      }
      if (op === "control_set") {
        if (!ctx.project().diagram.parts.some((p) => p.id === a.id))
          throw Error("Component not found.");
        ctx.setControl(a.id, a.value);
        return { value: a.value };
      }
      if (op === "runtime") {
        if (a.action === "start" || a.action === "p5_start") {
          const el = document.getElementById("buildConsole");
          if (el) el.textContent = "";
        }
        return ctx.runtime(a.action);
      }
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
      if (op === "diagram") {
        const code = String(a.code || "").trim();
        if (!code) throw Error("Diagram code is required.");
        const mode = a.mode || "note";
        const rendered = renderDiagramSVG(code, { standalone: true });
        const name = a.name || `${rendered.type || "diagram"}`;
        const id = a.id || `diagram-${Date.now().toString(36)}`;
        if (mode === "asset") {
          const fileName = name.endsWith(".svg") ? name : `${name.replace(/[^a-z0-9_-]/gi, "-")}.svg`;
          const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`;
          await edit((p) => {
            p.workbench.assets ??= {};
            p.workbench.assets[fileName] = {
              type: "image/svg+xml",
              size: rendered.svg.length,
              src: dataUrl,
            };
          });
          return { asset: fileName, type: rendered.type, width: rendered.width, height: rendered.height };
        }
        const x = Number.isFinite(Number(a.x)) ? Number(a.x) : 420;
        const y = Number.isFinite(Number(a.y)) ? Number(a.y) : 60;
        const width = Number.isFinite(Number(a.width)) && Number(a.width) > 0
          ? Number(a.width)
          : Math.max(240, Math.min(560, Math.round((rendered.width || 320) + 32)));
        if (mode === "image") {
          const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`;
          await edit((p) => {
            p.workbench.references ??= [];
            const item = {
              id,
              kind: "image",
              name,
              x,
              y,
              width,
              opacity: 1,
              blend: "normal",
              showLabel: false,
              src: dataUrl,
            };
            const idx = p.workbench.references.findIndex((r) => r.id === id);
            if (idx < 0) p.workbench.references.push(item);
            else p.workbench.references[idx] = item;
          });
          return { id, mode: "image", type: rendered.type, width, height: rendered.height };
        }
        // Default: live-editable Markdown note card containing the ```mermaid``` block
        const source = "```mermaid\n" + code + "\n```";
        await edit((p) => {
          p.workbench.references ??= [];
          const item = {
            id,
            kind: "note",
            format: "markdown",
            name,
            x,
            y,
            width,
            opacity: 1,
            blend: "normal",
            showLabel: false,
            source,
          };
          const idx = p.workbench.references.findIndex((r) => r.id === id);
          if (idx < 0) p.workbench.references.push(item);
          else p.workbench.references[idx] = item;
        });
        return { id, mode: "note", type: rendered.type, width, height: rendered.height };
      }
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
      if (op === "drawing") return ctx.drawing(a);
      if (op === "physics") {
        if (a.action === "demo") {
          const pin = Number.isFinite(Number(a.pin)) ? Number(a.pin) : 9;
          const actType = a.actuator === "gear-motor" ? "p5comp-gear-motor" : "wokwi-servo";
          const actId = a.actuatorId || (actType === "wokwi-servo" ? "servo1" : "motor1");
          await edit((p) => {
            if (a.clear !== false) {
              const board = p.diagram.parts.find((x) => x.type.startsWith("wokwi-arduino-")) || {
                id: "board",
                type: "wokwi-arduino-uno",
                left: 0,
                top: 80,
                attrs: {},
              };
              p.diagram.parts = [
                board,
                { id: actId, type: actType, left: 320, top: 120, attrs: {} },
              ];
              p.diagram.connections =
                actType === "wokwi-servo"
                  ? [
                      [`${board.id}:5V`, `${actId}:V+`, "#c45b4a", []],
                      [`${board.id}:GND.1`, `${actId}:GND`, "#242625", []],
                      [`${board.id}:${pin}`, `${actId}:PWM`, "#4e8da6", []],
                    ]
                  : [
                      [`${board.id}:${pin}`, `${actId}:+`, "#c45b4a", []],
                      [`${board.id}:GND.1`, `${actId}:-`, "#242625", []],
                    ];
              p.arduino = defaultServoSweepSketch(pin);
              p.artifact = null;
            }
          });
          const mech = await ctx.physics({
            action: "mechanism",
            preset: a.preset || "crank-slider",
            actuatorId: actId,
            clear: a.clear !== false,
            ...(a.addArena ? { addArena: true } : {}),
            ...(a.params ? { params: a.params } : {}),
          });
          let noteId = null;
          if (a.note) {
            const noteText = typeof a.note === "string" ? a.note : mech.explanation || `## ${mech.name}\n\n${mech.tagline}`;
            noteId = `note-${mech.mechanism}`;
            await edit((p) => {
              p.workbench.references = (p.workbench.references || []).filter((r) => r.id !== noteId);
              p.workbench.references.push({
                id: noteId,
                kind: "note",
                x: 20,
                y: -155,
                width: 340,
                height: 150,
                source: noteText,
                format: "markdown",
              });
            });
          }
          let runtime = null;
          if (a.run !== false) {
            try {
              runtime = await ctx.runtime?.("start");
            } catch (err) {
              runtime = { running: false, error: err.message };
            }
          }
          return { ...mech, actuatorId: actId, pin, noteId, runtime };
        }
        return ctx.physics(a);
      }
      if (op === "assistant") return ctx.assistant(a);
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
      if (op === "console") {
        const el = document.getElementById("buildConsole");
        const noticeEl = document.getElementById("notice");
        if (a.action === "clear") {
          if (el) el.textContent = "";
          if (noticeEl) {
            noticeEl.textContent = "";
            noticeEl.hidden = true;
          }
          return { cleared: true };
        }
        const rawBuild = (el?.textContent || "")
          .split("\n")
          .map((l) => l.trimEnd())
          .filter(Boolean);
        const notice = noticeEl && !noticeEl.hidden ? (noticeEl.textContent || "").trim() : "";
        const runtimeLines = (ctx.state?.().console || []).map(String);
        const merged = [...rawBuild];
        for (const l of runtimeLines) {
          if (!/^[←→]/.test(l) && !merged.includes(l)) merged.push(l);
        }
        if (notice && !merged.includes(notice)) merged.push(`Notice: ${notice}`);
        const errorRe = /error|err:|exception|failed|cannot|undefined|syntax|warning|invalid|uncaught|referenceerror|typeerror/i;
        const filtered = a.errorsOnly ? merged.filter((l) => errorRe.test(l)) : merged;
        const deduped = [];
        for (const line of filtered) {
          const prev = deduped.at(-1);
          if (prev && prev.line === line) prev.count++;
          else deduped.push({ line, count: 1 });
        }
        const limit = Number.isFinite(Number(a.limit)) ? Math.max(1, Number(a.limit)) : 200;
        const out = deduped
          .slice(-limit)
          .map((d) => (d.count > 1 ? `${d.line} (×${d.count})` : d.line));
        return {
          lines: out,
          text: out.join("\n"),
          notice: notice || null,
          total: merged.length,
        };
      }
      throw Error("Unknown operation: " + op);
    },
  };
}
