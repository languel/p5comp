/**
 * Intelligent Assistant Inspector Panel for p5comp.
 * - AI settings live in Global Settings -> "AI / Model" (borrowing artistmodelstudio's layout).
 * - Chat panel uses artistmodelstudio's clean composer look with context attachments
 *   (selected canvas elements from circuit/physics/drawing, Arduino/p5 code, project state, files).
 */

import "./assistant.css";
import { createAssistantTools } from "./tools.js";
import { runAgentTurn } from "./protocol.js";
import { PiAgent, createPiModel, buildPiInstructions } from "./piAgent.js";
import { lessonHTML, renderDiagramSVG } from "../lessonContent.js";
import {
  ASSISTANT_PROVIDERS,
  LFM3_LOCAL_PI_MODEL_ID,
  LFM3_DEFAULT_MODEL_ID,
  LFM3_QAD_MODEL_ID,
  LFM3_MODELS,
  loadAssistantSettings,
  saveAssistantSettings,
  probeModels,
  completeChat,
  Lfm3Client,
} from "./providers.js";

const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};

const SEND_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const STOP_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>';
const PLUS_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const MORE_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

const PROVIDER_SHORT = {
  ollama: "Ollama",
  lfm3: "LFM3",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

const STARTERS = [
  "Build a servo crank-slider controlled by a potentiometer",
  "Build a gear motor four-bar linkage and run it",
  "Wire a red LED on pin 13 with a 220Ω resistor and blink it",
  "Load the servo garden example",
];

const FALLBACK_MODELS = {
  ollama: [],
  lfm3: LFM3_MODELS.map((m) => m.id),
  openai: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
  openrouter: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4", "openai/gpt-4o-mini"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
  anthropic: ["claude-sonnet-4-0", "claude-3-5-haiku-latest"],
};

const LFM3_LABEL_MAP = new Map(LFM3_MODELS.map((m) => [m.id, m.label]));

const CUSTOM_SENTINEL = "__custom__";

/** Collect currently selected elements across Circuit, Physics, and Poliplan Drawing layers. */
function gatherCanvasSelection(wb) {
  const ctx = wb?.ctx;
  const diagram = ctx?.diagram?.() || { parts: [], connections: [] };
  const canvas = ctx?.canvas;

  const partIds = [...(canvas?.selectedParts || [])];
  const parts = partIds
    .map((id) => (diagram.parts || []).find((p) => p.id === id))
    .filter(Boolean);

  const wireIndices = [...(canvas?.selectedWires || [])];
  const wires = wireIndices
    .map((idx) => (diagram.connections || [])[idx])
    .filter(Boolean);

  const physScene = wb?.physics?.scene || { bodies: [], joints: [] };
  const bodyIds = [...(wb?.physics?.selectedBodies || [])];
  const bodies = bodyIds
    .map((id) => (physScene.bodies || []).find((b) => b.id === id))
    .filter(Boolean);

  const jointIds = [...(wb?.physics?.selectedJoints || [])];
  const joints = jointIds
    .map((id) => (physScene.joints || []).find((j) => j.id === id))
    .filter(Boolean);

  const markIds = wb?.drawing?.drawingSelection || [];
  let marks = [];
  if (markIds.length) {
    const docMarks = wb?.drawing?.snapshot?.()?.marks || [];
    const idSet = new Set(markIds);
    marks = docMarks.filter((m) => idSet.has(m.id));
    if (!marks.length) marks = markIds.map((id) => ({ id }));
  }

  const total = parts.length + wires.length + bodies.length + joints.length + marks.length;
  if (!total) return null;

  const payload = {};
  if (parts.length) payload.circuitParts = parts;
  if (wires.length) payload.circuitWires = wires;
  if (bodies.length) payload.physicsBodies = bodies;
  if (joints.length) payload.physicsJoints = joints;
  if (marks.length) payload.drawingMarks = marks;

  let label;
  if (total === 1) {
    if (parts[0]) label = `${parts[0].id} (${parts[0].type})`;
    else if (wires[0]) label = `wire ${wires[0][0]}→${wires[0][1]}`;
    else if (bodies[0]) label = `${bodies[0].shape || "body"} (${bodies[0].id})`;
    else if (joints[0]) label = `${joints[0].kind || "joint"} (${joints[0].id})`;
    else label = `drawing mark (${marks[0].id})`;
  } else {
    const bits = [];
    if (parts.length) bits.push(`${parts.length} part${parts.length > 1 ? "s" : ""}`);
    if (wires.length) bits.push(`${wires.length} wire${wires.length > 1 ? "s" : ""}`);
    if (bodies.length) bits.push(`${bodies.length} body${bodies.length > 1 ? "s" : ""}`);
    if (joints.length) bits.push(`${joints.length} joint${joints.length > 1 ? "s" : ""}`);
    if (marks.length) bits.push(`${marks.length} mark${marks.length > 1 ? "s" : ""}`);
    label = bits.join(", ");
  }

  return {
    id: `sel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "selection",
    label,
    total,
    content: JSON.stringify(payload, null, 2),
  };
}

function showPopupMenu(anchor, items) {
  document.querySelectorAll(".assist-popup-menu").forEach((m) => m.remove());
  const menu = el("div", { class: "assist-popup-menu", role: "menu" });
  for (const item of items) {
    if (item === "---") {
      menu.append(el("div", { class: "assist-popup-sep" }));
      continue;
    }
    const btn = el(
      "button",
      {
        type: "button",
        class: "assist-popup-item",
        role: "menuitem",
        disabled: Boolean(item.disabled),
        title: item.hint || "",
        onclick: () => {
          close();
          item.onClick?.();
        },
      },
      el("span", { class: "assist-popup-label" }, item.label),
      item.meta ? el("span", { class: "assist-popup-meta" }, item.meta) : null,
    );
    menu.append(btn);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left));
  const top = r.top - mh - 6 > 8 ? r.top - mh - 6 : Math.min(window.innerHeight - mh - 8, r.bottom + 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onDown = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    menu.remove();
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("keydown", onKey, true);
  };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("keydown", onKey, true);
}

export function mountAssistantPanel(root, wb, { settingsHost = null, openSettings = null } = {}) {
  const tools = createAssistantTools(wb);
  let settings = loadAssistantSettings();
  const history = [];
  const attachments = [];
  let abortCtrl = null;
  let availableModels = [];
  let probeSeq = 0;

  const settingsStatusEl = el("div", { class: "assist-settings-status" });
  const chatStatusEl = el("div", { class: "assist-status" });

  const setSettingsStatus = (msg, tone = "") => {
    settingsStatusEl.textContent = msg || "";
    settingsStatusEl.className = `assist-settings-status${tone ? ` ${tone}` : ""}`;
  };
  const setChatStatus = (msg) => {
    chatStatusEl.textContent = msg || "";
  };

  const lfmBarFill = el("span", { class: "assist-lfm-bar-fill" });
  const lfmBar = el("div", { class: "assist-lfm-bar", hidden: true }, lfmBarFill);

  const chatWebgpuBarFill = el("span", { class: "assist-lfm-bar-fill" });
  const chatWebgpuProgress = el("div", { class: "assist-lfm-bar", hidden: true }, chatWebgpuBarFill);
  const chatWebgpuNote = el("span", { class: "assist-webgpu-note" }, "Local WebGPU · no API key");
  const chatWebgpuQuant = el(
    "select",
    {
      class: "assist-webgpu-quant",
      "aria-label": "WebGPU quantization",
      "data-native": true,
      onchange: () => {
        settings.model = chatWebgpuQuant.value;
        saveAssistantSettings(settings);
        populateModelPicker(LFM3_MODELS.map((m) => m.id));
        syncWebgpuBanner();
      },
    },
    el("option", { value: LFM3_LOCAL_PI_MODEL_ID }, "Pi · Q4_K_M (Local)"),
    el("option", { value: LFM3_DEFAULT_MODEL_ID }, "Base · Q4_K_M (HF)"),
    el("option", { value: LFM3_QAD_MODEL_ID }, "Base · QAD Q4_0 (HF)"),
  );
  const chatWebgpuLoadBtn = el(
    "button",
    {
      type: "button",
      class: "assist-webgpu-btn",
      onclick: () => triggerWebgpuLoad(),
    },
    "Load WebGPU (~1.1 GB)",
  );
  const chatWebgpuBanner = el(
    "div",
    { class: "assist-webgpu-banner", hidden: true },
    el("div", { class: "assist-webgpu-row" }, chatWebgpuNote, chatWebgpuQuant, chatWebgpuLoadBtn),
    chatWebgpuProgress,
  );

  const syncWebgpuBanner = () => {
    const isLfm = settings.provider === "lfm3";
    const targetId = settings.model || LFM3_DEFAULT_MODEL_ID;
    const loaded = lfm3.ready && lfm3.readyModel === targetId;
    chatWebgpuBanner.hidden = !isLfm || loaded;
    chatWebgpuQuant.value =
      targetId === LFM3_LOCAL_PI_MODEL_ID
        ? LFM3_LOCAL_PI_MODEL_ID
        : targetId === LFM3_QAD_MODEL_ID
          ? LFM3_QAD_MODEL_ID
          : LFM3_DEFAULT_MODEL_ID;
    if (!lfm3.loading) {
      chatWebgpuLoadBtn.disabled = false;
      chatWebgpuLoadBtn.textContent = "Load WebGPU (~1.1 GB)";
      chatWebgpuNote.textContent = "LFM3-1.7B · runs locally in browser";
      chatWebgpuProgress.hidden = true;
    }
  };

  async function triggerWebgpuLoad() {
    const targetModel = settings.model || LFM3_DEFAULT_MODEL_ID;
    chatWebgpuLoadBtn.disabled = true;
    chatWebgpuLoadBtn.textContent = "Loading…";
    setSettingsStatus(`Loading ${targetModel} on WebGPU…`);
    try {
      await lfm3.load(targetModel);
    } catch (err) {
      setSettingsStatus(`Load failed: ${err.message}`, "warn");
      chatWebgpuNote.textContent = err.message || "WebGPU load failed";
      chatWebgpuLoadBtn.disabled = false;
      chatWebgpuLoadBtn.textContent = "Retry Load";
    }
    syncWebgpuBanner();
  }

  const lfm3 = new Lfm3Client((msg) => {
    if (msg.status === "loading") {
      const m = msg.message || "Loading WebGPU model…";
      const pct = Math.round(Math.max(0.02, Math.min(1, msg.fraction || 0)) * 100);
      setSettingsStatus(m);
      setChatStatus(m);
      lfmBar.hidden = false;
      lfmBarFill.style.width = `${pct}%`;
      chatWebgpuProgress.hidden = false;
      chatWebgpuBarFill.style.width = `${pct}%`;
      chatWebgpuNote.textContent = m;
      chatWebgpuLoadBtn.disabled = true;
      chatWebgpuLoadBtn.textContent = `${pct}%`;
      if (settings.provider === "lfm3") probeBtn.textContent = "Loading…";
    } else if (msg.status === "ready") {
      const m = msg.message || "LFM3-1.7B ready on WebGPU";
      setSettingsStatus(m, "ok");
      setChatStatus("");
      lfmBar.hidden = true;
      lfmBarFill.style.width = "100%";
      chatWebgpuProgress.hidden = true;
      if (settings.provider === "lfm3") probeBtn.textContent = "Loaded";
      syncWebgpuBanner();
    } else if (msg.status === "error") {
      const m = `WebGPU error: ${msg.error || msg.message}`;
      setSettingsStatus(m, "warn");
      setChatStatus(m);
      lfmBar.hidden = true;
      chatWebgpuProgress.hidden = true;
      chatWebgpuLoadBtn.disabled = false;
      chatWebgpuLoadBtn.textContent = "Retry Load";
      if (settings.provider === "lfm3") probeBtn.textContent = "Load";
    }
  });

  const piModel = createPiModel(() => settings, { lfm3 });
  const resolvePiToolSet = () => {
    if (settings.toolSet === "full") return "full";
    if (settings.toolSet === "small") return "small";
    return settings.provider === "lfm3" ? "small" : "full";
  };
  const piAgent = new PiAgent({
    model: piModel,
    tools: tools.piSpecs(resolvePiToolSet()),
    runTool: (name, args) => tools.run(name, args),
    maxRounds: settings.maxSteps || 6,
  });

  // ── Model & Settings Controls (mounted inside Global Settings -> AI / Model) ──
  const pillEngine = el("span", { class: "assist-pill-engine" });
  const pillModel = el("span", { class: "assist-pill-model" });
  const updateModelPill = () => {
    pillEngine.textContent = PROVIDER_SHORT[settings.provider] || settings.provider;
    const raw = settings.model || "";
    const short =
      settings.provider === "lfm3"
        ? raw === LFM3_LOCAL_PI_MODEL_ID
          ? "WebGPU Pi"
          : raw === LFM3_QAD_MODEL_ID
            ? "WebGPU QAD"
            : "WebGPU Q4"
        : raw.includes("/")
          ? raw.split("/").pop()
          : raw;
    pillModel.textContent = short || "select model";
    modelPillBtn.title = `${PROVIDER_SHORT[settings.provider] || settings.provider} · ${LFM3_LABEL_MAP.get(raw) || raw || "no model"} — click to switch provider or open AI settings`;
  };

  const modelSelect = el("select", {
    class: "assist-model",
    "aria-label": "Select model",
    onchange: () => {
      const v = modelSelect.value;
      if (v === CUSTOM_SENTINEL) {
        customModelRow.hidden = false;
        customModelInput.focus();
        return;
      }
      customModelRow.hidden = true;
      settings.model = v;
      customModelInput.value = v;
      saveAssistantSettings(settings);
      updateModelPill();
    },
  });

  function populateModelPicker(models = []) {
    availableModels = [...new Set(models.filter(Boolean))];
    const list = availableModels.length
      ? [...availableModels]
      : [...(FALLBACK_MODELS[settings.provider] || [])];
    const options = [];
    if (!list.length) {
      options.push(el("option", { value: "" }, "No models detected — click ↻"));
    } else {
      if (settings.model && !list.includes(settings.model)) {
        if (availableModels.length || settings.provider === "lfm3") {
          settings.model = list[0];
          saveAssistantSettings(settings);
        } else {
          list.unshift(settings.model);
        }
      } else if (!settings.model && list.length) {
        settings.model = list[0];
        saveAssistantSettings(settings);
      }
      for (const m of list) {
        options.push(el("option", { value: m, selected: m === settings.model }, LFM3_LABEL_MAP.get(m) || m));
      }
    }
    options.push(el("option", { value: CUSTOM_SENTINEL }, "Custom model…"));
    modelSelect.replaceChildren(...options);
    if (settings.model && [...modelSelect.options].some((o) => o.value === settings.model)) {
      modelSelect.value = settings.model;
    }
    customModelInput.value = settings.model || "";
    updateModelPill();
    document.dispatchEvent(new Event("p5comp:refresh-selects"));
  }

  async function refreshModels(silent = false) {
    const seq = ++probeSeq;
    const wantProvider = settings.provider;
    if (wantProvider === "lfm3") {
      populateModelPicker(LFM3_MODELS.map((m) => m.id));
      const loaded = lfm3.ready && lfm3.readyModel === (settings.model || LFM3_DEFAULT_MODEL_ID);
      probeBtn.textContent = loaded ? "Loaded" : "Load (~1.1 GB)";
      setSettingsStatus(
        loaded ? "Ready on WebGPU (cached in browser)" : "Click Load to download & run locally on WebGPU",
        loaded ? "ok" : "",
      );
      syncWebgpuBanner();
      return;
    }
    if (!silent) setSettingsStatus(`Listing ${wantProvider} models…`);
    const r = await probeModels(settings);
    if (seq !== probeSeq || settings.provider !== wantProvider) return;
    if (r.ok && r.models.length) {
      populateModelPicker(r.models);
      setSettingsStatus(`${r.models.length} model${r.models.length === 1 ? "" : "s"} available`, "ok");
    } else {
      populateModelPicker([]);
      setSettingsStatus(r.error || "No models found", "warn");
    }
  }

  const providerSelect = el(
    "select",
    {
      class: "assist-provider",
      "aria-label": "AI model provider",
      onchange: () => {
        const spec = ASSISTANT_PROVIDERS.find((p) => p.id === providerSelect.value);
        settings.provider = spec.id;
        settings.baseUrl = spec.defaultUrl;
        settings.model = spec.defaultModel;
        urlInput.value = settings.baseUrl;
        saveAssistantSettings(settings);
        syncConfigVisibility();
        populateModelPicker(FALLBACK_MODELS[settings.provider] || []);
        refreshModels(true);
      },
    },
    ...ASSISTANT_PROVIDERS.map((p) =>
      el("option", { value: p.id, selected: p.id === settings.provider }, p.label),
    ),
  );

  const probeBtn = el(
    "button",
    {
      type: "button",
      class: "assist-settings-btn",
      title: "Refresh models (or download/load LFM3-1.7B on WebGPU)",
      onclick: async () => {
        if (settings.provider === "lfm3") {
          await triggerWebgpuLoad();
          return;
        }
        await refreshModels(false);
      },
    },
    "↻",
  );

  const urlInput = el("input", {
    type: "text",
    value: settings.baseUrl,
    placeholder: "http://127.0.0.1:11434/v1",
    onchange: () => {
      settings.baseUrl = urlInput.value.trim();
      saveAssistantSettings(settings);
      refreshModels(false);
    },
  });
  const keyInput = el("input", {
    type: "password",
    value: settings.apiKey,
    placeholder: "Optional for local Ollama",
    onchange: () => {
      settings.apiKey = keyInput.value.trim();
      saveAssistantSettings(settings);
    },
  });
  const customModelInput = el("input", {
    type: "text",
    value: settings.model,
    placeholder: "Enter custom model ID…",
    onchange: () => {
      const m = customModelInput.value.trim();
      if (!m) return;
      settings.model = m;
      saveAssistantSettings(settings);
      populateModelPicker([m, ...availableModels]);
      customModelRow.hidden = true;
    },
  });

  const lfmNote = el(
    "div",
    { class: "assist-settings-note", hidden: settings.provider !== "lfm3" },
    "Runs in this browser on your GPU; the first use downloads the model.",
  );

  const toolsChk = el("input", {
    type: "checkbox",
    checked: settings.toolsEnabled,
    onchange: () => {
      settings.toolsEnabled = toolsChk.checked;
      saveAssistantSettings(settings);
      syncToolsUI();
    },
  });
  const stepsChk = el("input", {
    type: "checkbox",
    checked: settings.showSteps,
    onchange: () => {
      settings.showSteps = stepsChk.checked;
      saveAssistantSettings(settings);
      renderChat();
    },
  });
  const agentModeSelect = el(
    "select",
    {
      "aria-label": "Agent runtime",
      onchange: () => {
        settings.agentMode = agentModeSelect.value === "json" ? "json" : "pi";
        saveAssistantSettings(settings);
        toolSetRow.hidden = settings.agentMode !== "pi";
      },
    },
    el("option", { value: "pi", selected: settings.agentMode !== "json" }, "Pi Agent (native tools)"),
    el("option", { value: "json", selected: settings.agentMode === "json" }, "JSON Loop (compact)"),
  );

  const toolSetSelect = el(
    "select",
    {
      "aria-label": "Pi tool set",
      onchange: () => {
        settings.toolSet = toolSetSelect.value;
        saveAssistantSettings(settings);
        piAgent.configure({ tools: tools.piSpecs(resolvePiToolSet()) });
      },
    },
    el("option", { value: "auto", selected: settings.toolSet === "auto" }, "Auto (compact on WebGPU)"),
    el("option", { value: "full", selected: settings.toolSet === "full" }, "Full (all 29 MCP tools)"),
    el("option", { value: "small", selected: settings.toolSet === "small" }, "Compact (15 core tools)"),
  );

  const maxStepsInput = el("input", {
    type: "number",
    min: "1",
    max: "24",
    step: "1",
    value: String(settings.maxSteps || 14),
    onchange: () => {
      settings.maxSteps = Math.max(1, Math.min(24, Math.round(Number(maxStepsInput.value) || 14)));
      settings.maxStepsManual = true;
      maxStepsInput.value = String(settings.maxSteps);
      saveAssistantSettings(settings);
      piAgent.configure({ maxRounds: settings.maxSteps });
    },
  });

  const providerRow = el("label", {}, "Provider", providerSelect);
  const urlRow = el("label", {}, "Base URL", urlInput);
  const keyRow = el("label", {}, "API Key", keyInput);
  const modelControl = el("span", { class: "assist-model-ctl" }, modelSelect, probeBtn);
  const modelRow = el("label", {}, "Model", modelControl);
  const customModelRow = el("label", { hidden: true }, "Custom model", customModelInput);
  const askingSub = el("div", { class: "assist-settings-sub" }, "Asking");
  const agentModeRow = el("label", {}, "Agent", agentModeSelect);
  const toolSetRow = el("label", { hidden: settings.agentMode !== "pi" }, "Tool set", toolSetSelect);
  const maxStepsRow = el("label", {}, "Max steps", maxStepsInput);
  const toolsRow = el("label", {}, "Studio tools", toolsChk);
  const stepsRow = el("label", {}, "Tool details", stepsChk);

  const syncConfigVisibility = () => {
    const isLfm = settings.provider === "lfm3";
    urlRow.hidden = isLfm;
    keyRow.hidden = isLfm;
    lfmNote.hidden = !isLfm;
    const loaded = lfm3.ready && lfm3.readyModel === (settings.model || LFM3_DEFAULT_MODEL_ID);
    probeBtn.textContent = isLfm ? (loaded ? "Loaded" : "Load (~1.1 GB)") : "↻";
    syncWebgpuBanner();
  };
  syncConfigVisibility();

  if (settingsHost) {
    settingsHost.replaceChildren(
      providerRow,
      urlRow,
      keyRow,
      lfmNote,
      modelRow,
      customModelRow,
      lfmBar,
      settingsStatusEl,
      askingSub,
      agentModeRow,
      toolSetRow,
      maxStepsRow,
      toolsRow,
      stepsRow,
    );
  }

  // ── AMS-Style Chat Panel ──
  const chatEl = el("div", { class: "assist-chat" });

  const attachChipsEl = el("div", { class: "assist-attach-chips" });
  const renderAttachments = () => {
    attachChipsEl.replaceChildren(
      ...attachments.map((att, idx) =>
        el(
          "span",
          {
            class: `assist-attach-chip${att.dataUrl ? " is-image" : ""}`,
            title: att.dataUrl ? att.label : (att.content || "").slice(0, 400),
          },
          att.dataUrl ? el("img", { class: "assist-attach-thumb", src: att.dataUrl, alt: att.label }) : null,
          el("span", { class: "assist-attach-chip-label" }, att.dataUrl ? att.label : `📎 ${att.label}`),
          el(
            "button",
            {
              type: "button",
              class: "assist-attach-chip-x",
              "aria-label": `Remove ${att.label}`,
              onclick: () => {
                attachments.splice(idx, 1);
                renderAttachments();
              },
            },
            "×",
          ),
        ),
      ),
    );
  };

  const addAttachment = (att) => {
    if (!att) return;
    const existing = attachments.findIndex((a) => a.kind === att.kind && a.label === att.label);
    if (existing >= 0) attachments.splice(existing, 1, att);
    else attachments.push(att);
    renderAttachments();
    textarea.focus();
  };

  const readImageFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "image",
          label: file.name || "image.png",
          mimeType: file.type || "image/png",
          dataUrl: String(reader.result || ""),
          content: "",
        });
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });

  const fileInput = el("input", {
    type: "file",
    hidden: true,
    accept: ".txt,.md,.json,.ino,.cpp,.h,.js,.ts,.css,.html,.svg,.csv,text/*,image/*",
    onchange: async () => {
      const files = [...(fileInput.files || [])];
      fileInput.value = "";
      for (const file of files) {
        try {
          if (file.type?.startsWith("image/") && file.type !== "image/svg+xml") {
            addAttachment(await readImageFile(file));
          } else {
            const text = await file.text();
            addAttachment({
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind: "file",
              label: file.name,
              content: text.slice(0, 24000),
            });
          }
        } catch {
          /* ignore unreadable file */
        }
      }
    },
  });

  const imageInput = el("input", {
    type: "file",
    hidden: true,
    accept: "image/*",
    multiple: true,
    onchange: async () => {
      const files = [...(imageInput.files || [])];
      imageInput.value = "";
      for (const file of files) {
        try {
          addAttachment(await readImageFile(file));
        } catch {
          /* ignore unreadable image */
        }
      }
    },
  });

  const textarea = el("textarea", {
    class: "assist-input",
    rows: "1",
    placeholder: "Ask about this project, or describe what to build…",
  });
  const autoSize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(160, Math.max(24, textarea.scrollHeight))}px`;
  };
  textarea.addEventListener("input", autoSize);

  const attachBtn = el("button", {
    type: "button",
    class: "assist-compose-icon",
    title: "Attach canvas selection, PNG/SVG, error console, code, or image",
    "aria-label": "Attach context",
    html: PLUS_SVG,
    onclick: () => {
      const sel = gatherCanvasSelection(wb);
      const arduinoCode = wb?.ctx?.project?.()?.arduino || "";
      const p5Code = wb?.p5Source?.() || "";
      const buildText = (document.getElementById("buildConsole")?.textContent || "").trim();
      const noticeText =
        !document.getElementById("notice")?.hidden
          ? (document.getElementById("notice")?.textContent || "").trim()
          : "";
      const hasConsole = Boolean(buildText || noticeText);
      showPopupMenu(attachBtn, [
        {
          label: sel ? `Selected: ${sel.label}` : "Selected canvas elements",
          meta: sel ? `${sel.total}` : "none",
          disabled: !sel,
          hint: "Attach the currently selected circuit parts, wires, physics bodies/joints, or drawing marks",
          onClick: () => addAttachment(sel),
        },
        {
          label: "Canvas snapshot",
          meta: "PNG",
          hint: "Capture a live PNG screenshot of the canvas (circuit, physics, drawing & notes)",
          onClick: async () => {
            setChatStatus("Capturing canvas PNG…");
            try {
              const res = await tools.run("p5comp_export", { format: "stage_png" });
              const dataUrl = res?.dataUrl || (res?.base64 ? `data:image/png;base64,${res.base64}` : "");
              if (!dataUrl) throw new Error("Empty PNG");
              addAttachment({
                id: "canvas-png",
                kind: "image",
                label: res?.name || "canvas.png",
                mimeType: "image/png",
                dataUrl,
                content: "",
              });
              setChatStatus("");
            } catch (err) {
              setChatStatus(`PNG capture failed: ${err.message}`);
            }
          },
        },
        {
          label: "Canvas vector",
          meta: "SVG",
          hint: "Attach the circuit canvas as clean SVG markup",
          onClick: async () => {
            setChatStatus("Exporting canvas SVG…");
            try {
              const res = await tools.run("p5comp_export", { format: "svg" });
              addAttachment({
                id: "canvas-svg",
                kind: "svg",
                label: res?.name || "canvas.svg",
                content: String(res?.text || "").slice(0, 32000),
              });
              setChatStatus("");
            } catch (err) {
              setChatStatus(`SVG export failed: ${err.message}`);
            }
          },
        },
        {
          label: "Error / Console log",
          meta: hasConsole ? "live" : "empty",
          disabled: !hasConsole,
          hint: "Attach compiler diagnostics, p5.js runtime errors, and notices",
          onClick: async () => {
            try {
              const res = await tools.run("p5comp_console", { action: "read" });
              addAttachment({
                id: "error-console",
                kind: "console",
                label: "console.log",
                content: res?.text || buildText || noticeText,
              });
            } catch {
              addAttachment({
                id: "error-console",
                kind: "console",
                label: "console.log",
                content: [buildText, noticeText].filter(Boolean).join("\n"),
              });
            }
          },
        },
        "---",
        {
          label: "Arduino code",
          meta: `${arduinoCode.split("\n").length}L`,
          disabled: !arduinoCode.trim(),
          onClick: () =>
            addAttachment({
              id: "arduino-code",
              kind: "arduino",
              label: "sketch.ino",
              content: arduinoCode,
            }),
        },
        {
          label: "p5.js code",
          meta: `${p5Code.split("\n").length}L`,
          disabled: !p5Code.trim(),
          onClick: () =>
            addAttachment({
              id: "p5-code",
              kind: "p5",
              label: "sketch.js",
              content: p5Code,
            }),
        },
        {
          label: "Project state summary",
          meta: "JSON",
          onClick: () =>
            addAttachment({
              id: "project-state",
              kind: "state",
              label: "project-state.txt",
              content: tools.summary(),
            }),
        },
        "---",
        {
          label: "Attach image…",
          meta: "PNG/JPG",
          hint: "Attach any image (or paste / drag-and-drop into the composer)",
          onClick: () => imageInput.click(),
        },
        {
          label: "Attach file…",
          onClick: () => fileInput.click(),
        },
      ]);
    },
  });

  const switchProviderQuick = (providerId, modelId = null) => {
    const spec = ASSISTANT_PROVIDERS.find((p) => p.id === providerId);
    if (!spec) return;
    settings.provider = spec.id;
    settings.baseUrl = spec.defaultUrl;
    settings.model = modelId || spec.defaultModel;
    providerSelect.value = spec.id;
    urlInput.value = settings.baseUrl;
    saveAssistantSettings(settings);
    syncConfigVisibility();
    populateModelPicker(FALLBACK_MODELS[settings.provider] || []);
    refreshModels(true);
  };

  const modelPillBtn = el(
    "button",
    {
      type: "button",
      class: "assist-compose-pill",
      onclick: () => {
        showPopupMenu(modelPillBtn, [
          {
            label: "WebGPU · LFM3-1.7B-pi (Local Q4_K_M)",
            meta: settings.provider === "lfm3" && settings.model === LFM3_LOCAL_PI_MODEL_ID ? "✓" : "Pi",
            hint: "Fused harness-hub/LFM3-1.7B-pi running directly in browser on WebGPU",
            onClick: () => switchProviderQuick("lfm3", LFM3_LOCAL_PI_MODEL_ID),
          },
          {
            label: "WebGPU · LFM3-1.7B (HF Q4_K_M)",
            meta: settings.provider === "lfm3" && settings.model === LFM3_DEFAULT_MODEL_ID ? "✓" : "HF",
            hint: "Run LiquidAI/LFM3-1.7B-GGUF directly in browser on WebGPU",
            onClick: () => switchProviderQuick("lfm3", LFM3_DEFAULT_MODEL_ID),
          },
          {
            label: "WebGPU · LFM3-1.7B (HF QAD Q4_0)",
            meta: settings.provider === "lfm3" && settings.model === LFM3_QAD_MODEL_ID ? "✓" : "Fast",
            hint: "Smaller/faster QAD Q4_0 WebGPU quantization",
            onClick: () => switchProviderQuick("lfm3", LFM3_QAD_MODEL_ID),
          },
          "---",
          {
            label: "Ollama · lfm3-1.7b-pi",
            meta: settings.provider === "ollama" && settings.model === "lfm3-1.7b-pi:latest" ? "✓" : "1.7B",
            onClick: () => switchProviderQuick("ollama", "lfm3-1.7b-pi:latest"),
          },
          {
            label: "Ollama · qwen3.8-9b-coder",
            meta: settings.provider === "ollama" && settings.model === "LisyNeko/qwen3.8-9b-coder:latest" ? "✓" : "9B+Vis",
            onClick: () => switchProviderQuick("ollama", "LisyNeko/qwen3.8-9b-coder:latest"),
          },
          {
            label: "AI / Model settings…",
            onClick: () => openSettings?.(),
          },
        ]);
      },
    },
    pillEngine,
    pillModel,
  );

  const toolsPillBtn = el(
    "button",
    {
      type: "button",
      class: "assist-compose-pill",
      onclick: () => {
        settings.toolsEnabled = !settings.toolsEnabled;
        saveAssistantSettings(settings);
        syncToolsUI();
      },
    },
    "Agent",
  );

  const syncToolsUI = () => {
    const on = Boolean(settings.toolsEnabled);
    toolsPillBtn.classList.toggle("on", on);
    toolsPillBtn.textContent = on ? "Agent" : "Chat";
    toolsPillBtn.title = on
      ? "Agentic mode: can call p5comp tools (circuit, code, physics, drawing). Click to switch to Chat-only."
      : "Chat-only mode: conversational answers without tool calls. Click to switch to Agentic mode.";
    toolsChk.checked = on;
  };
  syncToolsUI();

  const formatTranscript = () => {
    const header = `# p5comp Chat Transcript\n- Provider: ${settings.provider}\n- Model: ${settings.model || "default"}\n- Mode: ${settings.toolsEnabled ? `Agent (${settings.agentMode})` : "Chat"}\n`;
    const body = history
      .map((m) => {
        const who = m.role === "user" ? "## User" : "## Assistant";
        const atts = m.attachments?.length ? `\n_Attachments: ${m.attachments.join(", ")}_` : "";
        const imgs = m.images?.length ? `\n_Images: ${m.images.map((i) => i.label).join(", ")}_` : "";
        const steps = m.steps?.length
          ? `\n\n_Tool calls: ${m.steps.map((s) => `${s.ok ? "✓" : "✕"} ${s.tool}${!s.ok && s.error ? ` (${s.error})` : ""}`).join(", ")}_`
          : "";
        return `${who}${atts}${imgs}\n\n${m.content || ""}${steps}`;
      })
      .join("\n\n---\n\n");
    return `${header}\n${body}\n`;
  };

  const moreBtn = el("button", {
    type: "button",
    class: "assist-compose-icon",
    title: "Chat options",
    "aria-label": "Chat options",
    html: MORE_SVG,
    onclick: () => {
      showPopupMenu(moreBtn, [
        {
          label: "Copy whole transcript",
          meta: "MD",
          disabled: !history.length,
          onClick: async () => {
            try {
              await navigator.clipboard?.writeText(formatTranscript());
              setChatStatus("Transcript copied");
            } catch {
              setChatStatus("Clipboard unavailable");
            }
          },
        },
        {
          label: "AI / Model settings…",
          onClick: () => openSettings?.(),
        },
        "---",
        {
          label: "Clear chat",
          disabled: !history.length,
          onClick: () => {
            history.length = 0;
            piAgent.clear();
            lfm3.resetSession();
            renderChat();
            setChatStatus("");
          },
        },
      ]);
    },
  });

  const sendBtn = el("button", {
    type: "button",
    class: "assist-compose-send",
    title: "Send (Enter)",
    "aria-label": "Send message",
    html: SEND_SVG,
    onclick: () => handleSend(),
  });

  const composeRow = el(
    "div",
    { class: "assist-compose-row" },
    attachBtn,
    modelPillBtn,
    toolsPillBtn,
    el("span", { class: "assist-compose-spacer" }),
    moreBtn,
    sendBtn,
  );

  const composer = el(
    "div",
    { class: "assist-composer" },
    attachChipsEl,
    textarea,
    composeRow,
    fileInput,
    imageInput,
  );

  // Support pasting or dragging images directly into the composer.
  textarea.addEventListener("paste", async (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imgs = items.filter((i) => i.type?.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    for (const item of imgs) {
      const f = item.getAsFile();
      if (f) addAttachment(await readImageFile(f));
    }
  });
  composer.addEventListener("dragover", (e) => {
    if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) {
      e.preventDefault();
      composer.classList.add("drag-over");
    }
  });
  composer.addEventListener("dragleave", () => composer.classList.remove("drag-over"));
  composer.addEventListener("drop", async (e) => {
    composer.classList.remove("drag-over");
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    for (const file of files) {
      try {
        if (file.type?.startsWith("image/") && file.type !== "image/svg+xml") {
          addAttachment(await readImageFile(file));
        } else {
          const text = await file.text();
          addAttachment({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "file",
            label: file.name,
            content: text.slice(0, 24000),
          });
        }
      } catch {
        /* ignore unreadable drop */
      }
    }
  });

  function renderChat() {
    chatEl.replaceChildren();
    if (!history.length) {
      const chips = el(
        "div",
        { class: "assist-starters" },
        ...STARTERS.map((text) =>
          el(
            "button",
            {
              type: "button",
              class: "assist-starter",
              onclick: () => {
                textarea.value = text;
                handleSend();
              },
            },
            text,
          ),
        ),
      );
      chatEl.append(
        el(
          "div",
          { class: "assist-empty" },
          el("b", {}, "Assistant"),
          el(
            "span",
            {},
            "Ask about selected canvas elements, or describe a circuit, sketch, or physics mechanism to build.",
          ),
          chips,
        ),
      );
      return;
    }
    for (const msg of history) {
      const cls = `assist-msg ${msg.role}${msg.error ? " error" : ""}${msg.pending ? " pending" : ""}`;
      const node = el("div", { class: cls });
      if (msg.images?.length) {
        node.append(
          el(
            "div",
            { class: "assist-msg-imgs" },
            ...msg.images.map((img) =>
              el("img", { class: "assist-msg-img", src: img.dataUrl, alt: img.label, title: img.label }),
            ),
          ),
        );
      }
      if (msg.attachments?.length) {
        node.append(
          el(
            "div",
            { class: "assist-msg-atts" },
            ...msg.attachments.map((label) =>
              el("span", { class: "assist-msg-att" }, `📎 ${label}`),
            ),
          ),
        );
      }
      if (msg.thinking?.trim()) {
        node.append(
          el(
            "details",
            { class: "assist-think" },
            el("summary", {}, "Thought"),
            el("div", { class: "assist-think-body" }, msg.thinking.trim()),
          ),
        );
      }
      if (msg.content) {
        if (msg.role === "assistant" && !msg.pending && !msg.error) {
          const md = el("div", { class: "assist-md" });
          md.innerHTML = lessonHTML(msg.content, "markdown");
          // Add "+ Canvas" and "Copy SVG" hover actions on every Pele diagram
          for (const diag of md.querySelectorAll(".pele-diagram")) {
            const code = diag.dataset.mermaid || "";
            if (!code) continue;
            const actions = el(
              "div",
              { class: "pele-diagram-actions" },
              el(
                "button",
                {
                  type: "button",
                  class: "pele-action-btn",
                  title: "Place this diagram on the canvas",
                  onclick: async () => {
                    try {
                      await tools.run("p5comp_diagram", { code, mode: "note" });
                      setChatStatus("Diagram placed on canvas");
                    } catch (err) {
                      setChatStatus(`Could not place diagram: ${err.message}`);
                    }
                  },
                },
                "+ Canvas",
              ),
              el(
                "button",
                {
                  type: "button",
                  class: "pele-action-btn",
                  title: "Copy standalone SVG",
                  onclick: async () => {
                    try {
                      const { svg } = renderDiagramSVG(code, { standalone: true });
                      await navigator.clipboard?.writeText(svg);
                      setChatStatus("SVG copied");
                    } catch {
                      /* ignore clipboard errors */
                    }
                  },
                },
                "Copy SVG",
              ),
            );
            diag.prepend(actions);
          }
          // Add Copy button pinned to the top-right corner on hover for every fenced code block
          for (const pre of md.querySelectorAll("pre")) {
            const codeEl = pre.querySelector("code");
            const rawCode = codeEl?.textContent || pre.textContent || "";
            if (!rawCode.trim()) continue;
            const wrap = el("div", { class: "assist-code-wrap" });
            pre.replaceWith(wrap);
            const btn = el(
              "button",
              {
                type: "button",
                class: "assist-code-copy",
                title: "Copy code",
                onclick: async () => {
                  try {
                    await navigator.clipboard?.writeText(rawCode);
                    btn.textContent = "Copied";
                    setTimeout(() => {
                      btn.textContent = "Copy";
                    }, 1400);
                  } catch {
                    setChatStatus("Clipboard unavailable");
                  }
                },
              },
              "Copy",
            );
            wrap.append(pre, btn);
          }
          node.append(md);
          const copyBtn = el(
            "button",
            {
              type: "button",
              class: "assist-copy-btn",
              title: "Copy response (Markdown)",
              onclick: async () => {
                try {
                  await navigator.clipboard?.writeText(msg.content || "");
                  copyBtn.textContent = "Copied";
                  setTimeout(() => {
                    copyBtn.textContent = "Copy";
                  }, 1400);
                } catch {
                  setChatStatus("Clipboard unavailable");
                }
              },
            },
            "Copy",
          );
          node.append(el("div", { class: "assist-msg-actions" }, copyBtn));
        } else {
          node.append(el("div", { class: "assist-msg-text" }, msg.content));
        }
      }
      if (settings.showSteps && msg.steps?.length) {
        node.append(
          el(
            "div",
            { class: "assist-steps" },
            ...msg.steps.map((s) =>
              el(
                "span",
                {
                  class: `assist-step${s.ok ? "" : " fail"}`,
                  title: s.ok ? JSON.stringify(s.result) : s.error,
                },
                s.ok
                  ? `✓ ${s.tool}`
                  : `✕ ${s.tool}${s.error ? ` — ${String(s.error).slice(0, 60)}` : ""}`,
              ),
            ),
          ),
        );
      }
      chatEl.append(node);
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function handleDirectTool(line) {
    const match = /^!([a-z0-9_]+)(?:\s+([\s\S]*))?$/i.exec(line.trim());
    if (!match) return false;
    const [, name, rawArgs] = match;
    let args = {};
    if (rawArgs?.trim()) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = { query: rawArgs.trim() };
      }
    }
    history.push({ role: "user", content: line });
    try {
      const result = await tools.run(name, args);
      history.push({
        role: "assistant",
        content: JSON.stringify(result, null, 2),
        steps: [{ tool: name, ok: true, result }],
      });
    } catch (err) {
      history.push({
        role: "assistant",
        content: err.message,
        error: true,
        steps: [{ tool: name, ok: false, error: err.message }],
      });
    }
    renderChat();
    return true;
  }

  function setRunningUI(running) {
    sendBtn.innerHTML = running ? STOP_SVG : SEND_SVG;
    sendBtn.classList.toggle("stop", running);
    sendBtn.title = running ? "Stop" : "Send (Enter)";
  }

  async function handleSend() {
    if (abortCtrl) {
      abortCtrl.abort();
      abortCtrl = null;
      setRunningUI(false);
      setChatStatus("Stopped");
      return;
    }
    const text = textarea.value.trim();
    if (!text && !attachments.length) return;
    textarea.value = "";
    autoSize();

    if (text.startsWith("/") && !attachments.length) {
      const cmd = text.split(/\s+/)[0].toLowerCase();
      if (cmd === "/new" || cmd === "/clear") {
        history.length = 0;
        piAgent.clear();
        lfm3.resetSession();
        renderChat();
        setChatStatus("");
        return;
      }
      if (cmd === "/webgpu") {
        switchProviderQuick("lfm3", LFM3_DEFAULT_MODEL_ID);
        history.push({ role: "assistant", content: "Switched to local WebGPU (LFM3-1.7B). Click Load WebGPU or run /load to initialize." });
        renderChat();
        return;
      }
      if (cmd === "/load") {
        if (settings.provider !== "lfm3") switchProviderQuick("lfm3", LFM3_DEFAULT_MODEL_ID);
        await triggerWebgpuLoad();
        return;
      }
      if (cmd === "/agent" || cmd === "/chat") {
        settings.toolsEnabled = cmd === "/agent";
        saveAssistantSettings(settings);
        syncToolsUI();
        history.push({
          role: "assistant",
          content: settings.toolsEnabled
            ? "Switched to Agent mode (Pi tools enabled)."
            : "Switched to Chat mode (conversational only, no tool edits).",
        });
        renderChat();
        return;
      }
      if (cmd === "/help") {
        history.push({
          role: "assistant",
          content:
            "Commands:\n/webgpu — switch to local WebGPU LFM3-1.7B\n/load — download & load WebGPU model\n/agent — enable agentic tool use\n/chat — chat-only mode (no tools)\n/new — start a new chat & clear KV cache\n!tool {json} — run any p5comp tool directly",
        });
        renderChat();
        return;
      }
    }

    if (text.startsWith("!") && !attachments.length && (await handleDirectTool(text))) return;

    const sentAtts = attachments.splice(0, attachments.length);
    renderAttachments();

    const textAtts = sentAtts.filter((a) => !a.dataUrl);
    const imageAtts = sentAtts
      .filter((a) => a.dataUrl)
      .map((a) => ({ label: a.label, mimeType: a.mimeType || "image/png", dataUrl: a.dataUrl }));

    let promptForModel = text || (imageAtts.length ? "Inspect the attached image(s)." : "Inspect the attached context.");
    if (textAtts.length) {
      const ctxBlock = textAtts
        .map((a) => `--- Attached ${a.kind}: ${a.label} ---\n${a.content}`)
        .join("\n\n");
      promptForModel = `${ctxBlock}\n\n${promptForModel}`;
    }

    history.push({
      role: "user",
      content: text,
      modelContent: promptForModel,
      attachments: textAtts.map((a) => a.label),
      images: imageAtts,
    });
    const pendingMsg = { role: "assistant", content: "Thinking…", pending: true, steps: [] };
    history.push(pendingMsg);
    renderChat();

    abortCtrl = new AbortController();
    setRunningUI(true);
    setChatStatus(`Running ${settings.model || settings.provider}…`);

    try {
      if (settings.toolsEnabled && settings.agentMode !== "json") {
        piAgent.configure({
          instructions: buildPiInstructions(tools.summary()),
          tools: tools.piSpecs(resolvePiToolSet()),
          maxRounds: settings.maxSteps || 14,
        });
        let streamed = "";
        let thoughts = "";
        await piAgent.send(
          promptForModel,
          (ev) => {
            if (ev.type === "turn_start") {
              thoughts = "";
              setChatStatus(`Pi round ${ev.round} · ${settings.model || settings.provider}…`);
            } else if (ev.type === "activity") {
              if (ev.activity.kind === "reading") {
                setChatStatus(`Reading context (${Math.round(ev.activity.fraction * 100)}%)…`);
              } else if (ev.activity.kind === "thinking") {
                thoughts += ev.activity.delta;
                pendingMsg.thinking = thoughts;
                const tail = thoughts.slice(-160).replace(/\s+/g, " ").trim().split(" ").slice(-8).join(" ");
                setChatStatus(tail ? `Thinking: ${tail}` : "Thinking…");
              }
            } else if (ev.type === "message_update") {
              streamed += ev.delta;
              pendingMsg.content = streamed;
              pendingMsg.pending = false;
              setChatStatus("Writing…");
              renderChat();
            } else if (ev.type === "message_end") {
              if (ev.message.content?.trim()) {
                streamed = ev.message.content;
                pendingMsg.content = streamed;
                pendingMsg.pending = false;
                renderChat();
              }
            } else if (ev.type === "tool_execution_start") {
              setChatStatus(`Running ${ev.label}…`);
            } else if (ev.type === "tool_execution_end") {
              pendingMsg.steps.push({
                tool: ev.label,
                ok: ev.ok,
                result: ev.result,
                error: ev.ok ? undefined : ev.summary,
              });
              renderChat();
            } else if (ev.type === "agent_end") {
              pendingMsg.pending = false;
              if (ev.reason === "error") {
                pendingMsg.content = ev.error || "Pi agent error";
                pendingMsg.error = true;
              } else if (ev.reason === "cancelled") {
                if (!streamed.trim()) pendingMsg.content = "Stopped.";
              } else if (ev.reason === "max_rounds" && !streamed.trim()) {
                const okCount = pendingMsg.steps.filter((s) => s.ok).length;
                const failCount = pendingMsg.steps.length - okCount;
                pendingMsg.content = okCount
                  ? `Completed ${okCount} step${okCount === 1 ? "" : "s"}${failCount ? ` (${failCount} failed)` : ""} before reaching the step limit (${settings.maxSteps || 14}). Say "continue" to finish.`
                  : `Reached step limit (${settings.maxSteps || 14}) without completing the task${failCount ? ` (${failCount} tool error${failCount === 1 ? "" : "s"} — see chips below)` : ""}.`;
              } else if (ev.reason === "silent" && !streamed.trim()) {
                pendingMsg.content = pendingMsg.steps.length
                  ? `Completed ${pendingMsg.steps.length} tool action${pendingMsg.steps.length === 1 ? "" : "s"}.`
                  : "No response generated.";
              }
              setChatStatus("");
              renderChat();
            }
          },
          abortCtrl.signal,
          { images: imageAtts },
        );
      } else if (settings.toolsEnabled) {
        const result = await runAgentTurn({
          complete: (messages, opts) =>
            completeChat(settings, messages, { lfm3, signal: opts.signal }),
          tools,
          getStateSummary: () => tools.summary(),
          history: history
            .slice(0, -2)
            .map((m) => ({
              role: m.role,
              content: m.modelContent || m.content,
              ...(m.images?.length ? { images: m.images } : {}),
            })),
          userMessage: promptForModel,
          maxSteps: settings.maxSteps || 6,
          signal: abortCtrl.signal,
          onStep: (step) => {
            pendingMsg.steps.push(step);
            renderChat();
          },
        });
        pendingMsg.content = result.say;
        pendingMsg.pending = false;
        setChatStatus(
          result.executed.length
            ? `Done · ${result.executed.length} tool action${result.executed.length === 1 ? "" : "s"}`
            : "",
        );
      } else {
        const messages = [
          {
            role: "system",
            content: `You are a helpful engineering assistant inside p5comp (Arduino + p5.js + 2D physics simulator). Answer clearly and concisely using Markdown, KaTeX math ($...$), and \`\`\`mermaid diagrams when helpful.\n\nCurrent workspace state:\n${tools.summary()}`,
          },
          ...history
            .slice(0, -2)
            .slice(-10)
            .map((m) => ({
              role: m.role,
              content: m.modelContent || m.content,
              ...(m.images?.length ? { images: m.images } : {}),
            })),
          {
            role: "user",
            content: promptForModel,
            ...(imageAtts.length ? { images: imageAtts } : {}),
          },
        ];
        let streamed = "";
        let thoughts = "";
        const reply = await completeChat(settings, messages, {
          lfm3,
          signal: abortCtrl.signal,
          onChunk: (delta) => {
            streamed += delta;
            pendingMsg.content = streamed;
            pendingMsg.pending = false;
            setChatStatus("Writing…");
            renderChat();
          },
          onActivity: (act) => {
            if (act.kind === "reading") {
              setChatStatus(`Reading context (${Math.round(act.fraction * 100)}%)…`);
            } else if (act.kind === "thinking") {
              thoughts += act.delta;
              pendingMsg.thinking = thoughts;
              const tail = thoughts.slice(-160).replace(/\s+/g, " ").trim().split(" ").slice(-8).join(" ");
              setChatStatus(tail ? `Thinking: ${tail}` : "Thinking…");
            }
          },
        });
        pendingMsg.content = reply || streamed;
        pendingMsg.pending = false;
        setChatStatus("");
      }
    } catch (err) {
      pendingMsg.content = err.message || String(err);
      pendingMsg.pending = false;
      pendingMsg.error = true;
      setChatStatus("");
    } finally {
      abortCtrl = null;
      setRunningUI(false);
      renderChat();
    }
  }

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  const panel = el("div", { class: "assist-panel" }, chatStatusEl, chatEl, chatWebgpuBanner, composer);
  root.append(panel);
  populateModelPicker(FALLBACK_MODELS[settings.provider] || []);
  refreshModels(true);
  renderChat();

  const getState = () => {
    const last = history.at(-1) || null;
    return {
      settings: {
        provider: settings.provider,
        model: settings.model,
        baseUrl: settings.baseUrl,
        agentMode: settings.agentMode,
        toolSet: settings.toolSet,
        toolsEnabled: settings.toolsEnabled,
        showSteps: settings.showSteps,
        maxSteps: settings.maxSteps,
      },
      webgpuReady: lfm3.ready,
      webgpuModel: lfm3.readyModel || null,
      busy: Boolean(abortCtrl),
      status: chatStatusEl.textContent || "",
      historyLength: history.length,
      lastMessage: last
        ? {
            role: last.role,
            content: last.content,
            thinking: last.thinking || "",
            error: Boolean(last.error),
            steps: last.steps || [],
          }
        : null,
    };
  };

  async function command(a = {}) {
    if (a.action === "get") return getState();

    if (a.action === "clear") {
      if (abortCtrl) abortCtrl.abort();
      history.length = 0;
      piAgent.clear();
      lfm3.resetSession();
      renderChat();
      setChatStatus("");
      return getState();
    }

    if (a.action === "models") {
      const targetProvider = a.provider || settings.provider;
      if (targetProvider === "lfm3") {
        return { ok: true, provider: "lfm3", models: LFM3_MODELS.map((m) => m.id) };
      }
      const spec = ASSISTANT_PROVIDERS.find((p) => p.id === targetProvider);
      const probeCfg = {
        ...settings,
        provider: targetProvider,
        baseUrl: a.baseUrl ?? (targetProvider === settings.provider ? settings.baseUrl : spec?.defaultUrl || ""),
      };
      const r = await probeModels(probeCfg);
      if (targetProvider === settings.provider && r.ok && r.models?.length) {
        populateModelPicker(r.models);
      }
      return { ok: r.ok, provider: targetProvider, models: r.models || [], error: r.error || null };
    }

    if (a.action === "configure") {
      if (a.provider && a.provider !== settings.provider) {
        const spec = ASSISTANT_PROVIDERS.find((p) => p.id === a.provider);
        if (!spec) throw new Error(`Unknown provider: ${a.provider}`);
        settings.provider = spec.id;
        settings.baseUrl = a.baseUrl ?? spec.defaultUrl;
        settings.model = a.model ?? spec.defaultModel;
        providerSelect.value = spec.id;
        urlInput.value = settings.baseUrl;
      } else {
        if (a.baseUrl !== undefined) {
          settings.baseUrl = String(a.baseUrl).trim();
          urlInput.value = settings.baseUrl;
        }
        if (a.model !== undefined) settings.model = String(a.model).trim();
      }
      if (a.apiKey !== undefined) {
        settings.apiKey = String(a.apiKey).trim();
        keyInput.value = settings.apiKey;
      }
      if (a.agentMode) {
        settings.agentMode = a.agentMode === "json" ? "json" : "pi";
        agentModeSelect.value = settings.agentMode;
        toolSetRow.hidden = settings.agentMode !== "pi";
      }
      if (a.toolSet && ["auto", "full", "small"].includes(a.toolSet)) {
        settings.toolSet = a.toolSet;
        toolSetSelect.value = a.toolSet;
      }
      if (typeof a.toolsEnabled === "boolean") settings.toolsEnabled = a.toolsEnabled;
      if (typeof a.showSteps === "boolean") {
        settings.showSteps = a.showSteps;
        stepsChk.checked = a.showSteps;
      }
      if (Number.isFinite(Number(a.maxSteps))) {
        settings.maxSteps = Math.max(1, Math.min(24, Math.round(Number(a.maxSteps))));
        settings.maxStepsManual = true;
        maxStepsInput.value = String(settings.maxSteps);
      }
      saveAssistantSettings(settings);
      syncConfigVisibility();
      syncToolsUI();
      populateModelPicker(
        settings.provider === "lfm3"
          ? LFM3_MODELS.map((m) => m.id)
          : settings.model
            ? [settings.model, ...availableModels]
            : availableModels,
      );
      piAgent.configure({
        tools: tools.piSpecs(resolvePiToolSet()),
        maxRounds: settings.maxSteps || 14,
      });
      renderChat();
      return getState();
    }

    if (a.action === "load") {
      if (settings.provider === "lfm3") {
        await triggerWebgpuLoad();
        return getState();
      }
      await refreshModels(false);
      return getState();
    }

    if (a.action === "send") {
      const prompt = String(a.prompt || "").trim();
      if (!prompt) throw new Error("prompt is required.");
      if (a.clear) {
        if (abortCtrl) abortCtrl.abort();
        history.length = 0;
        piAgent.clear();
        lfm3.resetSession();
      }
      textarea.value = prompt;
      const runPromise = handleSend();
      if (a.wait === false) return { started: true, historyLength: history.length };
      await runPromise;
      const last = history.at(-1) || {};
      return {
        reply: last.content || "",
        thinking: last.thinking || "",
        error: Boolean(last.error),
        steps: last.steps || [],
        status: chatStatusEl.textContent || "",
        historyLength: history.length,
      };
    }

    throw new Error(`Unsupported assistant action: ${a.action}`);
  }

  return { command, getState };
}
