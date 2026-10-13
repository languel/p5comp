import { createEditor } from "../shared/editor/createEditor.js";
import { circuitSVG, svgPNG } from "./exportCircuit.js";
import { jsPDF } from "jspdf";
import { basePath } from "../shared/basePath.js";
import {
  blankArduino,
  blankP5,
  validSourceName,
  projectFromFolder,
} from "./projectFiles.js";
import "./workbench.css";
const $ = (id) => document.getElementById(id);
const node = (tag, cls, html = "") => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
};
const download = async (name, data, type = "application/json") => {
  const blob =
    typeof data === "string" && data.startsWith("data:")
      ? await (await fetch(data)).blob()
      : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export class Workbench {
  constructor(ctx) {
    this.ctx = ctx;
    this.files = {};
    this.extra = new Map();
    this.references = [];
    this.settings = {};
    this.name = "Classroom";
    document.body.classList.add("unified");
    document.querySelector(".section-nav").remove();
    const legacy = document.querySelector(".app-menu");
    legacy.querySelector("summary").textContent = "Reference";
    const toolbar = document.querySelector(".bar");
    const fileMenu = node(
      "details",
      "wb-menu",
      '<summary>File</summary><div><button id="newProject">New project</button><button id="saveProject">Save project…</button><button id="openProject">Open project…</button><button id="openFolder">Open folder…</button><button id="saveFolder">Save to folder…</button><hr><button id="addReference">Add reference image…</button><button id="exportPNG">Export PNG</button><button id="exportSVG">Export SVG</button><button id="exportPDF">Export PDF with code</button></div>',
    );
    toolbar.querySelector(".brand").after(fileMenu);
    ["save", "open", "lesson"].forEach((id) => ($(id).hidden = true));
    this.title = node("span", "project-name");
    fileMenu.after(this.title);
    const examples = node(
      "details",
      "wb-menu",
      '<summary>Examples</summary><div id="exampleLibrary"><button id="classExample">Distance / pot / buttons</button><button id="blinkExample">HelloLED</button><button id="firmataExample">StandardFirmata</button><hr><button id="saveExample">Save current as example</button></div>',
    );
    this.title.after(examples);
    const viewMenu = node(
      "details",
      "wb-menu",
      '<summary>View</summary><div><button data-dock="split">p5 split panel</button><button data-dock="overlay">p5 overlay</button><button data-dock="window">p5 window</button><button data-dock="hidden">Hide p5 output</button><button id="showInspector">Show inspector</button></div>',
    );
    examples.after(viewMenu);
    viewMenu.querySelectorAll("[data-dock]").forEach(
      (b) =>
        (b.onclick = () => {
          this.dock(b.dataset.dock);
          ctx.persist();
        }),
    );
    $("showInspector").onclick = () => (this.editorPanel.hidden = false);
    const settingsMenu = node(
      "details",
      "wb-menu",
      '<summary>Settings</summary><div id="globalSettings"><label>Include code in PNG/SVG <input id="exportCode" type="checkbox"></label><label>Workbench <input id="workbenchColor" type="color"></label><label>p5 background <input id="outputColor" type="color"></label><label>Compiler URL <input id="compilerURL" placeholder="http://127.0.0.1:8771/api/compile"></label></div>',
    );
    examples.after(settingsMenu);
    settingsMenu.querySelector("div").prepend($("themeToggle"));
    const main = document.querySelector("main");
    this.editorPanel = node(
      "aside",
      "wb-right",
      '<nav class="wb-tabs" role="tablist" aria-label="Inspector"><button role="tab" data-tab="arduino">Arduino</button><button role="tab" data-tab="p5">p5</button><button role="tab" data-tab="properties">Properties</button><button role="tab" data-tab="help">Help</button><button id="closeInspector" title="Hide inspector">×</button></nav><section data-pane="arduino"></section><section data-pane="p5"></section><section data-pane="properties"><div class="section-bar"><span id="propertyTitle">Selection</span><button id="applyProperties">Apply JSON</button></div><div id="propertyEditor"></div><div id="referenceProperties"></div></section><section data-pane="help"><div id="helpHome"><p>Select an element and press ? for documentation.</p><p>⌘/Ctrl Enter: run · Shift-click wire: bend · Space-drag: pan</p></div></section>',
    );
    const editors = document.querySelectorAll("#code .editors > section");
    this.editorPanel.querySelector('[data-pane="arduino"]').append(editors[0]);
    this.editorPanel.querySelector('[data-pane="p5"]').append(editors[1]);
    this.editorPanel
      .querySelector('[data-pane="help"]')
      .append(document.querySelector(".part-docs"));
    $("code").hidden = true;
    main.append(this.editorPanel);
    const resize = node("div", "inspector-resize");
    this.editorPanel.prepend(resize);
    resize.title = "Resize inspector";
    resize.onpointerdown = (e) => {
      e.preventDefault();
      resize.setPointerCapture(e.pointerId);
      resize.onpointermove = (e) => {
        main.style.gridTemplateColumns = `minmax(0,1fr) ${Math.max(280, Math.min(700, innerWidth - e.clientX))}px`;
      };
      resize.onpointerup = () => (resize.onpointermove = null);
    };
    this.propertyEditor = createEditor({
      parent: $("propertyEditor"),
      value: "{}",
      language: "javascript",
      onRun: () => this.applyProperties(),
    });
    this.arduinoPane = this.editorPanel.querySelector(
      '[data-pane="arduino"] > section',
    );
    this.p5Pane = this.editorPanel.querySelector('[data-pane="p5"] > section');
    this.addFileBar(this.arduinoPane, "arduino");
    this.addFileBar(this.p5Pane, "p5");
    this.editorPanel
      .querySelectorAll("[data-tab]")
      .forEach((b) => (b.onclick = () => this.tab(b.dataset.tab)));
    $("closeInspector").onclick = () => (this.editorPanel.hidden = true);
    $("toggleCode").onclick = () => {
      this.editorPanel.hidden = !this.editorPanel.hidden;
      this.ctx.canvas.render();
    };
    $("applyProperties").onclick = () => this.applyProperties();
    this.tab("arduino");
    this.bottom = node(
      "section",
      "wb-bottom",
      '<nav class="wb-tabs" role="tablist" aria-label="Tools"><button role="tab" data-bottom="simulation">Simulation</button><button role="tab" data-bottom="upload">Upload</button><button role="tab" data-bottom="serial">Serial</button><button role="tab" data-bottom="console">Console</button><button id="collapseBottom" title="Collapse tools">⌄</button></nav><div data-tool="simulation"></div><div data-tool="upload"></div><div data-tool="serial"></div><div data-tool="console"><pre id="p5Console"></pre></div>',
    );
    main.append(this.bottom);
    this.bottom.querySelector('[data-tool="simulation"]').append($("controls"));
    this.bottom.append(document.querySelector(".section-foot"));
    this.bottom
      .querySelector('[data-tool="upload"]')
      .append(document.querySelector("footer > div"));
    const uploadCode = node("button", "", "Compile + upload");
    uploadCode.id = "compileUpload";
    this.bottom.querySelector('[data-tool="upload"]').prepend(uploadCode);
    uploadCode.onclick = () =>
      this.action(async () => {
        await ctx.compile();
        ctx.persist();
        $("upload").click();
      });
    this.bottom
      .querySelector('[data-tool="serial"]')
      .append(document.querySelector("#monitor .log-tools"), $("log"));
    $("monitor").hidden = true;
    document.querySelector("footer").hidden = true;
    this.bottom
      .querySelectorAll("[data-bottom]")
      .forEach((b) => (b.onclick = () => this.bottomTab(b.dataset.bottom)));
    $("collapseBottom").onclick = () =>
      this.bottom.classList.toggle("collapsed");
    this.bottomTab("simulation");
    const outputMode = node(
      "select",
      "",
      '<option value="split">Split</option><option value="overlay">Overlay</option><option value="window">Window</option><option value="hidden">Hidden</option>',
    );
    outputMode.id = "outputDock";
    outputMode.setAttribute("aria-label", "p5 output docking");
    document.querySelector(".preview-panel .section-bar").prepend(outputMode);
    outputMode.onchange = () => {
      this.dock(outputMode.value);
      ctx.persist();
    };
    this.preview = document.querySelector(".preview-panel");
    this.preview
      .querySelector(".section-bar")
      .addEventListener("pointerdown", (e) => {
        if (
          !this.preview.classList.contains("output-overlay") ||
          e.target.closest("button,select")
        )
          return;
        const r = this.preview.getBoundingClientRect(),
          start = { x: e.clientX, y: e.clientY };
        e.target.setPointerCapture(e.pointerId);
        e.target.onpointermove = (e) => {
          this.preview.style.left = r.left + e.clientX - start.x + "px";
          this.preview.style.top = r.top + e.clientY - start.y + "px";
          this.preview.style.right = "auto";
        };
        e.target.onpointerup = () => (e.target.onpointermove = null);
      });
    this.outputHome = $("p5Frame").parentElement;
    ctx.bridge.addEventListener("console", (e) => {
      const p = $("p5Console");
      p.textContent +=
        e.detail.values
          .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
          .join(" ") + "\n";
      p.textContent = p.textContent.slice(-20000);
    });
    ctx.bridge.addEventListener("runtimeError", (e) => {
      $("p5Console").textContent += e.detail.message + "\n";
      this.bottomTab("console");
    });
    $("newProject").onclick = () =>
      this.action(() =>
        ctx.openProject({
          diagram: { version: 1, parts: [], connections: [] },
          arduino: blankArduino,
          p5: { webserial: blankP5 },
          workbench: { name: "Untitled" },
        }),
      );
    $("saveProject").onclick = () =>
      download(
        this.name + ".p5comp.json",
        JSON.stringify(ctx.project(), null, 2),
      );
    $("openProject").onclick = () => $("projectFile").click();
    this.folder = node("input", "");
    this.folder.type = "file";
    this.folder.webkitdirectory = true;
    this.folder.multiple = true;
    this.folder.hidden = true;
    document.body.append(this.folder);
    $("openFolder").onclick = () => this.folder.click();
    this.folder.onchange = () =>
      this.action(async () =>
        ctx.openProject(
          await projectFromFolder(this.folder.files, ctx.lesson()),
        ),
      );
    $("saveFolder").onclick = () => this.action(() => this.writeFolder());
    ["PNG", "SVG", "PDF"].forEach(
      (format) =>
        ($("export" + format).onclick = () =>
          this.action(() => this.export(format))),
    );
    this.imageInput = node("input", "");
    this.imageInput.type = "file";
    this.imageInput.accept = "image/*";
    this.imageInput.multiple = true;
    this.imageInput.hidden = true;
    document.body.append(this.imageInput);
    $("addReference").onclick = () => this.imageInput.click();
    this.imageInput.onchange = () => this.action(() => this.loadImages());
    $("classExample").onclick = () =>
      this.action(() => ctx.openProject(ctx.lesson()));
    $("blinkExample").onclick = () =>
      this.action(() =>
        ctx.openProject({
          ...ctx.lesson(),
          arduino:
            "void setup() { pinMode(LED_BUILTIN, OUTPUT); }\nvoid loop() { digitalWrite(LED_BUILTIN, HIGH); delay(1000); digitalWrite(LED_BUILTIN, LOW); delay(500); }",
          p5: { webserial: blankP5 },
          workbench: { name: "HelloLED" },
        }),
      );
    $("firmataExample").onclick = () =>
      this.action(async () => {
        const r = await fetch(basePath("examples/StandardFirmata.ino"));
        if (!r.ok) throw new Error("Firmata example could not load.");
        ctx.openProject({
          ...ctx.lesson(),
          arduino: await r.text(),
          p5: { webserial: blankP5 },
          workbench: { name: "StandardFirmata" },
        });
        ctx.notice(
          "Firmata is a hardware example; its protocol is not modeled by the circuit simulator.",
        );
      });
    $("saveExample").onclick = () => {
      const items = this.examples();
      items.push({
        ...ctx.project(),
        workbench: { ...this.snapshot(), name: this.name + " example" },
      });
      localStorage.setItem(ctx.key + ".examples", JSON.stringify(items));
      this.renderExamples();
    };
    $("exportCode").onchange = () => {
      this.settings.exportCode = $("exportCode").checked;
      ctx.persist();
    };
    $("compilerURL").onchange = () => {
      this.settings.compiler = $("compilerURL").value;
      ctx.persist();
    };
    $("workbenchColor").oninput = () => {
      this.settings.background = $("workbenchColor").value;
      this.applySettings();
      ctx.persist();
    };
    $("outputColor").oninput = () => {
      this.settings.output = $("outputColor").value;
      this.applySettings();
      ctx.persist();
    };
    this.title.contentEditable = true;
    this.title.setAttribute("aria-label", "Project name");
    this.title.onblur = () => {
      this.name = this.title.textContent.trim() || "Untitled";
      ctx.persist();
    };
    document.querySelectorAll(".wb-menu").forEach((d) =>
      d.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") d.open = false;
      }),
    );
    this.renderExamples();
    this.action(async () => {
      const response = await fetch(basePath("examples/index.json"));
      if (!response.ok) return;
      const entries = await response.json();
      for (const entry of entries) {
        if (
          !entry.name ||
          !/^[\w/-]+\.json$/.test(entry.project) ||
          entry.project.includes("..")
        )
          continue;
        const button = node("button", "repository-example");
        button.textContent = entry.name;
        button.onclick = () =>
          this.action(async () => {
            const response = await fetch(basePath(entry.project));
            if (!response.ok) throw new Error("Example could not load.");
            ctx.openProject(await response.json());
          });
        $("exampleLibrary").append(button);
      }
    });
  }
  action(fn) {
    return Promise.resolve()
      .then(fn)
      .catch((e) => this.ctx.notice(e.message));
  }
  tab(name) {
    this.editorPanel.hidden = false;
    this.editorPanel
      .querySelectorAll("[data-pane]")
      .forEach((p) => (p.hidden = p.dataset.pane !== name));
    this.editorPanel
      .querySelectorAll("[data-tab]")
      .forEach((b) =>
        b.setAttribute("aria-selected", String(b.dataset.tab === name)),
      );
  }
  bottomTab(name) {
    this.bottom.classList.remove("collapsed");
    this.bottom
      .querySelectorAll("[data-tool]")
      .forEach((p) => (p.hidden = p.dataset.tool !== name));
    this.bottom
      .querySelectorAll("[data-bottom]")
      .forEach((b) =>
        b.setAttribute("aria-selected", String(b.dataset.bottom === name)),
      );
  }
  addFileBar(pane, kind) {
    const bar = node("div", "file-tabs");
    pane.querySelector(".section-bar").after(bar);
    this[kind + "Bar"] = bar;
    const add = node("button", "", "+");
    add.title = "Add source file";
    add.onclick = () => {
      const name = prompt(
        "Filename",
        kind === "arduino" ? "helper.h" : "drawing.js",
      );
      if (!name) return;
      if (
        !validSourceName(name) ||
        this.files[name] !== undefined ||
        [this.arduinoName, this.p5Name].includes(name)
      )
        return this.ctx.notice(
          "Use a unique .ino, .h, .cpp, .c, or .js filename.",
        );
      this.files[name] = "";
      this.renderFiles();
      this.ctx.persist();
    };
    bar.append(add);
  }
  renderFiles() {
    for (const editor of this.extra.values()) editor.destroy();
    this.extra.clear();
    document.querySelectorAll(".extra-editor").forEach((e) => e.remove());
    for (const kind of ["arduino", "p5"]) {
      const bar = this[kind + "Bar"];
      bar.querySelectorAll("[data-file]").forEach((b) => b.remove());
      const mainName = kind === "arduino" ? this.arduinoName : this.p5Name;
      const names = [
        mainName,
        ...Object.keys(this.files).filter((n) =>
          kind === "p5" ? n.endsWith(".js") : !n.endsWith(".js"),
        ),
      ];
      for (const name of names) {
        const b = node("button", "");
        b.textContent = name;
        b.dataset.file = name;
        b.onclick = () => this.file(kind, name);
        bar.prepend(b);
        if (name !== mainName) {
          const parent = node("div", "extra-editor");
          parent.dataset.file = name;
          parent.hidden = true;
          this[kind + "Pane"].append(parent);
          this.extra.set(
            name,
            createEditor({
              parent,
              value: this.files[name],
              language: kind === "arduino" ? "cpp" : "javascript",
              onChange: (text) => {
                this.files[name] = text;
                this.ctx.persist();
              },
              onRun: () =>
                kind === "p5" ? this.ctx.runP5() : $("compile").click(),
            }),
          );
        }
      }
      this.file(kind, mainName);
    }
  }
  file(kind, name) {
    const pane = this[kind + "Pane"];
    pane.querySelector(
      "#" + (kind === "arduino" ? "arduinoEditor" : "p5Editor"),
    ).hidden = name !== (kind === "arduino" ? this.arduinoName : this.p5Name);
    pane
      .querySelectorAll(".extra-editor")
      .forEach((p) => (p.hidden = p.dataset.file !== name));
    this[kind + "Bar"]
      .querySelectorAll("[data-file]")
      .forEach((b) =>
        b.setAttribute("aria-selected", String(b.dataset.file === name)),
      );
  }
  arduinoFiles() {
    return Object.fromEntries(
      Object.entries(this.files).filter(([n]) => !n.endsWith(".js")),
    );
  }
  p5Source() {
    return (
      Object.entries(this.files)
        .filter(([n]) => n.endsWith(".js"))
        .map(([n, s]) => "// " + n + "\n" + s)
        .join("\n") +
      "\n" +
      this.ctx.p5Editor.state.doc.toString()
    );
  }
  compilerURL() {
    return this.settings.compiler || basePath("api/compile");
  }
  snapshot() {
    return {
      name: this.name,
      files: this.files,
      arduinoName: this.arduinoName,
      p5Name: this.p5Name,
      references: this.references,
      settings: this.settings,
      dock: $("outputDock").value,
    };
  }
  restore(d) {
    this.name = d.name || "Classroom";
    this.title.textContent = this.name;
    this.files = d.files || {};
    this.arduinoName = d.arduinoName || "sketch.ino";
    this.p5Name = d.p5Name || "sketch.js";
    this.references = d.references || [];
    this.settings = d.settings || {};
    this.renderFiles();
    this.applySettings();
    this.renderReferences();
    this.dock(d.dock === "window" ? "split" : d.dock || "split");
  }
  applySettings() {
    $("stage").style.backgroundColor = this.settings.background || "";
    this.outputHome.style.backgroundColor = this.settings.output || "";
    $("workbenchColor").value = this.settings.background || "#484b4d";
    $("outputColor").value = this.settings.output || "#242728";
    $("compilerURL").value = this.settings.compiler || "";
    $("exportCode").checked = this.settings.exportCode !== false;
  }
  selectPart() {
    const part = this.ctx.selected();
    this.ctx.setCode(this.propertyEditor, JSON.stringify(part || {}, null, 2));
    $("propertyTitle").textContent = part?.id || "Selection";
  }
  applyProperties() {
    this.action(() => {
      const next = JSON.parse(this.propertyEditor.state.doc.toString());
      this.ctx.updatePart(next);
      this.ctx.notice("Properties applied.");
    });
  }
  examples() {
    try {
      return JSON.parse(
        localStorage.getItem(this.ctx.key + ".examples") || "[]",
      );
    } catch {
      return [];
    }
  }
  renderExamples() {
    document.querySelectorAll(".saved-example").forEach((e) => e.remove());
    for (const p of this.examples()) {
      const b = node("button", "saved-example");
      b.textContent = p.workbench?.name || "Example";
      b.onclick = () => this.action(() => this.ctx.openProject(p));
      $("exampleLibrary").append(b);
    }
  }
  dock(mode) {
    if (this.pop && !this.pop.closed) {
      this.outputHome.append(this.ctx.bridge.frame);
      this.pop.close();
    }
    this.pop = null;
    this.ctx.bridge.frame.style.cssText = "";
    this.preview.classList.remove("output-overlay");
    this.preview.hidden = mode === "hidden";
    document
      .querySelector(".workspace")
      .classList.toggle("canvas-expanded", mode !== "split");
    if (mode === "overlay") this.preview.classList.add("output-overlay");
    if (mode === "window") {
      const pop = window.open("", "p5comp-output", "width=720,height=560");
      if (!pop) {
        this.ctx.notice("Allow popups to detach p5 output.");
        mode = "split";
        document
          .querySelector(".workspace")
          .classList.remove("canvas-expanded");
      } else {
        this.pop = pop;
        pop.addEventListener("message", this.ctx.bridge.listener);
        pop.document.title = "p5comp — output";
        pop.document.body.style.cssText =
          "margin:0;background:#242728;height:100vh";
        this.ctx.bridge.frame.style.cssText = "width:100%;height:100%;border:0";
        pop.document.body.append(this.ctx.bridge.frame);
        this.ctx.runP5();
        pop.addEventListener("beforeunload", () => {
          pop.removeEventListener("message", this.ctx.bridge.listener);
          this.outputHome.append(this.ctx.bridge.frame);
          $("outputDock").value = "split";
          this.preview.hidden = false;
          document
            .querySelector(".workspace")
            .classList.remove("canvas-expanded");
          this.ctx.runP5();
        });
        this.preview.hidden = true;
      }
    }
    $("outputDock").value = mode;
    this.ctx.canvas.render();
  }
  async writeFolder() {
    if (!window.showDirectoryPicker)
      throw new Error(
        "Folder save needs a browser with File System Access. Use Save project here.",
      );
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    const files = {
      "p5comp.json": JSON.stringify(this.ctx.project(), null, 2),
      "diagram.json": JSON.stringify(this.ctx.project().diagram, null, 2),
      [this.arduinoName]: this.ctx.arduinoEditor.state.doc.toString(),
      [this.p5Name]: this.ctx.p5Editor.state.doc.toString(),
      ...this.files,
    };
    for (const [name, text] of Object.entries(files)) {
      if (name.includes("/") || name.includes(".."))
        throw new Error("Invalid project filename.");
      const h = await dir.getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(text);
      await w.close();
    }
    this.ctx.notice("Project folder saved.");
  }
  async loadImages() {
    for (const f of this.imageInput.files) {
      if (f.size > 4000000)
        throw new Error("Reference images must be under 4 MB.");
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      this.references.push({
        id: crypto.randomUUID(),
        name: f.name,
        src: data,
        x: 0,
        y: 0,
        width: 400,
        opacity: 0.5,
        blend: "normal",
      });
    }
    this.renderReferences();
    this.ctx.persist();
    this.tab("properties");
  }
  renderReferences() {
    document.querySelector("#referenceLayer")?.remove();
    const layer = node("div", "");
    layer.id = "referenceLayer";
    $("world").prepend(layer);
    $("referenceProperties").replaceChildren();
    for (const ref of this.references) {
      const img = node("img", "reference-image");
      img.src = ref.src;
      img.alt = ref.name;
      img.draggable = false;
      img.style.cssText = `left:${ref.x}px;top:${ref.y}px;width:${ref.width}px;opacity:${ref.opacity};mix-blend-mode:${ref.blend}`;
      layer.append(img);
      img.onpointerdown = (e) => {
        e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY, rx: ref.x, ry: ref.y };
        img.setPointerCapture(e.pointerId);
        img.onpointermove = (e) => {
          ref.x =
            start.rx + (e.clientX - start.x) / this.ctx.canvas.camera.zoom;
          ref.y =
            start.ry + (e.clientY - start.y) / this.ctx.canvas.camera.zoom;
          img.style.left = ref.x + "px";
          img.style.top = ref.y + "px";
        };
        img.onpointerup = () => {
          img.onpointermove = null;
          this.ctx.persist();
        };
      };
      const row = node("div", "reference-row");
      const label = node("span", "");
      label.textContent = ref.name;
      row.append(label);
      for (const [prop, type] of [
        ["opacity", "range"],
        ["width", "number"],
      ]) {
        const input = node("input", "");
        input.type = type;
        input.setAttribute("aria-label", ref.name + " " + prop);
        if (type === "range") {
          input.min = 0;
          input.max = 1;
          input.step = 0.01;
        }
        input.value = ref[prop];
        input.oninput = () => {
          ref[prop] = Number(input.value);
          img.style[prop] = prop === "width" ? ref[prop] + "px" : ref[prop];
          this.ctx.persist();
        };
        row.append(input);
      }
      const blend = node(
        "select",
        "",
        "<option>normal</option><option>multiply</option><option>screen</option><option>overlay</option><option>difference</option>",
      );
      blend.value = ref.blend;
      blend.setAttribute("aria-label", ref.name + " blend");
      blend.onchange = () => {
        ref.blend = blend.value;
        img.style.mixBlendMode = ref.blend;
        this.ctx.persist();
      };
      row.append(blend);
      const del = node("button", "", "×");
      del.title = "Remove reference";
      del.onclick = () => {
        this.references = this.references.filter((r) => r !== ref);
        this.renderReferences();
        this.ctx.persist();
      };
      row.append(del);
      $("referenceProperties").append(row);
    }
  }
  async export(format) {
    this.ctx.notice("Preparing export…");
    const sourceFiles = {
      [this.arduinoName]: this.ctx.arduinoEditor.state.doc.toString(),
      [this.p5Name]: this.ctx.p5Editor.state.doc.toString(),
      ...this.files,
    };
    const { svg, width, height } = circuitSVG(
      this.ctx.project().diagram,
      this.references,
      getComputedStyle($("stage")).backgroundColor,
      format !== "PDF" && this.settings.exportCode !== false ? sourceFiles : {},
    );
    if (format === "SVG")
      await download(this.name + ".svg", svg, "image/svg+xml");
    else {
      const png = await svgPNG(svg, width, height);
      if (format === "PNG") await download(this.name + ".png", png);
      else {
        const pdf = new jsPDF();
        pdf.setFontSize(18);
        pdf.text(this.name, 15, 18);
        pdf.addImage(
          png,
          "PNG",
          15,
          26,
          180,
          Math.min(220, (180 * height) / width),
        );
        for (const [name, source] of Object.entries(sourceFiles)) {
          pdf.addPage();
          pdf.setFont("helvetica");
          pdf.setFontSize(14);
          pdf.text(name, 15, 18);
          pdf.setFont("courier");
          pdf.setFontSize(9);
          let yy = 30;
          for (const line of source.split("\n"))
            for (const wrapped of pdf.splitTextToSize(line || " ", 180)) {
              if (yy > 280) {
                pdf.addPage();
                yy = 20;
              }
              pdf.text(wrapped, 15, yy);
              yy += 4.4;
            }
        }
        pdf.save(this.name + ".pdf");
      }
    }
    this.ctx.notice("Export ready.");
  }
}
