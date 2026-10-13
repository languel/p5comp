import { basePath } from "../basePath.js";
export class P5Bridge extends EventTarget {
  constructor(frame, { onSend, onSendLine, onSerialWrite } = {}) {
    super();
    this.frame = frame;
    this.onSend = onSend;
    this.onSendLine = onSendLine;
    this.onSerialWrite = onSerialWrite;
    this.source = "";
    this.signals = {};
    this.pins = [];
    this.serialConnected = false;
    this.loaded = false;
    this.themeListener = (event) =>
      this.#post({ type: "theme", theme: event.detail });
    document.addEventListener("physical-p5:themechange", this.themeListener);
    this.listener = (event) => this.#handleMessage(event);
    window.addEventListener("message", this.listener);
  }

  run(source) {
    this.source = source;
    this.loaded = false;
    this.frame.src = basePath(
      `shared/p5/sandbox.html?run=${Date.now()}&detached=${this.frame.ownerDocument !== document ? 1 : 0}`,
    );
  }

  mirror(enabled) {
    this.mirroring = enabled;
    this.#post({ type: "mirror", enabled });
  }
  updateState(signals, serialConnected, transportMode = "simulation") {
    this.signals = { ...signals };
    this.serialConnected = serialConnected;
    this.transportMode = transportMode;
    this.#post({
      type: "state",
      signals: this.signals,
      serialConnected,
      transportMode,
      theme: document.documentElement.dataset.theme || "light",
    });
  }

  serialBytes(bytes) {
    this.#post({ type: "serialBytes", bytes: Array.from(bytes) });
  }

  updatePins(values) {
    this.pins = values;
    this.#post({ type: "pins", values });
  }

  dispose() {
    window.removeEventListener("message", this.listener);
    document.removeEventListener("physical-p5:themechange", this.themeListener);
  }

  #post(message) {
    this.frame.contentWindow?.postMessage(message, "*");
  }

  #handleMessage(event) {
    if (event.source !== this.frame.contentWindow || !event.data) return;
    const message = event.data;
    if (message.type === "loaded") {
      this.loaded = true;
      this.#post({
        type: "state",
        signals: this.signals,
        serialConnected: this.serialConnected,
        transportMode: this.transportMode,
        theme: document.documentElement.dataset.theme || "light",
      });
      this.#post({ type: "pins", values: this.pins });
      this.#post({ type: "run", source: this.source });
      this.#post({ type: "mirror", enabled: !!this.mirroring });
      return;
    }
    if (
      message.type === "mirrorFrame" ||
      message.type === "mirrorError" ||
      message.type === "renderSize"
    ) {
      this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
    } else if (message.type === "ready") {
      this.dispatchEvent(new Event("ready"));
    } else if (message.type === "console") {
      this.dispatchEvent(new CustomEvent("console", { detail: message }));
    } else if (message.type === "runtimeError") {
      this.dispatchEvent(new CustomEvent("runtimeError", { detail: message }));
    } else if (message.type === "send") {
      this.onSend?.(message.name, message.value);
    } else if (message.type === "sendLine") {
      this.onSendLine?.(message.text);
    } else if (message.type === "serialWrite") {
      if (
        Array.isArray(message.bytes) &&
        message.bytes.length <= 4096 &&
        message.bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
      )
        this.onSerialWrite?.(Uint8Array.from(message.bytes));
    } else if (message.type === "pinWrite") {
      this.dispatchEvent(new CustomEvent("pinWrite", { detail: message }));
    }
  }
}
