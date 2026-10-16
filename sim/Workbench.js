import foundationGuide from "../docs/electronics-foundations.md?raw";
import diyGuide from "../docs/diy-elements.md?raw";
import {releaseReferenceStream} from "./selectionDeletion.js";
import { installSceneMedia, decorateMedia } from "./sceneMedia.js";
import { installSketchLibraries } from "./SketchLibrary.js";
import { installColorFields } from "./ColorPicker.js";
import { initializeIconSystem } from "./uiIcons.js";
import { setComponentPresets } from "./elements.js";
import { isBreadboard, BREADBOARD_COLOR } from "./breadboard.js";
import { lessonHTML } from "./lessonContent.js";
import { resistance } from "./passiveStates.js";
import { isMomentarySwitch } from "./circuit.js";
import { projectArchive } from "./projectArchive.js";
import { glyphSelect } from "./GlyphSelect.js";
import {
  editorPreferences,
  setEditorPreferences,
} from "../shared/editor/editorPreferences.js";
import { ProjectionWindows } from "./ProjectionWindows.js";
import { createEditor } from "../shared/editor/createEditor.js";
import { circuitSVG, svgPNG } from "./exportCircuit.js";
import { jsPDF } from "jspdf";
import { basePath } from "../shared/basePath.js";
import {
  defaultP5HTML,
  blankArduino,
  blankP5,
  validSourceName,
  projectFromFolder,
  assetDataURL,
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
    this.components = [];
    this.settings = {};
    this.name = "Classroom";
    document.body.classList.add("unified");
    document.querySelector(".section-nav").remove();
    const legacy = document.querySelector(".app-menu");
    legacy.remove();
    const toolbar = document.querySelector(".bar");
    const fileMenu = node(
      "details",
      "wb-menu",
      '<summary>File</summary><div><button id="newProject">New project</button><button id="saveProject">Save project…</button><button id="saveZIP">Download project ZIP</button><button id="openProject">Open project…</button><button id="openFolder">Open folder…</button><button id="saveFolder">Save to folder…</button><hr><button id="addReference">Add image / video…</button><button id="addLessonNote">Add note…</button><button id="componentLibrary">Component editor…</button><button id="exportPNG">Export PNG</button><button id="exportSVG">Export SVG</button><button id="exportPDF">Export PDF with code</button></div>',
    );
    toolbar.querySelector(".brand").after(fileMenu);
    ["save", "open", "lesson"].forEach((id) => ($(id).hidden = true));
    this.title = node("span", "project-name");
    fileMenu.after(this.title);
    const examples = node(
      "details",
      "wb-menu",
      '<summary>Examples</summary><div id="exampleLibrary"><details class="example-folder" data-folder="Reference"><summary aria-label="Reference examples"><span class="example-folder-mark">▸</span>Reference</summary><section><button id="classExample">Distance / pot / buttons</button><button id="blinkExample">Built-in LED (legacy)</button><button id="firmataExample">StandardFirmata</button></section></details><hr><button id="saveExample">Save current as example</button></div>',
    );
    this.title.after(examples);
    const viewMenu = node(
      "details",
      "wb-menu",
      '<summary>View</summary><div><button id="viewTabs" data-layout="tabs">Tabs</button><button id="viewHorizontal" data-layout="horizontal">Horizontal split</button><button id="viewVertical" data-layout="vertical">Vertical split</button><hr><button data-dock="overlay">p5 overlay</button><button id="mirrorP5">p5 projection window</button><button id="mirrorCircuit">Circuit projection window</button><button data-dock="hidden">Hide p5 output</button><button id="showInspector">Show inspector</button></div>',
    );
    examples.after(viewMenu);
    this.viewMenu = viewMenu;
    viewMenu.querySelectorAll("[data-layout]").forEach((button) => {
      button.onclick = () => {
        this.mainView(this.activeView, button.dataset.layout);
        ctx.persist();
      };
    });
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
    $("themeToggle").hidden = true;
    settingsMenu
      .querySelector("div")
      .prepend(
        node(
          "label",
          "",
          'Theme <button id="appThemeButton" type="button" aria-label="Toggle theme"></button><select hidden id="appTheme" aria-label="Theme"><option value="light">Light</option><option value="dark">Dark</option></select>',
        ),
      );
    settingsMenu
      .querySelector("div")
      .append(
        node(
          "label",
          "",
          'Editor theme <select id="editorTheme" aria-label="Editor theme"><option value="subdued">Follow theme</option><option value="subdued-light">Subdued light</option><option value="subdued-dark">Subdued dark</option><option value="github-light">GitHub light</option><option value="github-dark">GitHub dark</option></select>',
        ),
        node(
          "label",
          "",
          'Font size <input id="editorFontSize" type="number" min="8" max="32" aria-label="Editor font size">',
        ),
        node(
          "label",
          "",
          'Word wrap (Alt+Z) <input id="editorWordWrap" type="checkbox" aria-label="Editor word wrap">',
        ),
        node(
          "label",
          "",
          'Icon size <input id="uiIconSize" type="number" min="12" max="28" step="1" aria-label="Interface icon size">',
        ),
      );
    const refreshRow = node(
      "label",
      "",
      `PWM / simulation refresh <input id="pwmRefreshHz" aria-label="PWM refresh rate (Hz)" type="number" min="10" max="120" step="10"> Hz`,
    );
    $("globalSettings").append(refreshRow);
    $("pwmRefreshHz").value =
      Number(localStorage.getItem("p5comp.pwmRefreshHz")) || 60;
    $("pwmRefreshHz").title =
      "Visual updates per second (10–120 Hz). PWM LEDs show averaged duty-cycle brightness.";
    $("pwmRefreshHz").onchange = () => {
      const hz = Math.max(
        10,
        Math.min(120, Number($("pwmRefreshHz").value) || 60),
      );
      $("pwmRefreshHz").value = hz;
      localStorage.setItem("p5comp.pwmRefreshHz", hz);
      document.dispatchEvent(
        new CustomEvent("p5comp:pwm-refresh", { detail: hz }),
      );
    };
    const setIconSize = (value, persist = false) => {
      const size = Math.max(12, Math.min(28, Number(value) || 18));
      document.documentElement.style.setProperty("--ui-icon-size", size + "px");
      $("uiIconSize").value = size;
      if (persist) {
        try {
          localStorage.setItem("p5comp.iconSize", String(size));
        } catch {}
      }
    };
    let savedIconSize = 18;
    try {
      savedIconSize = localStorage.getItem("p5comp.iconSize") || 18;
    } catch {}
    setIconSize(savedIconSize);
    $("uiIconSize").oninput = () => {
      const size = Number($("uiIconSize").value);
      if (size >= 12 && size <= 28) setIconSize(size, true);
    };
    $("uiIconSize").onchange = () => setIconSize($("uiIconSize").value, true);
    const syncPreferences = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      $("appTheme").value = dark ? "dark" : "light";
      $("appThemeButton").textContent = dark ? "☾" : "☼";
      $("appThemeButton").title =
        `Theme: ${dark ? "Dark" : "Light"} · click to toggle`;
      $("appThemeButton").setAttribute(
        "aria-label",
        `Switch to ${dark ? "light" : "dark"} theme`,
      );
      $("editorTheme").value = editorPreferences().theme;
      $("editorFontSize").value = editorPreferences().fontSize;
      $("editorWordWrap").checked = Boolean(editorPreferences().wordWrap);
      document.dispatchEvent(new Event("p5comp:refresh-selects"));
    };
    $("appThemeButton").onclick = () => $("themeToggle").click();
    $("appTheme").onchange = () => {
      if ($("appTheme").value !== document.documentElement.dataset.theme)
        $("themeToggle").click();
      syncPreferences();
    };
    $("editorTheme").onchange = () =>
      setEditorPreferences({ theme: $("editorTheme").value });
    $("editorWordWrap").onchange = () =>
      setEditorPreferences({ wordWrap: $("editorWordWrap").checked });
    $("editorFontSize").onchange = () =>
      setEditorPreferences({ fontSize: $("editorFontSize").value });
    document.addEventListener("p5comp:editor-settings", syncPreferences);
    document.addEventListener("physical-p5:themechange", syncPreferences);
    syncPreferences();
    document.addEventListener("p5comp:editor-error", (e) =>
      ctx.notice(e.detail),
    );
    const main = document.querySelector("main");
    this.editorPanel = node(
      "aside",
      "wb-right",
      '<nav class="wb-tabs" role="tablist" aria-label="Inspector"><button role="tab" data-tab="arduino" title="Arduino code" aria-label="Arduino code">∞</button><button role="tab" data-tab="p5" title="p5.js code" aria-label="p5.js code">p5</button><button role="tab" data-tab="properties" title="Properties" aria-label="Properties">☷</button><button role="tab" data-tab="help" title="Help" aria-label="Help">?</button><button role="tab" data-tab="settings" title="Settings" aria-label="Settings">⚙</button><button id="closeInspector" title="Hide inspector">×</button></nav><section data-pane="arduino"></section><section data-pane="p5"></section><section data-pane="properties"><div class="section-bar"><span id="propertyTitle">Selection</span><button id="applyProperties" title="Apply properties (⌘/Ctrl Enter)" aria-label="Apply properties">▷</button></div><div id="partAttributes"></div><output id="partState"></output><div id="propertyEditor"></div><div id="referenceProperties"></div></section><section data-pane="help"><div id="helpHome"><p>Select an element and press ? for documentation.</p><p>⌘/Ctrl Enter: run · Shift-click wire: bend · Space-drag: pan</p></div></section>',
    );
    const editors = document.querySelectorAll("#code .editors > section");
    this.editorPanel.querySelector('[data-pane="arduino"]').append(editors[0]);
    this.editorPanel.querySelector('[data-pane="p5"]').append(editors[1]);
    this.editorPanel
      .querySelector('[data-pane="help"]')
      .append(document.querySelector(".part-docs"));
    const guide = node("details", "diy-guide");
    guide.innerHTML = '<summary>Make your own element</summary>';
    const guideBody = node("div", "lesson-note");
    guideBody.innerHTML = lessonHTML(diyGuide, "markdown");
    const openPresets=node("button", "", "Open component preset editor");
    openPresets.type="button";
    openPresets.onclick=()=>this.editComponents();
    guide.append(openPresets,guideBody);
    const electronicsGuide=node("details","diy-guide");
    electronicsGuide.innerHTML='<summary>Electronics foundations and audio</summary>';
    const electronicsBody=node("div","lesson-note");
    electronicsBody.innerHTML=lessonHTML(foundationGuide,"markdown");
    electronicsGuide.append(electronicsBody);
    this.editorPanel.querySelector("#helpHome").append(guide,electronicsGuide);
    $("code").hidden = true;
    main.append(this.editorPanel);
    const settingsButton = this.editorPanel.querySelector(
      '[data-tab="settings"]',
    );
    settingsButton.id = "settingsPanelToggle";
    settingsButton.removeAttribute("role");
    settingsButton.removeAttribute("data-tab");
    settingsButton.setAttribute("aria-pressed", "false");
    settingsButton.onclick = () => {
      if (
        !this.editorPanel.hidden &&
        !this.editorPanel.querySelector('[data-pane="settings"]').hidden
      ) {
        this.editorPanel.hidden = true;
        settingsButton.setAttribute("aria-pressed", "false");
      } else this.tab("settings");
    };
    $("hideUI").before(settingsButton);
    const settingsPane = node("section", "settings-pane");
    settingsPane.dataset.pane = "settings";
    settingsPane.append($("globalSettings"));
    this.editorPanel.append(settingsPane);
    settingsMenu.remove();
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
    const noteProperties = node("section", "note-properties");
    noteProperties.id = "noteProperties";
    noteProperties.hidden = true;
    noteProperties.innerHTML =
      '<div class="note-source-tools"><input id="noteName" aria-label="Note name"><select id="noteFormat" aria-label="Note format" data-native><option value="markdown">Markdown</option><option value="html">HTML</option><option value="latex">LaTeX / KaTeX</option></select></div><div id="noteAppearance" class="note-appearance"></div><div id="noteSourceEditor"></div>';
    $("propertyEditor").after(noteProperties);
    installColorFields();
    this.noteEditor = createEditor({
      parent: $("noteSourceEditor"),
      value: "",
      language: "markdown",
      lineWrapping: true,
      onChange: () => {
        if (!this.loadingNote) this.applyNote();
      },
      onRun: () => this.applyNote(),
    });
    this.noteEditor.contentDOM.setAttribute("aria-label", "Note source");
    $("noteName").oninput = () => this.applyNote();
    $("noteFormat").onchange = () => {
      this.noteEditor.setLanguage($("noteFormat").value);
      this.applyNote();
    };
    this.arduinoPane = this.editorPanel.querySelector(
      '[data-pane="arduino"] > section',
    );
    this.p5Pane = this.editorPanel.querySelector('[data-pane="p5"] > section');
    this.addFileBar(this.arduinoPane, "arduino");
    this.addFileBar(this.p5Pane, "p5");
    for (const kind of ["arduino", "p5"]) {
      const bar = node("button", "editor-status");
      bar.id = kind + "EditorStatus";
      bar.setAttribute("aria-label", kind + " editor status: open console");
      bar.title = "Open console";
      bar.onclick = () => this.bottomTab("console");
      this[kind + "Pane"].append(bar);
      this.editorStatus(kind, "Ready");
    }
    this.editorPanel
      .querySelectorAll("[data-tab]")
      .forEach((b) => (b.onclick = () => this.tab(b.dataset.tab)));
    $("closeInspector").onclick = () => {
      this.editorPanel.hidden = true;
      settingsButton.setAttribute("aria-pressed", "false");
    };
    $("toggleCode").onclick = () => {
      this.editorPanel.hidden = !this.editorPanel.hidden;
      this.ctx.canvas.render();
    };
    $("applyProperties").onclick = () => this.applyProperties();
    this.tab("arduino");
    this.bottom = node(
      "section",
      "wb-bottom",
      '<nav class="wb-tabs" role="tablist" aria-label="Tools"><button role="tab" data-bottom="simulation">Simulation</button><button role="tab" data-bottom="serial">Serial</button><button role="tab" data-bottom="console">Console</button><button id="collapseBottom" title="Collapse tools">⌄</button></nav><div data-tool="simulation"></div><div data-tool="serial"></div><div data-tool="console"><pre id="buildConsole"></pre><pre id="p5Console"></pre></div>',
    );
    main.append(this.bottom);
    this.bottom.querySelector('[data-tool="simulation"]').append($("controls"));
    const statusLine = document.querySelector(".section-foot");
    statusLine.prepend($("status"));
    this.bottom.append(statusLine);
    const transport = node("div", "arduino-transport");
    transport.append(document.querySelector("footer > div"));
    const arduinoTools = this.arduinoPane.querySelector(".section-bar");
    for (const child of [...arduinoTools.childNodes])
      if (child.nodeType === Node.TEXT_NODE) child.remove();
    arduinoTools.append(transport);
    $("arduinoEditorStatus").replaceChildren($("firmwareState"));
    $("usb").title = "Connect USB Arduino";
    $("usb").setAttribute("aria-label", "Connect USB Arduino");
    $("upload").hidden = true;
    const uploadCode = node("button", "", "⇧");
    uploadCode.id = "compileUpload";
    uploadCode.disabled = true;
    uploadCode.title = "Compile + upload (⌘/Ctrl Shift Enter)";
    uploadCode.setAttribute("aria-label", "Compile and upload");
    transport.prepend(uploadCode);
    uploadCode.onclick = () =>
      this.action(async () => {
        this.bottomTab("console");
        await ctx.upload();
        ctx.persist();
      });
    $("compile").title = "Compile and run";
    $("compile").setAttribute("aria-label", "Compile and run");
    $("compile").onclick = () =>
      this.arduinoRunning ? ctx.stop() : ctx.runArduino();
    const p5Tools = this.p5Pane.querySelector(".section-bar");
    for (const child of [...p5Tools.childNodes])
      if (child.nodeType === Node.TEXT_NODE) child.remove();
    $("apiLabel").hidden = true;
    const comms = $("comms");
    const previousComms = comms.value;
    comms.innerHTML =
      '<option value="none">None</option><option value="webserial">p5.webserial</option><option value="native">navigator.serial</option><option value="firmata">Firmata (StandardFirmata required)</option>';
    comms.value = previousComms;
    comms.setAttribute("aria-label", "Arduino ↔ p5 communications");
    comms.dataset.glyph = "↔";
    comms.dataset.showState = "true";
    p5Tools.prepend(comms);
    const run = node(
      "button",
      "",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8Z"/></svg>',
    );
    run.title = "Run p5 (⌘/Ctrl Enter)";
    run.setAttribute("aria-label", "Run p5 sketch");
    run.id = "p5EditorRun";
    this.p5RunButton = run;
    run.onclick = () => {
      if (this.p5Running) {
        document.dispatchEvent(new CustomEvent("p5comp:human-p5-stop"));
        ctx.bridge.stop();
        this.disableAutorun();
      } else ctx.runP5();
    };
    p5Tools.append(run);
    p5Tools.prepend(run, comms);
    $("loadExample").hidden = true;
    const auto = node(
      "button",
      "autorun",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a8 8 0 0 1 14-2l2 2M20 3v5h-5M20 16a8 8 0 0 1-14 2l-2-2M4 21v-5h5"/></svg>',
    );
    p5Tools.append(auto);
    installSketchLibraries(this);
    this.syncTransport(false);
    auto.id = "p5Autorun";
    auto.title = "Auto-run p5 after edits";
    auto.setAttribute("aria-label", "Auto-run p5 after edits");
    auto.setAttribute("aria-pressed", "false");
    auto.onclick = () => {
      this.autorun = !this.autorun;
      auto.setAttribute("aria-pressed", String(this.autorun));
      if (!this.autorun) clearTimeout(this.autoTimer);
    };
    for (const kind of ["arduino", "p5"]) {
      const tidy = node(
        "button",
        "",
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/></svg>',
      );
      tidy.title = "Tidy code (⌘/Ctrl Shift F)";
      tidy.setAttribute("aria-label", "Tidy " + kind + " code");
      tidy.onclick = () => {
        const selected = this[kind + "Bar"].querySelector(
          '[aria-selected="true"]',
        )?.dataset.file;
        (this.extra.get(selected) || ctx[kind + "Editor"]).tidy();
      };
      this[kind + "Pane"].querySelector(".section-bar").append(tidy);
    }
    const assets = node(
      "button",
      "",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4ZM4 16l5-5 4 4 3-3 4 4M15 8h.01"/></svg>',
    );
    assets.title = "Libraries, assets and project storage";
    assets.setAttribute("aria-label", "Project assets");
    assets.onclick = () => {
      this.assetPanel.hidden = !this.assetPanel.hidden;
      this.renderAssets();
    };
    p5Tools.append(assets);
    this.assetPanel = node("div", "asset-panel");
    this.assetPanel.hidden = true;
    this.p5Pane.append(this.assetPanel);
    this.assetInput = node("input", "");
    this.assetInput.type = "file";
    this.assetInput.multiple = true;
    this.assetInput.hidden = true;
    document.body.append(this.assetInput);
    this.assetInput.onchange = () =>
      this.action(async () => {
        for (const file of this.assetInput.files) {
          if (file.size > 4000000)
            throw new Error("Assets must be under 4 MB.");
          this.assets[file.name] = {
            src: await assetDataURL(file),
            type: file.type,
            size: file.size,
          };
        }
        ctx.persist();
        this.renderAssets();
        this.scheduleP5();
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
      '<option value="split">Split</option><option value="overlay">Overlay</option><option value="window">Mirror window</option><option value="hidden">Hidden</option>',
    );
    outputMode.id = "outputDock";
    outputMode.hidden = true; // Main layout selector owns split/tab layout; overlays remain in View.
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
    this.projections = new ProjectionWindows(ctx, () => this.references);
    $("mirrorP5").onclick = () => this.projections.open("p5");
    $("mirrorCircuit").onclick = () => this.projections.open("circuit");
    const mainViews = node(
      "div",
      "main-view-tools",
      '<nav class="wb-tabs" role="tablist" aria-label="Main views"><button role="tab" data-main-view="circuit" title="Circuit" aria-label="Circuit"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="14" rx="1"/><path d="M8 1v4m4-4v4m4-4v4M8 19v4m4-4v4m4-4v4M1 8h4m-4 4h4m-4 4h4m14-8h4m-4 4h4m-4 4h4"/></svg></button><button role="tab" data-main-view="p5" title="p5 render" aria-label="p5 render">p5</button></nav><select id="mainLayout" aria-label="Main layout"><option value="tabs">Tabs</option><option value="horizontal">Horizontal split</option><option value="vertical">Vertical split</option></select><button id="projectCircuit" title="Mirror circuit to projection window" aria-label="Circuit projection window">↗</button><button id="projectP5" title="Mirror p5 to projection window" aria-label="p5 projection window">↗</button>',
    );
    // Main view navigation shares the global toolbar; the canvas keeps the full height.
    const layoutSelect = mainViews.querySelector("#mainLayout");
    layoutSelect.hidden = true;
    viewMenu.querySelector("div").append(layoutSelect);
    viewMenu.before(mainViews);
    mainViews.querySelectorAll("[data-main-view]").forEach(
      (b) =>
        (b.onclick = () => {
          this.mainView(b.dataset.mainView);
          ctx.persist();
        }),
    );
    $("mainLayout").onchange = () => {
      this.mainView(this.activeView, $("mainLayout").value);
      ctx.persist();
    };
    const circuitPopup = $("projectCircuit");
    const p5Popup = $("projectP5");
    $("expandCanvas").replaceWith(circuitPopup);
    $("runP5").replaceWith(p5Popup);
    circuitPopup.onclick = () => this.projections.open("circuit");
    p5Popup.onclick = () => this.projections.open("p5");
    const workspace = document.querySelector(".workspace");
    const divider = node("div", "view-divider");
    divider.setAttribute("role", "separator");
    divider.setAttribute("tabindex", "0");
    divider.setAttribute("aria-label", "Resize circuit and p5 panels");
    divider.title = "Drag to resize · double-click to reset";
    workspace.append(divider);
    const setSplit = (ratio) => {
      this.splitRatio = Math.max(0.15, Math.min(0.85, ratio));
      workspace.style.setProperty("--view-first", this.splitRatio + "fr");
      workspace.style.setProperty("--view-second", 1 - this.splitRatio + "fr");
      workspace.style.setProperty("--view-ratio", this.splitRatio);
      divider.setAttribute("aria-valuenow", Math.round(this.splitRatio * 100));
      ctx.canvas.render();
    };
    this.setSplit = setSplit;
    setSplit(0.5);
    divider.onpointerdown = (event) => {
      event.preventDefault();
      divider.setPointerCapture(event.pointerId);
      divider.onpointermove = (e) => {
        const rect = workspace.getBoundingClientRect();
        const top = 0;
        setSplit(
          this.layout === "vertical"
            ? (e.clientY - rect.top - top) / (rect.height - top)
            : (e.clientX - rect.left) / rect.width,
        );
      };
      divider.onpointerup = divider.onpointercancel = () => {
        divider.onpointermove = null;
        ctx.persist();
      };
    };
    divider.ondblclick = () => {
      setSplit(0.5);
      ctx.persist();
    };
    divider.onkeydown = (e) => {
      const direction = {
        ArrowLeft: -1,
        ArrowUp: -1,
        ArrowRight: 1,
        ArrowDown: 1,
      }[e.key];
      if (!direction) return;
      e.preventDefault();
      setSplit(this.splitRatio + direction * 0.02);
      ctx.persist();
    };
    ctx.bridge.addEventListener("console", (e) => {
      if (["error", "warn"].includes(e.detail.level))
        this.editorStatus(
          "p5",
          e.detail.values.join(" "),
          e.detail.level === "warn" ? "warning" : "error",
        );
      const p = $("p5Console");
      p.textContent +=
        e.detail.values
          .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
          .join(" ") + "\n";
      p.textContent = p.textContent.slice(-20000);
    });
    ctx.bridge.addEventListener("status", (e) => {
      this.editorStatus("p5", e.detail);
      this.p5Running = /p5 running/.test(
        e.detail,
      );
      this.syncTransport();
    });
    ctx.bridge.addEventListener("runtimeError", (e) => {
      this.p5Running=false;
      this.syncTransport();
      this.editorStatus("p5", e.detail.message, "error");
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
    $("saveZIP").onclick = () =>
      this.action(async () => {
        const libraries = {};
        for (const [file, url] of [
          ["p5.js", "libraries/p5.min.js"],
          ["p5.webserial.js", "libraries/p5.webserial.js"],
          ["LICENSE-p5.txt", "licenses/p5-LGPL.txt"],
          ["LICENSE-p5-webserial.txt", "licenses/LGPL-2.1.txt"],
        ]) {
          const response = await fetch(basePath(url));
          if (!response.ok)
            throw new Error("Bundled library could not load for ZIP.");
          libraries[file] = await response.text();
        }
        const project = structuredClone(ctx.project());
        const html = project.workbench.files["index.html"];
        if (html && !/src=["'](?:\.\/)?p5\.webserial\.js/.test(html))
          project.workbench.files["index.html"] = html.replace(
            /<\/head>/i,
            '  <script src="p5.webserial.js"></script>\n  </head>',
          );
        await download(
          this.name + ".zip",
          projectArchive(project, libraries),
          "application/zip",
        );
      });
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
    this.imageInput.accept = "image/*,video/*";
    this.imageInput.multiple = true;
    this.imageInput.hidden = true;
    document.body.append(this.imageInput);
    $("addReference").onclick = () => this.imageInput.click();
    installSceneMedia(this);
    $("addLessonNote").onclick = () => this.editLessonNote();
    $("componentLibrary").onclick = () => this.editComponents();
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
          api: "firmata",
          p5: { firmata: ctx.commsExample("firmata") },
          workbench: { name: "StandardFirmata" },
        });
        ctx.notice(
          "Run to compile StandardFirmata and simulate A0, or upload it to your Arduino.",
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
    const rowGlyphs = {
      viewTabs: "▣",
      viewHorizontal: "◫",
      viewVertical: "⬒",
      newProject: "+",
      saveProject: "↓",
      saveZIP: "⇩",
      openProject: "▱",
      openFolder: "▰",
      saveFolder: "⇩",
      addReference: "▧",
      exportPNG: "▧",
      exportSVG: "◇",
      exportPDF: "▤",
      classExample: "⌁",
      blinkExample: "☼",
      firmataExample: "∞",
      saveExample: "+",
      mirrorP5: "↗",
      mirrorCircuit: "↗",
      showInspector: "☷",
    };
    for (const button of toolbar.querySelectorAll(".wb-menu button")) {
      if (button.closest(".glyph-select") || button.id === "appThemeButton")
        continue;
      const label = button.textContent.trim();
      button.setAttribute("aria-label", label);
      const icon = node("span", "menu-row-glyph", rowGlyphs[button.id] || "◫");
      icon.setAttribute("aria-hidden", "true");
      button.prepend(icon);
    }
    const menus = [...toolbar.querySelectorAll(".wb-menu,.app-menu")];
    menus.forEach((d) => {
      d.addEventListener("click", (e) => {
        if (
          e.target.tagName === "BUTTON" &&
          !e
            .composedPath()
            .some((node) => node.classList?.contains("glyph-select"))
        )
          d.open = false;
      });
      d.addEventListener("toggle", () => {
        if (!d.open) return;
        menus
          .filter((other) => other !== d)
          .forEach((other) => (other.open = false));
        const panel = d.querySelector("div,nav");
        const left = d.querySelector("summary").getBoundingClientRect().left;
        panel.style.left =
          Math.max(8, Math.min(left, innerWidth - panel.offsetWidth - 8)) +
          "px";
      });
    });
    document.addEventListener("pointerdown", (e) => {
      menus
        .filter((d) => !d.contains(e.target))
        .forEach((d) => (d.open = false));
    });
    const brand = toolbar.querySelector(".brand");
    brand.innerHTML = `<svg class="brand-glyph" viewBox="0 0 32 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 4 3 12l5 8M24 4l5 8-5 8M12 10h8M16 6v8M12 18h8"/>
    </svg>`;
    brand.href = basePath() + location.search;
    brand.setAttribute("aria-label", "p5comp");
    brand.title = "p5comp";
    const menuGlyphs = {
      File: "▱",
      Examples: "▦",
      Settings: "⚙",
      View: "◫",
      Reference: "⋯",
    };
    toolbar.querySelectorAll("summary").forEach((summary) => {
      if (summary.closest(".example-folder")) return;
      const caption = summary.textContent.trim();
      if (!menuGlyphs[caption]) return;
      summary.dataset.caption = caption;
      summary.textContent = menuGlyphs[caption];
      summary.title = caption;
      summary.setAttribute("aria-label", caption);
    });
    document
      .querySelectorAll("select:not([hidden]):not([data-native])")
      .forEach(glyphSelect);
    initializeIconSystem();
    const circuitSettings = document.querySelector(".canvas-settings");
    circuitSettings.addEventListener("toggle", () => {
      if (!circuitSettings.open) return;
      const box = circuitSettings
          .querySelector("summary")
          .getBoundingClientRect(),
        panel = circuitSettings.querySelector("div");
      panel.style.top = box.bottom + 5 + "px";
      panel.style.right = "auto";
      panel.style.left =
        Math.max(
          8,
          Math.min(
            box.right - panel.offsetWidth,
            innerWidth - panel.offsetWidth - 8,
          ),
        ) + "px";
    });
    this.renderExamples();
    this.action(async () => {
      const response = await fetch(basePath("examples/index.json"));
      if (!response.ok) return;
      const entries = await response.json();
      const order = ["Getting started", "Inputs", "Outputs", "Boards"];
      entries.sort(
        (a, b) =>
          (order.indexOf(a.folder) < 0 ? 99 : order.indexOf(a.folder)) -
          (order.indexOf(b.folder) < 0 ? 99 : order.indexOf(b.folder)),
      );
      for (const entry of entries) {
        if (
          !entry.name ||
          !/^[\w/-]+\.json$/.test(entry.project) ||
          entry.project.includes("..")
        )
          continue;
        const button = node("button", "repository-example");
        button.textContent = "▦  " + entry.name;
        button.onclick = () =>
          this.action(async () => {
            const response = await fetch(basePath(entry.project));
            if (!response.ok) throw new Error("Example could not load.");
            ctx.openProject(await response.json());
          });
        this.exampleFolder(entry.folder || "Other").append(button);
      }
    });
  }
  action(fn) {
    return Promise.resolve()
      .then(fn)
      .catch((e) => {
        this.buildLog(e.message);
        this.ctx.notice(e.message);
      });
  }
  tab(name) {
    this.editorPanel.hidden = false;
    $("settingsPanelToggle")?.setAttribute(
      "aria-pressed",
      String(name === "settings"),
    );
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
          "Use a unique .ino, .h, .cpp, .c, .js, .html or .css filename.",
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
          kind === "p5"
            ? /\.(js|html|css)$/.test(n)
            : /\.(ino|h|hpp|cpp|c)$/.test(n),
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
              language:
                kind === "arduino"
                  ? "cpp"
                  : name.endsWith(".html")
                    ? "html"
                    : name.endsWith(".css")
                      ? "css"
                      : "javascript",
              onChange: (text) => {
                this.files[name] = text;
                this.ctx.persist();
                if (kind === "p5") this.scheduleP5();
              },
              onRun: () =>
                kind === "p5" ? this.ctx.runP5() : this.ctx.runArduino(),
              onUpload: () => kind === "arduino" && $("compileUpload").click(),
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
      Object.entries(this.files).filter(([n]) =>
        /\.(ino|h|hpp|cpp|c)$/.test(n),
      ),
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
  syncCommsLibrary(api) {
    const html = this.files["index.html"] || "";
    if (api === "webserial" && !/p5\.webserial(?:\.min)?\.js/.test(html))
      this.files["index.html"] = html.includes("</head>")
        ? html.replace(
            "</head>",
            '  <script src="p5.webserial.js"></script>\n  </head>',
          )
        : '<script src="p5.webserial.js"></script>\n' + html;
    const editor = this.extra.get("index.html");
    if (editor) this.ctx.setCode(editor, this.files["index.html"]);
  }
  p5Project() {
    return {
      html: this.files["index.html"],
      css: Object.entries(this.files)
        .filter(([n]) => n.endsWith(".css"))
        .map(([, s]) => s)
        .join("\n"),
      assets: this.assets,
      mainName: this.p5Name,
      sourceNames: [
        this.p5Name,
        ...Object.keys(this.files).filter((n) => n.endsWith(".js")),
      ],
    };
  }
  scheduleP5() {
    clearTimeout(this.autoTimer);
    if (this.autorun) this.autoTimer = setTimeout(() => this.ctx.runP5(), 500);
  }
  disableAutorun() {
    this.autorun = false;
    clearTimeout(this.autoTimer);
    if ($("p5Autorun")) $("p5Autorun").setAttribute("aria-pressed", "false");
  }
  uploadState(connected) {
    if ($("compileUpload")) $("compileUpload").disabled = false;
  }
  syncTransport(arduinoRunning = this.arduinoRunning || false) {
    this.arduinoRunning = arduinoRunning;
    for(const [kind,on] of [["circuit",arduinoRunning],["p5",!!this.p5Running]]) {
      const button=this.editorPanel?.ownerDocument.querySelector(`[data-main-view="${kind}"]`);
      if(button){button.dataset.running=String(on);button.title=(kind==="circuit"?"Circuit":"p5 render")+(on?" · running":" · stopped");}
    }
    for (const [button, on, label] of [
      [$("compile"), arduinoRunning, "Arduino"],
      [this.p5RunButton, !!this.p5Running, "p5"],
    ]) {
      if (!button) continue;
      button.setAttribute("aria-pressed", String(on));
      button.dataset.running = String(on);
      button.title = on ? `Stop ${label}` : `Run ${label}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = on
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8Z"/></svg>';
    }
  }
  editorStatus(kind, message, level = "info") {
    const bar = $(kind + "EditorStatus");
    if (!bar) return;
    if (
      level === "info" &&
      bar.dataset.level === "warning" &&
      /Running|Uploaded/.test(message)
    )
      return;
    if (/Compiling|Loading|Starting/.test(message)) {
      const tab = this.bottom?.querySelector('[data-bottom="console"]');
      if (tab) {
        delete tab.dataset.level;
        tab.title = "Console";
      }
    }
    bar.dataset.level = level;
    bar.title = message + " · Open console";
    if (kind === "arduino" && $("firmwareState"))
      $("firmwareState").textContent = message;
    else bar.textContent = message;
    if (level !== "info") {
      const tab = this.bottom?.querySelector('[data-bottom="console"]');
      if (tab) {
        tab.dataset.level = level;
        tab.title = "Console · " + level;
      }
    }
  }
  buildLog(line) {
    const console = $("buildConsole");
    if (console)
      console.textContent = (console.textContent + line + "\n").slice(-20000);
  }
  renderAssets() {
    this.assetPanel.replaceChildren();
    const heading = node("strong", "", "Libraries & assets");
    this.assetPanel.append(heading);
    const parsed = new DOMParser().parseFromString(
      this.files["index.html"] || "",
      "text/html",
    );
    for (const element of parsed.querySelectorAll("script[src],link[href]")) {
      const row = node("div", "");
      row.textContent =
        element.getAttribute("src") || element.getAttribute("href");
      this.assetPanel.append(row);
    }
    for (const [name, asset] of Object.entries(this.assets || {})) {
      const row = node("div", "asset-row");
      const label = node("span", "");
      label.textContent =
        name + " · " + (asset.type || "file") + " · " + asset.size + " B";
      row.append(label);
      if (/^(image|video)\//.test(asset.type || "")) {
        row.draggable = true;
        row.title = "Drag asset onto circuit canvas";
        row.ondragstart = (e) => {
          e.dataTransfer.setData("application/x-p5comp-asset", name);
          e.dataTransfer.effectAllowed = "copy";
        };
        const place = node("button", "", "↗");
        place.title = "Add asset to canvas";
        place.onclick = () => {
          const bounds = $("stage").getBoundingClientRect(),
            p = this.ctx.canvas.toWorld({
              clientX: bounds.left + 80,
              clientY: bounds.top + 80,
            });
          this.references.push({
            id: crypto.randomUUID(),
            kind: asset.type.startsWith("video/") ? "video" : "image",
            name,
            src: asset.src,
            x: p.x,
            y: p.y,
            width: 320,
            opacity: 1,
            blend: "normal",
            showLabel: false,
          });
          this.renderReferences();
          this.ctx.persist();
        };
        row.append(place);
      }
      if (asset.type?.startsWith("image/")) {
        const image = node("img", "");
        image.src = asset.src;
        image.alt = name;
        row.prepend(image);
      }
      const remove = node("button", "", "×");
      remove.title = "Remove " + name;
      remove.onclick = () => {
        delete this.assets[name];
        this.ctx.persist();
        this.renderAssets();
      };
      row.append(remove);
      this.assetPanel.append(row);
    }
    const add = node("button", "", "+ Import assets");
    add.onclick = () => this.assetInput.click();
    this.assetPanel.append(add);
    const storage = node("details", "");
    storage.append(node("summary", "", "Project storage"));
    const pre = node("pre", "");
    pre.textContent = JSON.stringify(
      {
        key: this.ctx.key,
        files: Object.keys(this.files),
        assets: Object.keys(this.assets || {}),
        savedBytes: localStorage.getItem(this.ctx.key)?.length || 0,
      },
      null,
      2,
    );
    storage.append(pre);
    this.assetPanel.append(storage);
  }
  compilerURL() {
    return this.settings.compiler || basePath("api/compile");
  }
  snapshot() {
    return {
      name: this.name,
      files: this.files,
      assets: this.assets,
      arduinoName: this.arduinoName,
      p5Name: this.p5Name,
      references: this.references,
      components: this.components,
      settings: this.settings,
      dock: $("outputDock").value,
      layout: this.layout,
      activeView: this.activeView,
      splitRatio: this.splitRatio,
    };
  }
  restore(d) {
    this.selectedReferenceId = null;
    this.selectedNoteId = null;
    this.setSplit?.(Number.isFinite(d.splitRatio) ? d.splitRatio : 0.5);
    this.name = d.name || "Classroom";
    this.title.textContent = this.name;
    this.files = { ...(d.files || {}) };
    this.assets = d.assets || {};
    this.disableAutorun();
    this.arduinoName = d.arduinoName || "sketch.ino";
    this.p5Name = d.p5Name || "sketch.js";
    this.files["index.html"] ??= defaultP5HTML(this.p5Name);
    for (const stream of this.cameraStreams?.values() || [])
      stream.getTracks().forEach((t) => t.stop());
    this.cameraStreams?.clear();
    this.references = d.references || [];
    this.components = d.components || [];
    setComponentPresets(this.components);
    this.settings = d.settings || {};
    this.syncCommsLibrary($("comms").value);
    this.renderFiles();
    this.renderAssets();
    this.applySettings();
    this.renderReferences();
    this.selectPart();
    this.mainView(
      d.activeView || "circuit",
      ["tabs", "horizontal", "vertical"].includes(d.layout) ? d.layout : "tabs",
    );
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
    this.selectedReferenceId = null;
    document.querySelectorAll(".scene-item.selected").forEach(el=>el.classList.remove("selected"));
    this.selectedNoteId = null;
    $("noteProperties").hidden = true;
    $("propertyEditor").hidden = false;
    $("partAttributes").hidden = false;
    $("partState").hidden = false;
    $("referenceProperties").hidden = false;
    $("referenceProperties")
      .querySelectorAll(".reference-row")
      .forEach((row) => (row.hidden = false));
    $("applyProperties").title = "Apply properties (⌘/Ctrl Enter)";
    $("applyProperties").setAttribute("aria-label", "Apply properties");
    const part = this.ctx.selected();
    this.ctx.setCode(this.propertyEditor, JSON.stringify(part || {}, null, 2));
    $("propertyTitle").textContent = part?.label || part?.id || "Selection";
    this.renderAttributes(part);
    this.showPartState();
  }
  editValue(wrapper, part) {
    const element = wrapper.querySelector(".part-body")?.firstElementChild;
    const hasValue = element?.constructor.elementProperties?.has("value");
    if (!hasValue || part.type === "wokwi-led") return this.tab("properties");
    this.closeValueEditor?.();
    document.querySelector(".part-value-editor")?.remove();
    const form = node("form", "part-value-editor");
    const listeners = new AbortController();
    const close = () => {
      listeners.abort();
      form.remove();
      if (this.closeValueEditor === close) this.closeValueEditor = null;
    };
    this.closeValueEditor = close;
    form.dataset.partId = part.id;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!form.contains(e.target)) close();
      },
      { capture: true, signal: listeners.signal },
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
        }
      },
      { capture: true, signal: listeners.signal },
    );
    const input = node("input", "");
    input.type = "text";
    input.value = element.value ?? part.attrs?.value ?? "";
    input.setAttribute("aria-label", "Component value");
    const units = node("span", "");
    units.textContent = part.type === "wokwi-resistor" ? "Ω" : "";
    const apply = node("button", "", "✓");
    apply.type = "submit";
    apply.title = "Apply value (Enter)";
    const error = node("small", "");
    error.setAttribute("role", "alert");
    form.append(input, units, apply, error);
    form.onpointerdown = (e) => e.stopPropagation();
    form.ondblclick = (e) => e.stopPropagation();
    form.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close();
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const value =
          part.type === "wokwi-resistor"
            ? String(resistance(input.value.replace(/Ω|ohms?/gi, "").trim()))
            : input.value.trim();
        if (!value) throw new Error("Enter a value.");
        if (
          ["wokwi-slide-switch", "p5comp-toggle-switch"].includes(part.type) &&
          !["0", "1"].includes(value)
        )
          throw new Error("Switch position must be 0 or 1.");
        await this.ctx.updatePart(
          { ...part, attrs: { ...part.attrs, value } },
          part.id,
        );
        if (
          [
            "wokwi-slide-switch",
            "p5comp-toggle-switch",
            "p5comp-photoresistor",
            "p5comp-potentiometer",
            "p5comp-slide-potentiometer",
          ].includes(part.type) ||
          part.type === "wokwi-potentiometer" ||
          part.type === "wokwi-slide-potentiometer"
        )
          this.ctx.setControl(part.id, Number(value));
        close();
      } catch (e) {
        error.textContent = e.message;
        input.setAttribute("aria-invalid", "true");
      }
    };
    wrapper.append(form);
    input.focus();
    input.select();
  }
  editLabel(wrapper, part) {
    const handle = wrapper.querySelector(".part-handle");
    const input = node("input", "part-label-input");
    input.value = part.label || part.attrs?.label || part.id;
    input.setAttribute("aria-label", "Part label");
    handle.hidden = true;
    wrapper.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const label = input.value.trim();
      input.remove();
      handle.hidden = false;
      if (save) this.action(() => this.ctx.updatePart({ ...part, label }));
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    };
    input.onblur = () => finish(true);
  }
  renderAttributes(part) {
    const panel = $("partAttributes");
    panel.replaceChildren();
    if (!part) return;
    const field = (caption, value, change, type = "text") => {
      const row = node("label", "attribute-row");
      const label = node("span", "");
      label.textContent = caption;
      const input = node("input", "");
      input.type = type === "color" ? "text" : type;
      if (type === "color") input.dataset.colorField = "";
      input.setAttribute("aria-label", caption);
      if (type === "checkbox") input.checked = !!value;
      else input.value = value;
      input.onchange = () =>
        this.action(() =>
          change(type === "checkbox" ? input.checked : input.value),
        );
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.onchange();
        }
      };
      row.append(label, input);
      panel.append(row);
    };
    field("Name / ID", part.id, (value) =>
      this.ctx.updatePart({ ...part, id: value }),
    );
    field("Label", part.label || part.attrs?.label || "", (value) =>
      this.ctx.updatePart({ ...part, label: value }),
    );
    if (isBreadboard(part.type))
      field(
        "Board color",
        part.attrs?.color || BREADBOARD_COLOR,
        (value) =>
          this.ctx.updatePart({
            ...part,
            attrs: { ...part.attrs, color: value },
          }),
        "color",
      );
    if (
      ["p5comp-potentiometer", "p5comp-slide-potentiometer"].includes(part.type)
    )
      field("Max resistance (Ω)", part.attrs?.maxResistance ?? 10000, (value) =>
        this.ctx.updatePart({
          ...part,
          attrs: {
            ...part.attrs,
            maxResistance: resistance(value.replace(/Ω|ohms?/gi, "").trim()),
          },
        }),
      );
    if (isBreadboard(part.type))
      field(
        "X-ray connections",
        !!part.attrs?.xray,
        (value) =>
          this.ctx.updatePart({
            ...part,
            attrs: { ...part.attrs, xray: value },
          }),
        "checkbox",
      );
    const seats = this.ctx.seated?.(part.id) || [];
    if (seats.length) {
      const mounted = node("details", "switch-pin-help");
      mounted.append(
        node("summary", "", `Breadboard contacts · ${seats.length}`),
      );
      const list = document.createElement("pre");
      list.textContent = seats
        .map(([pin, hole]) => `${pin.split(":")[1]} → ${hole}`)
        .join("\n");
      mounted.append(list);
      panel.append(mounted);
    }
    if (isMomentarySwitch(part.type)) {
      const help = node("details", "switch-pin-help");
      help.innerHTML =
        '<summary>Switch contacts · wiring</summary><pre>1.l ───── 1.r\n     ╲   closes while pressed\n2.l ───── 2.r</pre><p>Same number = always connected. Connect one wire to contact 1 and the other to contact 2 (either side). No polarity; rotation changes the position, not the pin names.</p><p>Input example: D2 → 1.l, GND → 2.l, with INPUT_PULLUP. Released = HIGH; pressed = LOW. For an LED, put the switch in series with its resistor.</p><a href="https://docs.wokwi.com/parts/wokwi-pushbutton" target="_blank" rel="noopener">Official pin reference ↗</a>';
      panel.append(help);
    }
    const modelAttributes =
      {
        "wokwi-photoresistor-sensor": { threshold: 2.5, rl10: 50, gamma: 0.7 },
        "wokwi-small-sound-sensor": { threshold: 512, activeLow: false },
        "wokwi-big-sound-sensor": { threshold: 512, activeLow: false },
        "wokwi-pir-motion-sensor": {
          delayTime: 5,
          inhibitTime: 1.2,
          retrigger: "1",
        },
        "wokwi-relay-module": { transistor: "npn", activeLow: false },
        "wokwi-stepper-motor": { stepsPerRevolution: 200 },
        "wokwi-biaxial-stepper": { stepsPerRevolution: 200 },
        "wokwi-neopixel": { colorOrder: "GRB" },
        "wokwi-led-ring": { colorOrder: "GRB" },
        "wokwi-led-strip": { colorOrder: "GRB" },
        "wokwi-neopixel-matrix": { colorOrder: "GRB" },
      }[part.type] || {};
    for (const [name, fallback] of Object.entries(modelAttributes))
      field(
        name,
        part.attrs?.[name] ?? fallback,
        (value) =>
          this.ctx.updatePart({
            ...part,
            attrs: {
              ...part.attrs,
              [name]: typeof fallback === "number" ? Number(value) : value,
            },
          }),
        typeof fallback === "boolean"
          ? "checkbox"
          : typeof fallback === "number"
            ? "number"
            : "text",
      );
    const element = this.ctx.element(),
      properties = element?.constructor.elementProperties || new Map();
    for (const [name] of properties) {
      if (
        /^(_|on|innerHTML|outerHTML|style|src|href)/i.test(name) ||
        [
          "pinInfo",
          "label",
          "maxResistance",
          "ledPower",
          "led13",
          "ledTX",
          "ledRX",
        ].includes(name)
      )
        continue;
      if (part.type === "wokwi-led" && name === "value") continue;
      const current =
        (isMomentarySwitch(part.type) && name === "pressed"
          ? element.pressed
          : part.attrs?.[name]) ??
        (part.type === "wokwi-led" && name === "brightness"
          ? 1
          : element[name]);
      if (
        !["string", "number", "boolean"].includes(typeof current) &&
        !Array.isArray(current)
      )
        continue;
      field(
        name === "color" && part.type === "p5comp-potentiometer"
          ? "Primary color"
          : name,
        Array.isArray(current) ? JSON.stringify(current) : current,
        (value) => {
          const parsed = Array.isArray(current)
            ? JSON.parse(value)
            : typeof current === "number"
              ? Number(value)
              : value;
          if (isMomentarySwitch(part.type) && name === "pressed") {
            this.ctx.setControl(part.id, parsed);
            return;
          }
          this.ctx.updatePart({
            ...part,
            attrs: { ...part.attrs, [name]: parsed },
          });
        },
        name === "color" && part.type === "p5comp-potentiometer"
          ? "color"
          : typeof current === "boolean"
            ? "checkbox"
            : typeof current === "number"
              ? "number"
              : "text",
      );
    }
  }
  showPartState() {
    const state = this.ctx.element()?.dataset.simulation;
    const output = $("partState");
    if (!output) return;
    output.textContent = state
      ? Object.entries(JSON.parse(state))
          .map(
            ([k, v]) =>
              k + ": " + (typeof v === "number" ? Number(v.toFixed(5)) : v),
          )
          .join(" · ")
      : "";
  }
  applyProperties() {
    if (this.selectedNoteId) return this.applyNote();
    this.action(() => {
      const next = JSON.parse(this.propertyEditor.state.doc.toString());
      this.ctx.updatePart(next);
      this.ctx.notice("Properties applied.");
    });
  }
  exampleFolder(name) {
    const root = $("exampleLibrary");
    let folder = [...root.querySelectorAll(":scope > .example-folder")].find(
      (el) => el.dataset.folder === name,
    );
    if (!folder) {
      folder = node("details", "example-folder");
      folder.dataset.folder = name;
      const summary = node("summary", "");
      summary.setAttribute("aria-label", name + " examples");
      summary.append(
        node("span", "example-folder-mark", "▸"),
        document.createTextNode(name),
      );
      folder.append(summary, node("section", ""));
      root.insertBefore(
        folder,
        root.querySelector('[data-folder="Reference"]') ||
          root.querySelector("hr"),
      );
    }
    return folder.querySelector("section");
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
      b.textContent = "▦  " + (p.workbench?.name || "Example");
      b.onclick = () => this.action(() => this.ctx.openProject(p));
      this.exampleFolder("My examples").append(b);
    }
  }
  dock(mode) {
    if (mode === "window") {
      this.projections.open("p5");
      return;
    }
    this.preview.classList.remove("output-overlay");
    this.preview.style.left = "";
    this.preview.style.top = "";
    this.preview.style.right = "";
    if (mode === "overlay") {
      this.preview.classList.add("output-overlay");
      this.preview.hidden = false;
      this.mainView("circuit", "tabs");
      this.preview.hidden = false;
    } else if (mode === "hidden") this.mainView("circuit", "tabs");
    else this.mainView(this.activeView || "circuit", "horizontal");
    $("outputDock").value = mode;
    this.ctx.canvas.render();
  }
  mainView(active = this.activeView, layout = this.layout) {
    this.activeView = active || "circuit";
    this.layout = layout || "tabs";
    const workspace = document.querySelector(".workspace");
    workspace.dataset.layout = this.layout;
    workspace.classList.remove("canvas-expanded");
    const circuitPanel = document.querySelector(".circuit-panel");
    circuitPanel.hidden =
      this.layout === "tabs" && this.activeView !== "circuit";
    circuitPanel.inert = circuitPanel.hidden;
    circuitPanel.setAttribute("aria-hidden", String(circuitPanel.hidden));
    this.preview.hidden = this.layout === "tabs" && this.activeView !== "p5";
    document
      .querySelectorAll("[data-main-view]")
      .forEach((b) =>
        b.setAttribute(
          "aria-selected",
          String(b.dataset.mainView === this.activeView),
        ),
      );
    $("mainLayout").value = this.layout;
    const viewSummary = this.viewMenu.querySelector("summary");
    viewSummary.textContent = { tabs: "▣", horizontal: "◫", vertical: "⬒" }[
      this.layout
    ];
    viewSummary.title =
      "View · " +
      {
        tabs: "Tabs",
        horizontal: "Horizontal split",
        vertical: "Vertical split",
      }[this.layout];
    viewSummary.setAttribute("aria-label", viewSummary.title);
    this.viewMenu
      .querySelectorAll("[data-layout]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.layout === this.layout),
        ),
      );
    document
      .querySelector(".view-divider")
      ?.setAttribute(
        "aria-orientation",
        this.layout === "vertical" ? "horizontal" : "vertical",
      );
    document.dispatchEvent(new Event("p5comp:refresh-selects"));
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
    for (const [path, asset] of Object.entries(this.assets)) {
      const segments = path.split("/");
      if (segments.some((s) => !s || s === ".." || s === "."))
        throw new Error("Invalid asset path.");
      let target = dir;
      for (const segment of segments.slice(0, -1))
        target = await target.getDirectoryHandle(segment, { create: true });
      const handle = await target.getFileHandle(segments.at(-1), {
        create: true,
      });
      const writable = await handle.createWritable();
      await writable.write(await (await fetch(asset.src)).blob());
      await writable.close();
    }
    this.ctx.notice("Project folder saved.");
  }
  editComponents() {
    const dialog = node("dialog", "lesson-note-editor");
    dialog.setAttribute("aria-label", "Component preset editor");
    dialog.innerHTML =
      '<form><header>Component presets <span title="Reuse an existing part’s pin layout and simulation with your own attributes. New device protocols require a simulator model.">ⓘ</span></header><textarea aria-label="Component definitions" spellcheck="false"></textarea><small role="alert"></small><footer><button type="button">Cancel</button><button type="submit">Save components</button></footer></form>';
    const source = dialog.querySelector("textarea");
    source.value = JSON.stringify(
      this.components.length
        ? this.components
        : [
            {
              name: "10k resistor",
              base: "wokwi-resistor",
              attrs: { value: "10000" },
            },
          ],
      null,
      2,
    );
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    dialog.querySelector('[type="button"]').onclick = close;
    dialog.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      try {
        const definitions = JSON.parse(source.value);
        setComponentPresets(definitions);
        this.components = definitions;
        this.ctx.persist();
        close();
      } catch (e) {
        dialog.querySelector("small").textContent = e.message;
      }
    };
    document.body.append(dialog);
    dialog.showModal();
    source.focus();
  }
  addNote(point = null) {
    const bounds = $("stage").getBoundingClientRect();
    const position =
      point ||
      this.ctx.canvas.toWorld({
        clientX: bounds.left + 24,
        clientY: bounds.top + 24,
      });
    const ref = {
      id: crypto.randomUUID(),
      kind: "note",
      name: "",
      format: "markdown",
      source: "",
      x: position.x,
      y: position.y,
      width: 320,
      background: "#f6f4ee",
      color: "#343436",
      fontSize: 13,
      opacity: 1,
      blend: "normal",
    };
    this.references.push(ref);
    this.renderReferences();
    this.ctx.persist();
    this.selectNote(ref);
    this.editNoteInline(ref);
  }
  editLessonNote(existing = null) {
    if (!existing) return this.addNote();
    this.selectNote(existing, true);
  }
  selectReference(ref) {
    this.ctx.clearSelection();
    this.selectedReferenceId = ref.id;
    if (ref.kind !== "note") this.selectedNoteId = null;
    for (const scene of document.querySelectorAll(".scene-item")) {
      scene.classList.toggle("selected",scene.dataset.reference === ref.id);
      if (scene.dataset.reference === ref.id) { scene.tabIndex = -1; scene.focus({preventScroll:true}); }
    }
  }
  removeReference(id) {
    if (!this.references.some(ref=>ref.id === id)) return false;
    releaseReferenceStream(this.cameraStreams,id);
    this.references = this.references.filter(ref=>ref.id !== id);
    for (const el of document.querySelectorAll(".scene-item,.reference-row"))
      if (el.dataset.reference === id) el.remove();
    if (this.selectedReferenceId === id || this.selectedNoteId === id) this.selectPart();
    this.ctx.persist();
    return true;
  }
  duplicateReference(ref, offset=20) {
    const clone={...structuredClone(ref),id:crypto.randomUUID(),x:ref.x+offset,y:ref.y+offset};
    if(ref.overlayX!=null)clone.overlayX+=offset;
    if(ref.overlayY!=null)clone.overlayY+=offset;
    this.references.push(clone);this.renderReferences();this.selectReference(clone);this.ctx.persist();return clone;
  }
  deleteSelectedReference() {
    return !!this.selectedReferenceId && this.removeReference(this.selectedReferenceId);
  }
  selectNote(ref, focus = false) {
    this.selectReference(ref);
    const changed = this.selectedNoteId !== ref.id;
    this.selectedNoteId = ref.id;
    $("propertyEditor").hidden = true;
    $("partAttributes").hidden = true;
    $("partState").hidden = true;
    $("referenceProperties").hidden = false;
    $("referenceProperties")
      .querySelectorAll(".reference-row")
      .forEach((row) => (row.hidden = row.dataset.reference !== ref.id));
    $("noteProperties").hidden = false;
    $("propertyTitle").textContent = ref.name || "Note";
    $("applyProperties").title = "Apply note (⌘/Ctrl Enter)";
    $("applyProperties").setAttribute("aria-label", "Apply note");
    if (changed) {
      this.renderNoteAppearance(ref);
      this.loadingNote = true;
      $("noteName").value = ref.name || "";
      $("noteFormat").value = ref.format || "markdown";
      this.noteEditor.setLanguage($("noteFormat").value);
      this.ctx.setCode(this.noteEditor, ref.source || "");
      this.loadingNote = false;
    }
    document
      .querySelectorAll(".scene-item")
      .forEach((el) =>
        el.classList.toggle("selected", el.dataset.reference === ref.id),
      );
    this.tab("properties");
    this.noteEditor.requestMeasure();
    if (focus) this.noteEditor.focus();
  }
  editNoteInline(ref) {
    const scene = [...document.querySelectorAll(".scene-item")].find(el => el.dataset.reference === ref.id);
    const content = scene?.querySelector(".lesson-note");
    if (!content || content.hasAttribute("contenteditable")) return;
    this.selectNote(ref);
    const original = ref.source || "";
    content.textContent = original;
    content.setAttribute("contenteditable", "plaintext-only");
    content.setAttribute("role", "textbox");
    content.setAttribute("aria-label", "Note content");
    content.setAttribute("aria-multiline", "true");
    const sync = () => {
      ref.source = content.innerText.replace(/\r\n/g, "\n");
      if (this.selectedNoteId === ref.id) {
        this.loadingNote = true;
        this.ctx.setCode(this.noteEditor, ref.source);
        this.loadingNote = false;
      }
      this.ctx.persist();
    };
    let finished = false;
    const finish = (cancel = false) => {
      if (finished) return;
      if (!cancel) sync();
      else { ref.source = original; if (this.selectedNoteId === ref.id) { this.loadingNote=true; this.ctx.setCode(this.noteEditor,original); this.loadingNote=false; } this.ctx.persist(); }
      finished = true;
      content.oninput = content.onblur = content.onkeydown = null;
      content.removeAttribute("contenteditable");
      content.removeAttribute("role");
      content.removeAttribute("aria-multiline");
      content.innerHTML = lessonHTML(ref.source, ref.format);
    };
    content.oninput = sync;
    content.onblur = () => finish();
    content.onkeydown = e => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); finish(true); scene.focus(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); finish(); scene.focus(); }
    };
    content.focus();
  }
  paintNote(ref, scene) {
    scene.style.setProperty("--note-background", ref.background || "#f6f4ee");
    scene.style.setProperty("--note-color", ref.color || "#343436");
    scene.style.setProperty("--note-font-size", (ref.fontSize || 13) + "px");
    scene.style.height = ref.height ? ref.height + "px" : "auto";
    scene.style.width = ref.width + "px";
  }
  renderNoteAppearance(ref) {
    const panel = $("noteAppearance");
    panel.replaceChildren();
    for (const [prop, caption, type, fallback] of [
      ["background", "Background", "color", "#f6f4ee"],
      ["color", "Text color", "color", "#343436"],
      ["fontSize", "Font size", "number", 13],
      ["width", "Width", "number", 320],
      ["height", "Height", "number", ""],
    ]) {
      const label = node("label", "");
      const input = node("input", "");
      label.append(document.createTextNode(caption));
      input.type = type === "color" ? "text" : type;
      if (type === "color") input.dataset.colorField = "";
      input.setAttribute("aria-label", "Note " + caption.toLowerCase());
      input.dataset.noteProperty = prop;
      input.value = ref[prop] ?? fallback;
      if (type === "number") {
        input.min = prop === "fontSize" ? 6 : 80;
        input.placeholder = "Auto";
      }
      input.oninput = () => {
        if (
          type === "number" &&
          input.value &&
          Number(input.value) < Number(input.min)
        )
          return;
        ref[prop] =
          type === "number"
            ? input.value
              ? Number(input.value)
              : undefined
            : input.value;
        const scene = [...document.querySelectorAll(".scene-note")].find(
          (el) => el.dataset.reference === ref.id,
        );
        if (scene) this.paintNote(ref, scene);
        this.ctx.persist();
      };
      label.append(input);
      panel.append(label);
    }
  }
  applyNote() {
    const ref = this.references.find((ref) => ref.id === this.selectedNoteId);
    if (!ref) return;
    ref.name = $("noteName").value;
    ref.format = $("noteFormat").value;
    ref.source = this.noteEditor.state.doc.toString();
    const scene = [...document.querySelectorAll(".scene-item")].find(
      (el) => el.dataset.reference === ref.id,
    );
    if (scene) {
      scene.querySelector(".lesson-note").innerHTML = lessonHTML(
        ref.source,
        ref.format,
      );
      scene.querySelector(".scene-handle").textContent = ref.name;
      scene.querySelector(".scene-handle").hidden = !ref.name;
      scene
        .querySelector(".scene-handle")
        .setAttribute("aria-label", "Move " + ref.name);
    }
    $("propertyTitle").textContent = ref.name || "Note";
    const row = [
      ...$("referenceProperties").querySelectorAll(".reference-row"),
    ].find((el) => el.dataset.reference === ref.id);
    if (row) {
      row.querySelector("span").textContent = ref.name;
      row.querySelectorAll("input").forEach((input) => {
        const property = input.getAttribute("aria-label").split(" ").at(-1);
        input.setAttribute("aria-label", ref.name + " " + property);
      });
      row
        .querySelector("select")
        .setAttribute("aria-label", ref.name + " blend");
    }
    this.ctx.persist();
  }
  async loadImages() {
    const bounds = $("stage").getBoundingClientRect();
    const position = this.ctx.canvas.toWorld({
      clientX: bounds.left + 24,
      clientY: bounds.top + 24,
    });
    for (const f of this.imageInput.files) {
      if (f.size > 24000000)
        throw new Error(
          "Scene media must be under 24 MB. Use a shorter video clip.",
        );
      if (!/^(image|video)\//.test(f.type))
        throw new Error("Choose an image or video.");
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      this.references.push({
        id: crypto.randomUUID(),
        name: f.name,
        kind: f.type.startsWith("video/") ? "video" : "image",
        src: data,
        x: position.x,
        y: position.y,
        width: 400,
        opacity: 1,
        showLabel: false,
        blend: "normal",
      });
    }
    this.renderReferences();
    this.ctx.persist();
    this.tab("properties");
  }
  renderReferences() {
    document.querySelector("#referenceLayer")?.remove();
    document.getElementById("webcamOverlayLayer")?.remove();
    const layer = node("div", "");
    layer.id = "referenceLayer";
    $("world").prepend(layer);
    $("referenceProperties").replaceChildren();
    for (const ref of this.references) {
      const img = node("div", "reference-image scene-item");
      img.dataset.reference = ref.id;
      const handle = node("button", "scene-handle");
      handle.textContent = ref.name;
      if (ref.kind === "note") handle.hidden = !ref.name;
      handle.title = "Drag to move · double-click to rename";
      handle.setAttribute("aria-label", "Move " + ref.name);
      img.append(handle);
      let content;
      if (ref.kind === "note") {
        content = node("article", "lesson-note");
        content.innerHTML = lessonHTML(ref.source, ref.format);
        content.dataset.placeholder = "Write a note…";
        content.title = "Double-click to edit on the canvas";
        img.classList.add("scene-note");
        img.onpointerdown = (e) => {
          e.stopPropagation();
          if (!e.target.closest("[contenteditable]")) this.selectNote(ref);
        };
      } else {
        content = node(
          ["video", "webcam"].includes(ref.kind) ? "video" : "img",
          "scene-media",
        );
        if (ref.src) content.src = ref.src;
        content.alt = ref.name;
        content.draggable = false;
        if (ref.kind === "video") {
          content.controls = true;
          content.preload = "metadata";
          content.playsInline = true;
        }
      }
      img.append(content);
      img.style.cssText = `left:${ref.x}px;top:${ref.y}px;width:${ref.width}px;opacity:${ref.opacity};mix-blend-mode:${ref.blend}`;
      if (ref.kind === "note") {
        this.paintNote(ref, img);
        const resize = node("button", "note-resize");
        resize.title = "Resize note";
        resize.setAttribute("aria-label", "Resize " + ref.name);
        img.append(resize);
        resize.onpointerdown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.selectNote(ref);
          const start = {
            x: e.clientX,
            y: e.clientY,
            width: img.offsetWidth,
            height: img.offsetHeight,
          };
          resize.setPointerCapture(e.pointerId);
          resize.onpointermove = (e) => {
            const zoom = this.ctx.canvas.camera.zoom;
            ref.width = Math.max(
              120,
              start.width + (e.clientX - start.x) / zoom,
            );
            ref.height = Math.max(
              80,
              start.height + (e.clientY - start.y) / zoom,
            );
            this.paintNote(ref, img);
            for (const prop of ["width", "height"])
              $("noteAppearance").querySelector(
                `[data-note-property="${prop}"]`,
              ).value = Math.round(ref[prop]);
          };
          resize.onpointerup = resize.onpointercancel = () => {
            resize.onpointermove = null;
            this.ctx.persist();
          };
        };
      }
      layer.append(img);
      img.addEventListener("dblclick", (e) => {
        if (e.target.closest("[contenteditable]")) { e.stopPropagation(); return; }
        e.preventDefault();
        e.stopPropagation();
        if (ref.kind === "note") {
          const label = e.target.closest(".scene-handle");
          if (!label) this.editNoteInline(ref);
          else {
            this.selectNote(ref);
            $("noteName").focus();
            $("noteName").select();
          }
        }
      });
      handle.ondblclick = (e) => {
        if (ref.kind !== "note") return;
        e.preventDefault();
        e.stopPropagation();
        this.selectNote(ref);
        $("noteName").focus();
        $("noteName").select();
      };
      handle.onpointerdown = (e) => {
        e.stopPropagation();
        if (ref.kind === "note") this.selectNote(ref);
        const start = { x: e.clientX, y: e.clientY, rx: ref.x, ry: ref.y };
        handle.setPointerCapture(e.pointerId);
        handle.onpointermove = (e) => {
          ref.x =
            start.rx + (e.clientX - start.x) / this.ctx.canvas.camera.zoom;
          ref.y =
            start.ry + (e.clientY - start.y) / this.ctx.canvas.camera.zoom;
          img.style.left = ref.x + "px";
          img.style.top = ref.y + "px";
        };
        handle.onpointerup = () => {
          handle.onpointermove = null;
          this.ctx.persist();
        };
      };
      const row = node("div", "reference-row");
      row.dataset.reference = ref.id;
      const label = node("span", "");
      label.textContent = ref.name;
      row.append(label);
      if (ref.kind === "note") {
        const edit = node("button", "", "✎");
        edit.title = "Edit note";
        edit.onclick = () => this.editLessonNote(ref);
        row.append(edit);
      }
      for (const [prop, type] of [
        ["opacity", "range"],
        ["width", "number"],
        ["x", "number"],
        ["y", "number"],
      ]) {
        if (ref.kind === "note" && prop === "width") continue;
        const input = node("input", "");
        input.type = type === "color" ? "text" : type;
        if (type === "color") input.dataset.colorField = "";
        input.setAttribute("aria-label", ref.name + " " + prop);
        if (type === "range") {
          input.min = 0;
          input.max = 1;
          input.step = 0.01;
        }
        input.value = ref[prop];
        input.oninput = () => {
          ref[prop] = Number(input.value);
          const css = {
            x: "left",
            y: "top",
            width: "width",
            opacity: "opacity",
          }[prop];
          img.style[css] = prop === "opacity" ? ref[prop] : ref[prop] + "px";
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
      del.onclick = () => this.removeReference(ref.id);
      row.append(del);
      decorateMedia(this, ref, img, content, handle, row);
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
