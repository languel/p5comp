/**
 * Intelligent Assistant Inspector Panel for p5comp.
 * Supports Ollama (Local), LFM3-1.7B (Browser WebGPU via vendored Lfm3ForCausalLM.js),
 * OpenAI-compatible, OpenRouter, Gemini, and Anthropic, with a real model picker dropdown
 * per provider and a Pi-style iterative tool loop.
 */

import "./assistant.css";
import { createAssistantTools } from "./tools.js";
import { runAgentTurn } from "./protocol.js";
import {
  ASSISTANT_PROVIDERS,
  LFM3_DEFAULT_MODEL_ID,
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
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};

const STARTERS = [
  "Build a servo crank-slider controlled by a potentiometer",
  "Build a gear motor four-bar linkage and run it",
  "Wire a red LED on pin 13 with a 220Ω resistor and blink it",
  "Load the servo garden example",
];

const FALLBACK_MODELS = {
  ollama: [],
  lfm3: [LFM3_DEFAULT_MODEL_ID],
  openai: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
  openrouter: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4", "openai/gpt-4o-mini"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
  anthropic: ["claude-sonnet-4-0", "claude-3-5-haiku-latest"],
};

const CUSTOM_SENTINEL = "__custom__";

export function mountAssistantPanel(root, wb) {
  const tools = createAssistantTools(wb);
  let settings = loadAssistantSettings();
  const history = [];
  let abortCtrl = null;
  let availableModels = [];

  const statusEl = el("div", { class: "assist-status" });
  const setStatus = (msg) => {
    statusEl.textContent = msg || "";
  };

  const lfm3 = new Lfm3Client((msg) => {
    if (msg.status === "loading") setStatus(msg.message || "Loading WebGPU model…");
    else if (msg.status === "ready") setStatus(msg.message || "LFM3-1.7B ready on WebGPU");
    else if (msg.status === "error") setStatus(`WebGPU error: ${msg.error || msg.message}`);
  });

  const modelSelect = el("select", {
    class: "assist-model",
    "aria-label": "Select model",
    onchange: () => {
      const v = modelSelect.value;
      if (v === CUSTOM_SENTINEL) {
        customModelRow.hidden = false;
        configBox.hidden = false;
        customModelInput.focus();
        return;
      }
      customModelRow.hidden = true;
      settings.model = v;
      customModelInput.value = v;
      saveAssistantSettings(settings);
    },
  });

  function populateModelPicker(models = []) {
    availableModels = [...new Set(models.filter(Boolean))];
    const list = availableModels.length
      ? availableModels
      : FALLBACK_MODELS[settings.provider] || [];
    const options = [];
    if (!list.length) {
      options.push(el("option", { value: "" }, "No models detected — click ↻"));
    } else {
      // Ensure current saved model is either selected from the list or kept if custom.
      if (settings.model && !list.includes(settings.model)) {
        if (availableModels.length) {
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
        options.push(el("option", { value: m, selected: m === settings.model }, m));
      }
    }
    options.push(el("option", { value: CUSTOM_SENTINEL }, "Custom model…"));
    modelSelect.replaceChildren(...options);
    if (settings.model && [...modelSelect.options].some((o) => o.value === settings.model)) {
      modelSelect.value = settings.model;
    }
    customModelInput.value = settings.model || "";
  }

  async function refreshModels(silent = false) {
    if (settings.provider === "lfm3") {
      populateModelPicker([LFM3_DEFAULT_MODEL_ID]);
      return;
    }
    if (!silent) setStatus(`Listing ${settings.provider} models…`);
    const r = await probeModels(settings);
    if (r.ok && r.models.length) {
      populateModelPicker(r.models);
      if (!silent) setStatus(`${r.models.length} model${r.models.length === 1 ? "" : "s"} available`);
    } else {
      populateModelPicker([]);
      if (!silent) setStatus(r.error || "No models found");
    }
  }

  const providerSelect = el(
    "select",
    {
      class: "assist-provider",
      "aria-label": "Assistant model provider",
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
      title: "Refresh models (or download/load LFM3-1.7B on WebGPU)",
      onclick: async () => {
        if (settings.provider === "lfm3") {
          setStatus("Loading LFM3-1.7B on WebGPU…");
          try {
            await lfm3.load(settings.model || LFM3_DEFAULT_MODEL_ID);
          } catch (err) {
            setStatus(`Load failed: ${err.message}`);
          }
          return;
        }
        await refreshModels(false);
      },
    },
    "↻",
  );

  const configBox = el("div", { class: "assist-config", hidden: true });
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
  const urlRow = el("label", {}, "Base URL", urlInput);
  const keyRow = el("label", {}, "API Key", keyInput);
  const customModelRow = el("label", { hidden: true }, "Custom model", customModelInput);
  configBox.append(urlRow, keyRow, customModelRow);

  const syncConfigVisibility = () => {
    const isLfm = settings.provider === "lfm3";
    urlRow.hidden = isLfm;
    keyRow.hidden = isLfm;
    probeBtn.textContent = isLfm ? "Load" : "↻";
  };
  syncConfigVisibility();

  const cfgBtn = el(
    "button",
    {
      type: "button",
      title: "Configure endpoint, API key, or custom model",
      onclick: () => {
        configBox.hidden = !configBox.hidden;
      },
    },
    "⚙",
  );

  const clearBtn = el(
    "button",
    {
      type: "button",
      title: "Clear chat history",
      onclick: () => {
        history.length = 0;
        renderChat();
        setStatus("");
      },
    },
    "Clear",
  );

  const header = el(
    "div",
    { class: "assist-header" },
    providerSelect,
    modelSelect,
    probeBtn,
    cfgBtn,
    clearBtn,
  );

  const chatEl = el("div", { class: "assist-chat" });
  const textarea = el("textarea", {
    rows: "2",
    placeholder: "Ask to build a circuit, sketch, or mechanism… (!tool {args} runs a tool directly)",
  });
  const sendBtn = el("button", { type: "button", onclick: () => handleSend() }, "Send");
  const composer = el("div", { class: "assist-composer" }, textarea, sendBtn);

  function renderChat() {
    chatEl.replaceChildren();
    if (!history.length) {
      const chips = el(
        "div",
        { class: "assist-chips" },
        ...STARTERS.map((text) =>
          el(
            "button",
            {
              type: "button",
              class: "assist-chip",
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
          el("strong", {}, "p5comp Assistant"),
          el(
            "span",
            {},
            "Describe a circuit, Arduino sketch, p5.js visual, or physics mechanism. Uses local Ollama, in-browser LFM3-1.7B WebGPU, or API models through a Pi-style tool loop.",
          ),
          chips,
        ),
      );
      return;
    }
    for (const msg of history) {
      const node = el("div", { class: `assist-msg ${msg.role}${msg.error ? " error" : ""}` }, msg.content);
      if (msg.steps?.length) {
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
                `${s.ok ? "✓" : "✕"} ${s.tool}`,
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

  async function handleSend() {
    if (abortCtrl) {
      abortCtrl.abort();
      abortCtrl = null;
      sendBtn.textContent = "Send";
      sendBtn.classList.remove("stop");
      setStatus("Stopped");
      return;
    }
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = "";

    if (text.startsWith("!") && (await handleDirectTool(text))) return;

    history.push({ role: "user", content: text });
    const pendingMsg = { role: "assistant", content: "Thinking…", steps: [] };
    history.push(pendingMsg);
    renderChat();

    abortCtrl = new AbortController();
    sendBtn.textContent = "Stop";
    sendBtn.classList.add("stop");
    setStatus(`Running ${settings.model || settings.provider}…`);

    try {
      const result = await runAgentTurn({
        complete: (messages, opts) =>
          completeChat(settings, messages, { lfm3, signal: opts.signal }),
        tools,
        getStateSummary: () => tools.summary(),
        history: history.slice(0, -2),
        userMessage: text,
        maxSteps: 4,
        signal: abortCtrl.signal,
        onStep: (step) => {
          pendingMsg.steps.push(step);
          renderChat();
        },
      });
      pendingMsg.content = result.say;
      setStatus(result.executed.length ? `Done · ${result.executed.length} tool action${result.executed.length === 1 ? "" : "s"}` : "Done");
    } catch (err) {
      pendingMsg.content = err.message || String(err);
      pendingMsg.error = true;
      setStatus("Error");
    } finally {
      abortCtrl = null;
      sendBtn.textContent = "Send";
      sendBtn.classList.remove("stop");
      renderChat();
    }
  }

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  const panel = el("div", { class: "assist-panel" }, header, configBox, statusEl, chatEl, composer);
  root.append(panel);
  populateModelPicker(FALLBACK_MODELS[settings.provider] || []);
  refreshModels(true);
  renderChat();
}
