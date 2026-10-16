import { basePath } from "../basePath.js";
export class P5Bridge extends EventTarget {
  constructor(
    frame,
    {
      onSend,
      onSendLine,
      onSerialWrite,
      loadSandbox = async (url) => {
        const response = await fetch(url);
        if (!response.ok)
          throw new Error(`Preview could not load (${response.status}).`);
        return response.text();
      },
      startupTimeout = 15000,
    } = {},
  ) {
    super();
    this.frame = frame;
    this.loadSandbox = loadSandbox;
    this.startupTimeout = startupTimeout;
    this.generation = 0;
    try {
      const expected = new URL(
        basePath("shared/p5/sandbox.html"),
        frame.ownerDocument.baseURI,
      );
      if (
        expected.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(expected.hostname)
      ) {
        expected.hostname = "p5comp-preview.localhost";
        if (
          window.sessionStorage?.getItem("p5comp.preview-runtime") ===
          expected.href
        )
          this.preferredRuntimeURL = expected.href;
      }
    } catch {}
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

  async run(source, project = {}) {
    const generation = ++this.generation;
    clearTimeout(this.startupTimer);
    if (this.loaded) await this.closeSerial();
    if (generation !== this.generation) return;
    this.project = project;
    this.source = source;
    this.loaded = false;
    this.#status("Loading p5…");
    this.fallbackUsed = false;
    if (this.preferredRuntimeURL) {
      this.fallbackUsed = true;
      this.startupTimer = setTimeout(
        () =>
          this.#error(
            "p5 preview did not finish starting. Check libraries and preload assets.",
          ),
        this.startupTimeout,
      );
      this.#startLocalRuntime(this.preferredRuntimeURL);
      return;
    }
    this.startupTimer = setTimeout(
      () => this.#startupExpired(generation),
      this.startupTimeout,
    );
    try {
      const url = new URL(
        basePath("shared/p5/sandbox.html"),
        this.frame.ownerDocument.baseURI,
      );
      const html = await this.loadSandbox(url.href);
      if (generation !== this.generation) return;
      // srcdoc keeps an opaque sandbox origin while avoiding a separate URL-frame
      // navigation that can stall in embedded browsers. Libraries still use the app URL.
      const href = url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const detached = this.frame.ownerDocument !== document ? "1" : "0";
      if (this.frame.cloneNode) {
        const next = this.frame.cloneNode(false);
        next.removeAttribute("src");
        next.removeAttribute("srcdoc");
        next.setAttribute("sandbox", "allow-scripts");
        this.frame.replaceWith(next);
        this.frame = next;
      }
      this.frame.removeAttribute("src");
      this.frame.setAttribute?.("sandbox", "allow-scripts");
      this.frame.srcdoc = html.replace(
        /<head>/i,
        `<head><base href="${href}"><meta name="p5comp-detached" content="${detached}">`,
      );
    } catch (error) {
      if (generation === this.generation) this.#error(error.message);
    }
  }
  #startupExpired(generation) {
    if (generation !== this.generation) return;
    const url = new URL(
      basePath("shared/p5/sandbox.html"),
      this.frame.ownerDocument.baseURI,
    );
    if (
      !this.loaded &&
      !this.fallbackUsed &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      this.frame.ownerDocument === document
    ) {
      this.fallbackUsed = true;
      this.loaded = false;
      url.hostname = "p5comp-preview.localhost";
      this.#status("Recovering p5…");
      this.dispatchEvent(
        new CustomEvent("console", {
          detail: {
            level: "info",
            values: [
              "p5 preview stalled; retrying with a fresh local browser runtime.",
            ],
          },
        }),
      );
      this.#startLocalRuntime(url.href);
      this.startupTimer = setTimeout(
        () =>
          this.#error(
            "p5 preview did not finish starting after recovery. A library, preload, or browser frame may be stalled.",
          ),
        this.startupTimeout,
      );
    } else
      this.#error(
        "p5 preview did not finish starting. A library, preload, or browser frame may be stalled. Try Run p5 again.",
      );
  }
  #startLocalRuntime(runtimeURL) {
    const editor = new URL(this.frame.ownerDocument.baseURI);
    const expected = new URL(basePath("shared/p5/sandbox.html"), editor);
    expected.hostname = "p5comp-preview.localhost";
    if (
      editor.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(editor.hostname) ||
      runtimeURL !== expected.href
    ) {
      this.#error("Refused an unsafe local preview origin.");
      return;
    }
    // A dedicated loopback origin gives a frozen opaque-frame process a fresh
    // runtime. It remains cross-origin from the editor: student code cannot
    // access the parent DOM/storage, and device access stays in the host proxy.
    // Never use allow-same-origin on the editor origin or on srcdoc.
    const next = this.frame.cloneNode?.(false) || this.frame;
    next.removeAttribute("srcdoc");
    next.removeAttribute("src");
    next.setAttribute?.("sandbox", "allow-scripts allow-same-origin");
    if (next !== this.frame) {
      this.frame.replaceWith(next);
      this.frame = next;
    }
    this.frame.src = runtimeURL + "?run=" + Date.now();
  }
  #status(message) {
    this.dispatchEvent(new CustomEvent("status", { detail: message }));
  }
  #error(message) {
    clearTimeout(this.startupTimer);
    this.#status("p5 failed to start");
    this.dispatchEvent(
      new CustomEvent("runtimeError", {
        detail: { type: "runtimeError", message },
      }),
    );
  }
  closeSerial() {
    if (!this.loaded) return Promise.resolve();
    this.serialClosePending?.resolve();
    return new Promise((resolve) => {
      const requestId = (this.serialCloseSequence || 0) + 1;
      this.serialCloseSequence = requestId;
      const finish = () => {
        clearTimeout(timer);
        if (this.serialClosePending?.requestId === requestId)
          this.serialClosePending = null;
        resolve();
      };
      const timer = setTimeout(finish, 750);
      this.serialClosePending = { requestId, resolve: finish };
      this.#post({ type: "closeSerial", requestId });
    });
  }
  stop() {
    ++this.generation;
    clearTimeout(this.startupTimer);
    this.loaded = false;
    this.frame.removeAttribute("srcdoc");
    this.frame.src = "about:blank";
    this.#status("p5 stopped");
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
    ++this.generation;
    clearTimeout(this.startupTimer);
    window.removeEventListener("message", this.listener);
    document.removeEventListener("physical-p5:themechange", this.themeListener);
  }

  #post(message) {
    this.frame.contentWindow?.postMessage(message, "*");
  }

  #handleMessage(event) {
    if (event.source !== this.frame.contentWindow || !event.data) return;
    const message = event.data;
    if (message.type === "serialClosed") {
      if (this.serialClosePending?.requestId === message.requestId)
        this.serialClosePending.resolve();
      return;
    }
    if (message.type === "loaded") {
      this.loaded = true;
      this.#status("Starting p5…");
      this.#post({
        type: "state",
        signals: this.signals,
        serialConnected: this.serialConnected,
        transportMode: this.transportMode,
        theme: document.documentElement.dataset.theme || "light",
      });
      this.#post({ type: "pins", values: this.pins });
      this.#post({ type: "run", source: this.source, project: this.project });
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
      clearTimeout(this.startupTimer);
      if (this.fallbackUsed) {
        this.preferredRuntimeURL = this.frame.src.split("?")[0];
        try {
          window.sessionStorage?.setItem(
            "p5comp.preview-runtime",
            this.preferredRuntimeURL,
          );
        } catch {}
      }
      this.#status("p5 running");
      this.dispatchEvent(new Event("ready"));
    } else if (message.type === "console") {
      this.dispatchEvent(new CustomEvent("console", { detail: message }));
    } else if (message.type === "runtimeError") {
      clearTimeout(this.startupTimer);
      this.#status("p5 error");
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
