/**
 * Unified model provider client for p5comp's Assistant:
 * 1. Ollama (Local) — queries /api/tags (filtering out embedding-only models) + /v1/chat/completions
 * 2. LFM3-1.7B (Browser WebGPU) — uses vendored public/vendor/Lfm3ForCausalLM.js + LiquidAI/LFM3-1.7B-GGUF
 *    (matching ~/dev/seloai/src/agent/piModel.ts)
 * 3. Cloud APIs (OpenAI-compatible, OpenRouter, Gemini, Anthropic)
 */

import { basePath } from "../../shared/basePath.js";

export const LFM3_LOCAL_PI_MODEL_ID = "/models/LFM3-1.7B-pi-Q4_K_M.gguf";
export const LFM3_DEFAULT_MODEL_ID = "LiquidAI/LFM3-1.7B-GGUF";
export const LFM3_QAD_MODEL_ID = "LiquidAI/LFM3-1.7B-GGUF::LFM3-1.7B-QAD-Q4_0.gguf";
export const LFM3_MODELS = [
  { id: LFM3_LOCAL_PI_MODEL_ID, label: "LFM3-1.7B-pi · Q4_K_M (Local WebGPU)" },
  { id: LFM3_DEFAULT_MODEL_ID, label: "LFM3-1.7B · Q4_K_M (HF WebGPU)" },
  { id: LFM3_QAD_MODEL_ID, label: "LFM3-1.7B · QAD Q4_0 (HF WebGPU)" },
];

export function parseLfm3ModelSpec(modelId = LFM3_DEFAULT_MODEL_ID) {
  const raw = String(modelId || LFM3_DEFAULT_MODEL_ID);
  if (raw.includes("::")) {
    const [repo, file] = raw.split("::");
    return { repo: repo || LFM3_DEFAULT_MODEL_ID, file: file || undefined };
  }
  if (/^(\/|\.|https?:)/i.test(raw) && raw.toLowerCase().endsWith(".gguf")) {
    const clean = raw.startsWith("/") ? basePath(raw.slice(1)) : raw;
    return { repo: clean, file: raw.split("/").pop() };
  }
  return { repo: raw, file: undefined };
}

export const ASSISTANT_PROVIDERS = [
  { id: "ollama", label: "Ollama (Local)", defaultUrl: "http://localhost:11434/v1", defaultModel: "" },
  { id: "lfm3", label: "LFM3-1.7B (Browser WebGPU)", defaultUrl: "", defaultModel: LFM3_DEFAULT_MODEL_ID },
  { id: "openai", label: "OpenAI-compatible", defaultUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { id: "openrouter", label: "OpenRouter", defaultUrl: "https://openrouter.ai/api/v1", defaultModel: "google/gemini-2.5-flash" },
  { id: "gemini", label: "Gemini API", defaultUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-2.5-flash" },
  { id: "anthropic", label: "Anthropic", defaultUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-0" },
];

const SETTINGS_KEY = "p5comp.assistant.settings.v1";

export function loadAssistantSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const provider = ASSISTANT_PROVIDERS.some((p) => p.id === raw.provider) ? raw.provider : "ollama";
    const spec = ASSISTANT_PROVIDERS.find((p) => p.id === provider);
    // Migrate any stale ONNX or LoRA-only model id to LiquidAI/LFM3-1.7B-GGUF.
    let model = raw.model || spec.defaultModel;
    if (
      provider === "lfm3" &&
      (!model || model.includes("LFM2.5") || model.includes("ONNX") || model.includes("harness-hub/LFM3-1.7B-pi"))
    ) {
      model = LFM3_DEFAULT_MODEL_ID;
    }
    return {
      provider,
      baseUrl: raw.baseUrl ?? spec.defaultUrl,
      model,
      apiKey: raw.apiKey || "",
      toolsEnabled: raw.toolsEnabled !== false,
      showSteps: raw.showSteps !== false,
      maxSteps: raw.maxStepsManual
        ? Math.max(1, Math.min(24, Number(raw.maxSteps) || 14))
        : Math.max(14, Math.min(24, Number(raw.maxSteps) || 14)),
      maxStepsManual: Boolean(raw.maxStepsManual),
      agentMode: raw.agentMode === "json" ? "json" : "pi",
      toolSet: ["auto", "full", "small"].includes(raw.toolSet) ? raw.toolSet : "auto",
    };
  } catch {
    return {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "",
      apiKey: "",
      toolsEnabled: true,
      showSteps: true,
      maxSteps: 14,
      agentMode: "pi",
      toolSet: "auto",
    };
  }
}

export function saveAssistantSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore storage quota */
  }
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

let resolvedOllamaRoot = null;

function ollamaCandidateRoots(baseUrl) {
  const clean = normalizeUrl(baseUrl).replace(/\/v1$/, "");
  const isLocal = !clean || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean) || clean.endsWith("/_ollama");
  const out = [];
  if (isLocal && typeof location !== "undefined" && /^https?:$/i.test(location.protocol)) {
    // Prefer same-origin Vite proxy first (avoids Chrome Local Network Access / CORS blocks).
    out.push(`${location.origin}/_ollama`);
  }
  if (clean && !out.includes(clean)) out.push(clean);
  if (isLocal) {
    for (const fallback of ["http://localhost:11434", "http://127.0.0.1:11434"]) {
      if (!out.includes(fallback)) out.push(fallback);
    }
  }
  return out;
}

export async function probeModels({ provider, baseUrl, apiKey }) {
  if (provider === "lfm3") {
    return {
      ok: true,
      models: [LFM3_DEFAULT_MODEL_ID],
    };
  }

  const clean = normalizeUrl(baseUrl);

  if (provider === "ollama") {
    const roots = ollamaCandidateRoots(baseUrl);
    let lastError = "offline";
    for (const root of roots) {
      try {
        const res = await fetch(`${root}/api/tags`);
        if (res.ok) {
          const ct = res.headers.get("content-type") || "";
          if (!ct.includes("json")) continue;
          const data = await res.json();
          const raw = Array.isArray(data?.models) ? data.models : [];
          // Keep chat/completion models (filter out embedding-only or speech-only models when capabilities are reported).
          const chatModels = raw.filter((m) => {
            const caps = Array.isArray(m.capabilities) ? m.capabilities : null;
            if (!caps || !caps.length) return !/embed/i.test(String(m.name || ""));
            return caps.includes("completion");
          });
          const scoreOllama = (m) => {
            const name = String(m.name || m.model || "");
            const caps = Array.isArray(m.capabilities) ? m.capabilities : [];
            let s = 0;
            if (caps.includes("tools")) s += 40;
            if (caps.includes("vision")) s += 10;
            if (/lfm3.*pi|qwen|coder|inkling|bonsai|lfm2\.5|claude|gpt|mistral|llama/i.test(name)) s += 20;
            if (/lfm3.*pi/i.test(name)) s += 15;
            if (/peline|humanizer|ocr|phonon|embed/i.test(name)) s -= 30;
            return s;
          };
          const list = (chatModels.length ? chatModels : raw)
            .slice()
            .sort((a, b) => scoreOllama(b) - scoreOllama(a))
            .map((m) => String(m.name || m.model || ""))
            .filter(Boolean);
          resolvedOllamaRoot = root;
          return { ok: true, models: list };
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err?.message || "network error";
      }
      try {
        const res = await fetch(`${root}/v1/models`);
        if (res.ok) {
          const ct = res.headers.get("content-type") || "";
          if (!ct.includes("json")) continue;
          const data = await res.json();
          const ids = (data.data || []).map((m) => String(m.id)).filter(Boolean);
          resolvedOllamaRoot = root;
          return { ok: true, models: ids };
        }
      } catch {
        /* try next root */
      }
    }
    return {
      ok: false,
      models: [],
      error: `Cannot reach Ollama (${lastError}). If using dev server, restart Vite to enable /_ollama proxy.`,
    };
  }

  if (provider === "gemini") {
    if (!apiKey) return { ok: true, models: ["gemini-2.5-flash", "gemini-2.5-pro"] };
    try {
      const res = await fetch(`${clean}/models?key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
      const data = await res.json();
      return {
        ok: true,
        models: (data.models || [])
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter(Boolean),
      };
    } catch (err) {
      return { ok: false, models: [], error: err?.message || "Gemini unreachable" };
    }
  }

  if (provider === "anthropic") {
    return { ok: true, models: ["claude-sonnet-4-0", "claude-3-5-haiku-latest"] };
  }

  try {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const res = await fetch(`${clean}/models`, { headers });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => String(m.id)).filter(Boolean);
      return { ok: true, models: ids };
    }
    return { ok: false, models: [], error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, models: [], error: err?.message || `Could not reach ${clean}` };
  }
}

/**
 * In-browser WebGPU LFM3-1.7B client using vendored public/vendor/Lfm3ForCausalLM.js
 * and LiquidAI/LFM3-1.7B-GGUF (same runtime & model as ~/dev/seloai/src/agent/piModel.ts).
 */
export class Lfm3Client {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.model = null;
    this.session = null;
    this.readyModel = "";
    this.loading = null;
  }

  async load(modelId = LFM3_DEFAULT_MODEL_ID) {
    if (this.session && this.readyModel === modelId) {
      this.onStatus({ status: "ready", fraction: 1, message: "LFM3-1.7B ready on WebGPU" });
      return;
    }
    if (this.loading) return this.loading;
    const { repo, file } = parseLfm3ModelSpec(modelId);
    this.loading = (async () => {
      try {
        if (typeof navigator === "undefined" || !("gpu" in navigator)) {
          throw new Error("WebGPU is not available in this browser. Try Chrome/Edge or use Ollama.");
        }
        this.onStatus({ status: "loading", fraction: 0.02, message: "Loading LFM3 WebGPU runtime…" });
        const runtimeUrl = new URL(basePath("vendor/Lfm3ForCausalLM.js"), location.href).href;
        const mod = await import(/* @vite-ignore */ runtimeUrl);
        const check = await mod.Lfm3ForCausalLM.checkAvailability(repo, file ? { file } : undefined).catch(() => true);
        if (check && typeof check === "object" && check.ok === false) {
          throw new Error(check.reason || "This GPU cannot run LFM3-1.7B.");
        }
        if (this.session?.dispose) await this.session.dispose();
        if (this.model?.dispose) await this.model.dispose();
        this.model = await mod.Lfm3ForCausalLM.from_pretrained(repo, {
          ...(file ? { file } : {}),
          maxLength: 32768,
          onProgress: (p) => {
            const fraction =
              typeof p?.progress === "number"
                ? p.progress > 1
                  ? p.progress / 100
                  : p.progress
                : p?.total
                  ? (p.loaded ?? 0) / p.total
                  : 0;
            const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
            this.onStatus({
              status: "loading",
              fraction,
              message: p?.status === "weights" ? `Downloading LFM3-1.7B (${pct}%)…` : `Preparing LFM3-1.7B (${pct}%)…`,
            });
          },
        });
        this.session = this.model.create_session();
        this.readyModel = modelId;
        this.onStatus({
          status: "ready",
          fraction: 1,
          message: `LFM3-1.7B (${file ? "QAD Q4_0" : "Q4_K_M"}) ready on WebGPU`,
        });
      } catch (err) {
        this.session = null;
        this.readyModel = "";
        this.onStatus({ status: "error", fraction: 0, error: err?.message || String(err) });
        throw err;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  get ready() {
    return Boolean(this.session);
  }

  resetSession() {
    if (this.session?.dispose) void Promise.resolve(this.session.dispose()).catch(() => {});
    this.session = this.model ? this.model.create_session() : null;
  }

  async generate(messages, { modelId = LFM3_DEFAULT_MODEL_ID, onChunk, onActivity, signal } = {}) {
    if (!this.session || this.readyModel !== modelId) {
      await this.load(modelId);
    }
    const gen = this.session.generate(messages, {
      max_new_tokens: 4096,
      do_sample: false,
      signal,
    });
    for await (const ev of gen) {
      if (ev?.type === "text" && ev.text) onChunk?.(ev.text);
      else if (ev?.type === "reasoning" && ev.text) onActivity?.({ kind: "thinking", delta: ev.text });
      else if (ev?.type === "prefill" && ev.total) {
        onActivity?.({ kind: "reading", fraction: Math.min(1, (ev.done ?? 0) / ev.total) });
      }
    }
    const res = await gen.result;
    return res?.message?.content || "";
  }

  /** Native Pi tool-calling turn on WebGPU (LiquidAI/LFM3-1.7B-GGUF Q4_K_M or QAD-Q4_0). */
  async completeWithTools(messages, tools = [], { modelId = LFM3_DEFAULT_MODEL_ID, onText, onActivity, signal } = {}) {
    if (!this.session || this.readyModel !== modelId) {
      await this.load(modelId);
    }
    const gen = this.session.generate(sanitizeTextOnlyMessages(messages), {
      ...(tools.length ? { tools } : {}),
      max_new_tokens: 4096,
      do_sample: false,
      signal,
    });
    for await (const ev of gen) {
      if (ev?.type === "text" && ev.text) onText?.(ev.text);
      else if (ev?.type === "reasoning" && ev.text) onActivity?.({ kind: "thinking", delta: ev.text });
      else if (ev?.type === "prefill" && ev.total) {
        onActivity?.({ kind: "reading", fraction: Math.min(1, (ev.done ?? 0) / ev.total) });
      }
    }
    const res = await gen.result;
    const rawCalls = Array.isArray(res?.message?.tool_calls) ? res.message.tool_calls : [];
    const calls = rawCalls.map((c, idx) => ({
      ...c,
      id: c.id || `lfm_${Date.now().toString(36)}_${idx}`,
      type: "function",
      function: {
        name: String(c.function?.name || ""),
        arguments:
          c.function?.arguments && typeof c.function.arguments === "object"
            ? c.function.arguments
            : (() => {
                try {
                  return JSON.parse(String(c.function?.arguments || "{}"));
                } catch {
                  return {};
                }
              })(),
      },
    }));
    const finish =
      res?.finish_reason === "tool_calls" && calls.length
        ? "tool_calls"
        : res?.finish_reason === "cancelled"
          ? "cancelled"
          : res?.finish_reason === "length"
            ? "length"
            : "stop";
    return {
      message: {
        role: "assistant",
        content: res?.message?.content ?? "",
        ...(calls.length ? { tool_calls: calls } : {}),
      },
      finish,
    };
  }
}

function sanitizeTextOnlyMessages(messages) {
  return messages.map((m) => {
    if (!m.images?.length) return m;
    const names = m.images.map((i) => i.label || "image").join(", ");
    const { images: _drop, ...rest } = m;
    return {
      ...rest,
      content: `${m.content || ""}\n\n[Attached image(s): ${names}. Note: LFM3-1.7B WebGPU is text-only; switch to a vision model or attach Canvas SVG to inspect geometry.]`.trim(),
    };
  });
}

function splitDataUrl(dataUrl, fallbackMime = "image/png") {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl || ""));
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: fallbackMime, base64: String(dataUrl || "").replace(/^data:[^,]*,/, "") };
}

/** Run one chat completion against Ollama / OpenAI / OpenRouter / Gemini / Anthropic / LFM3. */
export async function completeChat(settings, messages, { lfm3, onChunk, onActivity, signal } = {}) {
  const { provider, baseUrl, model, apiKey } = settings;
  if (provider === "lfm3") {
    return lfm3.generate(sanitizeTextOnlyMessages(messages), { modelId: model || LFM3_DEFAULT_MODEL_ID, onChunk, onActivity, signal });
  }

  if (!model) throw new Error("No model selected. Click ↻ to load available models.");
  const clean =
    provider === "ollama" && resolvedOllamaRoot
      ? `${resolvedOllamaRoot}/v1`
      : normalizeUrl(baseUrl);

  if (provider === "gemini") {
    const sys = messages.find((m) => m.role === "system")?.content || "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const parts = [];
        for (const img of m.images || []) {
          const { mimeType, base64 } = splitDataUrl(img.dataUrl, img.mimeType);
          parts.push({ inlineData: { mimeType, data: base64 } });
        }
        if (m.content || !parts.length) parts.push({ text: m.content || "" });
        return { role: m.role === "assistant" ? "model" : "user", parts };
      });
    const res = await fetch(
      `${clean}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
          contents,
          generationConfig: { temperature: 0.2 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  }

  if (provider === "anthropic") {
    const sys = messages.find((m) => m.role === "system")?.content || "";
    const antMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (!m.images?.length) return { role: m.role, content: m.content };
        const blocks = m.images.map((img) => {
          const { mimeType, base64 } = splitDataUrl(img.dataUrl, img.mimeType);
          return { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };
        });
        if (m.content) blocks.push({ type: "text", text: m.content });
        return { role: m.role, content: blocks };
      });
    const res = await fetch(`${clean}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: sys,
        messages: antMessages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.map((c) => c.text || "").join("") || "";
  }

  // OpenAI-compatible (Ollama /v1, LM Studio, OpenAI, OpenRouter)
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (provider === "openrouter") headers["X-Title"] = "p5comp";

  const oaMessages = messages.map((m) => {
    if (m.role === "user" && m.images?.length) {
      return {
        role: "user",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.images.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
        ],
      };
    }
    const { images: _drop, ...rest } = m;
    return rest;
  });

  const res = await fetch(`${clean}/chat/completions`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages: oaMessages,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
