# AI Assistant & WebGPU Pi Agent

`p5comp` includes an embedded **Pi Agent** right in the sidebar (`💬`) that can inspect your circuit, read and edit Arduino/p5.js code, build 2D physics mechanisms, and answer questions about what you are building.

## Zero-Setup Browser WebGPU (Default)

Out of the box, the assistant runs **locally on your browser's GPU** using WebGPU — no Ollama, LM Studio, or API key needed:

- **Default model (`LFM3-VL-2B-pi`)**: Vision + text + Pi tool calling (`languel/LFM3-VL-2B-pi-ONNX`). Downloads once (~1.5 GB) from Hugging Face and stays in your browser's cache for future visits.
- **Fast text-only option (`LFM3-1.7B-pi`)**: Lighter GGUF build (~1.1 GB, `languel/LFM3-1.7B-pi-GGUF`) if you don't need image inspection.
- Click **Load** above the chat box (or just send a message) to initialize the model the first time.

> **Browser requirement:** WebGPU works in recent versions of Chrome, Edge, and Safari/Firefox with WebGPU enabled.

## What You Can Attach (`+` button)

Click **`+`** in the chat composer (or paste / drag-and-drop images directly) to share context:

- **Selected canvas elements** — selected circuit parts, wires, physics bodies, joints, or drawings
- **Canvas snapshot (PNG)** — lets `LFM3-VL-2B-pi` visually inspect your layout, wiring, or mechanism
- **Canvas vector (SVG)** — clean geometry markup (works with text-only models too)
- **Error / Console log** — compiler diagnostics and p5.js runtime errors
- **Arduino code / p5.js code / Project state** — current sketches and circuit summary

## Agent Mode vs. Chat Mode

- **Agent** (default): The Pi Agent can call `p5comp` tools to build circuits, wire pins, edit Arduino/p5.js code, add physics mechanisms, and run the simulation.
- **Chat**: Conversational answers and explanations only — makes no edits to your project.

Toggle between **Agent** and **Chat** anytime using the pill in the composer (or `/agent` and `/chat`).

## Useful Chat Commands

| Command | Action |
|---|---|
| `/load` | Download & initialize the WebGPU model |
| `/agent` | Enable Pi Agent tool use |
| `/chat` | Switch to chat-only mode (no edits) |
| `/new` | Clear the conversation and reset context |
| `/help` | Show available commands |

## Using Ollama or Cloud APIs (Optional)

Open **Settings (`⚙`) → AI / Model → Advanced** to switch providers:

- **Ollama (Local)**: Works with any local Ollama model, including the same Pi model via `ollama run hf.co/languel/LFM3-1.7B-pi-GGUF:Q4_K_M`.
- **Cloud APIs**: OpenAI-compatible, OpenRouter, Gemini API, or Anthropic (paste your own API key; stored only in your browser's `localStorage`).

## Privacy & License

With the default WebGPU models (or local Ollama), your prompts, code, and canvas snapshots never leave your device. The LFM3 models are distributed under the **LFM Open License v1.0** (attribution to Liquid AI, Inc. and `harness-hub/LFM3-1.7B-pi`).
