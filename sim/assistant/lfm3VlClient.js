/**
 * In-browser WebGPU Vision-Language client for LFM3-VL-2B (ONNX) via Transformers.js v4.
 *
 * Matches webml-community/LFM3-VL-2B-WebGPU's proven WebGPU pipeline:
 * - Dynamically imports @huggingface/transformers@4.3.2 (zero Vite bundle bloat)
 * - Loads AutoProcessor + AutoModelForImageTextToText (vision_encoder: fp16, embed_tokens: fp16, decoder_model_merged: q4f16)
 * - Caches ONNX weights automatically in the browser's Cache API
 * - Supports multimodal image inputs (canvas PNGs, pasted/dropped photos) AND native LFM3 XML tool calls
 */

const TRANSFORMERS_CDN_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

export const LFM3_VL_PI_MODEL_ID = "languel/LFM3-VL-2B-pi-ONNX";
export const LFM3_VL_BASE_MODEL_ID = "onnx-community/LFM3-VL-2B-ONNX";

export function isOnnxVlModelId(modelId = "") {
  return /LFM3-(VL|Omni).*ONNX/i.test(String(modelId || ""));
}

function parseParamValue(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Parse LFM3 / LFM3-VL assistant output containing optional <think>...</think>
 * and <tool_call><function=name><parameter=k>v</parameter></function></tool_call> blocks.
 */
export function parseLfm3ToolOutput(rawText, { startedInThink = true } = {}) {
  let text = String(rawText || "")
    .replace(/<\|im_end\|>/g, "")
    .replace(/<\|endoftext\|>/g, "")
    .trim();

  let thinking = "";
  if (startedInThink) {
    const closeIdx = text.indexOf("</think>");
    if (closeIdx >= 0) {
      thinking = text.slice(0, closeIdx).replace(/^<think>/, "").trim();
      text = text.slice(closeIdx + "</think>".length).trim();
    } else if (text.startsWith("<think>")) {
      thinking = text.slice("<think>".length).trim();
      text = "";
    }
  } else {
    text = text.replace(/<think>([\s\S]*?)<\/think>/g, (_, inner) => {
      if (inner.trim()) thinking += (thinking ? "\n" : "") + inner.trim();
      return "";
    }).trim();
  }

  const tool_calls = [];
  const visible = text
    .replace(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g, (_, inner) => {
      const fnMatch = /<function=([^>\n]+)>([\s\S]*?)<\/function>/.exec(inner.trim());
      if (!fnMatch) return "";
      const name = fnMatch[1].trim();
      const body = fnMatch[2] || "";
      const args = {};
      const paramRe = /<parameter=([^>\n]+)>\n?([\s\S]*?)\n?<\/parameter>/g;
      let m;
      while ((m = paramRe.exec(body)) !== null) {
        args[m[1].trim()] = parseParamValue(m[2]);
      }
      tool_calls.push({
        id: `lfmvl_${Date.now().toString(36)}_${tool_calls.length}`,
        type: "function",
        function: { name, arguments: args },
      });
      return "";
    })
    .trim();

  return { content: visible, thinking, tool_calls };
}

/**
 * Convert p5comp chat messages (with optional `images: [{ dataUrl }]`) into
 * Transformers.js VL chat messages + ordered image URLs.
 */
export function formatVlMessages(messages = []) {
  const imageUrls = [];
  const formatted = messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content || "",
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: "function",
          function: {
            name: c.function?.name || "",
            arguments:
              c.function?.arguments && typeof c.function.arguments === "object"
                ? c.function.arguments
                : {},
          },
        })),
      };
    }
    if (m.images?.length) {
      const parts = [];
      for (const img of m.images) {
        if (!img?.dataUrl) continue;
        imageUrls.push(img.dataUrl);
        parts.push({ type: "image" });
      }
      if (m.content) parts.push({ type: "text", text: m.content });
      return { role: m.role, content: parts };
    }
    const { images: _drop, ...rest } = m;
    return rest;
  });
  return { messages: formatted, imageUrls };
}

async function hasWebGpuFp16() {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter?.features?.has?.("shader-f16"));
  } catch {
    return false;
  }
}

export class Lfm3VlClient {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.tf = null;
    this.processor = null;
    this.model = null;
    this.readyModel = "";
    this.loading = null;
  }

  get ready() {
    return Boolean(this.model && this.processor);
  }

  resetSession() {
    // Transformers.js AutoModelForImageTextToText is stateless across generate() calls.
  }

  async load(modelId = LFM3_VL_BASE_MODEL_ID) {
    if (this.ready && this.readyModel === modelId) {
      this.onStatus({ status: "ready", fraction: 1, message: `${this._shortName(modelId)} ready on WebGPU` });
      return;
    }
    if (this.loading) return this.loading;
    const shortName = this._shortName(modelId);
    this.loading = (async () => {
      try {
        if (typeof navigator === "undefined" || !("gpu" in navigator)) {
          throw new Error("WebGPU is not available in this browser. Try Chrome or Edge.");
        }
        const fp16 = await hasWebGpuFp16();
        const dtype = fp16
          ? { vision_encoder: "fp16", embed_tokens: "q4f16", decoder_model_merged: "q4f16" }
          : { vision_encoder: "q4", embed_tokens: "q4", decoder_model_merged: "q4" };

        this.onStatus({ status: "loading", fraction: 0.02, message: `Loading Transformers.js WebGPU runtime…` });
        const tf = this.tf || (await import(/* @vite-ignore */ TRANSFORMERS_CDN_URL));
        this.tf = tf;

        if (this.model?.dispose) await Promise.resolve(this.model.dispose()).catch(() => {});
        this.model = null;
        this.processor = null;

        const progress_callback = (p) => {
          if (p?.status === "progress_total" && p.total > 0) {
            const fraction = Math.max(0.02, Math.min(0.99, (p.loaded || 0) / p.total));
            const pct = Math.round(fraction * 100);
            this.onStatus({
              status: "loading",
              fraction,
              message:
                fraction >= 0.99
                  ? `Compiling ${shortName} WebGPU shaders…`
                  : `Downloading ${shortName} (${pct}%)…`,
            });
          } else if (p?.status === "progress" && typeof p.progress === "number") {
            const fraction = Math.max(0.02, Math.min(0.99, p.progress / 100));
            const pct = Math.round(fraction * 100);
            this.onStatus({
              status: "loading",
              fraction,
              message: `Downloading ${shortName} (${pct}%)…`,
            });
          }
        };

        this.processor = await tf.AutoProcessor.from_pretrained(modelId, { progress_callback });
        this.model = await tf.AutoModelForImageTextToText.from_pretrained(modelId, {
          device: "webgpu",
          dtype,
          progress_callback,
        });
        this.readyModel = modelId;
        this.onStatus({
          status: "ready",
          fraction: 1,
          message: `${shortName} (Vision + WebGPU) ready`,
        });
      } catch (err) {
        this.model = null;
        this.processor = null;
        this.readyModel = "";
        this.onStatus({ status: "error", fraction: 0, error: err?.message || String(err) });
        throw err;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  _shortName(modelId) {
    return /pi/i.test(modelId) ? "LFM3-VL-2B-pi" : "LFM3-VL-2B";
  }

  async _run(messages, tools = [], { modelId = LFM3_VL_BASE_MODEL_ID, onText, onActivity, signal } = {}) {
    if (!this.ready || this.readyModel !== modelId) {
      await this.load(modelId);
    }
    const { RawImage, TextStreamer, InterruptableStoppingCriteria } = this.tf;
    const { messages: vlMessages, imageUrls } = formatVlMessages(messages);

    const enableThinking = true;
    const chatPrompt = this.processor.apply_chat_template(vlMessages, {
      ...(tools.length ? { tools } : {}),
      add_generation_prompt: true,
      enable_thinking: enableThinking,
    });

    let inputs;
    if (imageUrls.length) {
      onActivity?.({ kind: "reading", fraction: 0.3 });
      const rawImages = [];
      for (const url of imageUrls) {
        let img = await RawImage.fromURL(url);
        // Keep image resolution reasonable for fast WebGPU vision encoding (~512px max edge).
        const maxSide = 512;
        if (img.width > maxSide || img.height > maxSide) {
          const scale = maxSide / Math.max(img.width, img.height);
          img = await img.resize(Math.max(32, Math.round(img.width * scale)), Math.max(32, Math.round(img.height * scale)));
        }
        rawImages.push(img);
      }
      inputs = await this.processor(rawImages.length === 1 ? rawImages[0] : rawImages, chatPrompt, {
        add_special_tokens: false,
      });
    } else {
      inputs = await this.processor.tokenizer(chatPrompt, {
        add_special_tokens: false,
        return_tensor: true,
      });
    }

    const stopping = new InterruptableStoppingCriteria();
    const onAbort = () => stopping.interrupt();
    if (signal?.aborted) stopping.interrupt();
    signal?.addEventListener?.("abort", onAbort, { once: true });

    let fullRaw = "";
    let inThink = enableThinking;
    let inToolCall = false;
    let pending = "";

    const streamer = new TextStreamer(this.processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (chunk) => {
        if (!chunk) return;
        const clean = chunk.replace(/<\|im_end\|>/g, "").replace(/<\|endoftext\|>/g, "");
        if (!clean) return;
        fullRaw += clean;
        pending += clean;

        if (inThink) {
          const closeIdx = pending.indexOf("</think>");
          if (closeIdx >= 0) {
            const thoughtPart = pending.slice(0, closeIdx);
            if (thoughtPart) onActivity?.({ kind: "thinking", delta: thoughtPart });
            pending = pending.slice(closeIdx + "</think>".length);
            inThink = false;
          } else if (pending.length > 12) {
            const safe = pending.slice(0, -10);
            onActivity?.({ kind: "thinking", delta: safe });
            pending = pending.slice(-10);
          }
        }
        if (!inThink && !inToolCall && pending) {
          const tcIdx = pending.indexOf("<tool_call>");
          if (tcIdx >= 0) {
            const vis = pending.slice(0, tcIdx);
            if (vis) onText?.(vis);
            inToolCall = true;
            pending = "";
          } else if (pending.length > 14 && !pending.includes("<")) {
            onText?.(pending);
            pending = "";
          }
        }
      },
    });

    try {
      await this.model.generate({
        ...inputs,
        do_sample: false,
        repetition_penalty: 1.05,
        max_new_tokens: 2048,
        streamer,
        stopping_criteria: stopping,
      });
    } finally {
      signal?.removeEventListener?.("abort", onAbort);
    }

    const parsed = parseLfm3ToolOutput(fullRaw, { startedInThink: enableThinking });
    if (signal?.aborted) {
      return {
        message: { role: "assistant", content: parsed.content },
        finish: "cancelled",
      };
    }
    return {
      message: {
        role: "assistant",
        content: parsed.content,
        ...(parsed.tool_calls.length ? { tool_calls: parsed.tool_calls } : {}),
      },
      finish: parsed.tool_calls.length ? "tool_calls" : "stop",
    };
  }

  async generate(messages, { modelId = LFM3_VL_BASE_MODEL_ID, onChunk, onActivity, signal } = {}) {
    const res = await this._run(messages, [], { modelId, onText: onChunk, onActivity, signal });
    return res.message.content || "";
  }

  async completeWithTools(messages, tools = [], { modelId = LFM3_VL_BASE_MODEL_ID, onText, onActivity, signal } = {}) {
    return this._run(messages, tools, { modelId, onText, onActivity, signal });
  }
}
