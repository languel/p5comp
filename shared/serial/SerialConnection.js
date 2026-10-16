export class SerialConnection extends EventTarget {
  port = null;
  reader = null;
  isReading = false;
  readTask = null;
  writes = new Set();
  releasing = false;
  buffer = "";
  decoder = new TextDecoder();

  get connected() {
    return Boolean(this.port?.readable && this.port?.writable);
  }

  async connect({ baudRate = 9600, port = null } = {}) {
    if (this.port) throw new Error("A serial port is already connected.");
    if (!("serial" in navigator)) {
      throw new Error(window.isSecureContext
        ? "Web Serial is unavailable. Use desktop Chrome or Edge."
        : "Web Serial requires HTTPS or localhost.");
    }

    const selectedPort = port ?? await navigator.serial.requestPort();
    try {
      await selectedPort.open({ baudRate });
      if (!selectedPort.readable || !selectedPort.writable) {
        throw new Error("The selected serial port is not readable and writable.");
      }
      this.port = selectedPort;
      this.buffer = "";
      this.decoder = new TextDecoder();
      this.dispatchEvent(new Event("connect"));
      this.#startReader();
      return selectedPort;
    } catch (error) {
      if (selectedPort.readable || selectedPort.writable) {
        try { await selectedPort.close(); } catch {}
      }
      throw error;
    }
  }

  async disconnect() {
    const activePort = this.port;
    if (!activePort) return;
    this.releasing = true;
    try {
      await this.pauseReading();
      await Promise.allSettled([...this.writes]);
      await activePort.close();
      this.port = null;
    } finally { this.releasing = false; }
    this.buffer = "";
    this.dispatchEvent(new Event("disconnect"));
  }

  async releasePort() {
    const activePort = this.port;
    if (!activePort) throw new Error("There is no connected serial port to release.");
    this.releasing = true;
    try {
      await this.pauseReading();
      await Promise.allSettled([...this.writes]);
      await activePort.close();
      this.port = null;
    } finally { this.releasing = false; }
    this.dispatchEvent(new Event("disconnect"));
    return activePort;
  }

  async reconnect(port, baudRate) {
    if (this.port) throw new Error("Disconnect the active serial port before reconnecting.");
    await port.open({ baudRate });
    if (!port.readable || !port.writable) {
      throw new Error("The serial port did not reopen for runtime communication.");
    }
    this.port = port;
    this.buffer = "";
    this.decoder = new TextDecoder();
    this.dispatchEvent(new Event("connect"));
    this.#startReader();
  }

  async pauseReading() {
    this.isReading = false;
    if (this.reader) {
      try { await this.reader.cancel(); } catch {}
    }
    if (this.readTask) await this.readTask;
  }

  resumeReading() {
    if (!this.port || this.isReading) return;
    this.buffer = "";
    this.decoder = new TextDecoder();
    this.#startReader();
  }

  async write(data) {
    if (this.releasing || !this.port?.writable) throw new Error("Connect to a board before sending data.");
    const writer = this.port.writable.getWriter();
    const task = (async () => {
      try {
        await writer.write(typeof data === "string" ? new TextEncoder().encode(data) : data);
      } finally { writer.releaseLock(); }
    })();
    this.writes.add(task);
    try { await task; } finally { this.writes.delete(task); }
  }

  async writeLine(text) {
    await this.write(`${text}\n`);
    this.dispatchEvent(new CustomEvent("sent", { detail: text }));
  }

  #startReader() {
    if (!this.port?.readable || this.isReading) return;
    this.isReading = true;
    const activePort = this.port;
    this.readTask = this.#readLoop(activePort).finally(() => {
      this.readTask = null;
    });
  }

  async #readLoop(activePort) {
    while (this.isReading && this.port === activePort && activePort.readable) {
      const reader = activePort.readable.getReader();
      this.reader = reader;
      try {
        while (this.isReading && this.port === activePort) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            this.dispatchEvent(new CustomEvent("bytes", { detail: value }));
            this.#consume(this.decoder.decode(value, { stream: true }));
          }
        }
      } catch (error) {
        if (this.isReading && this.port === activePort) {
          this.dispatchEvent(new CustomEvent("error", { detail: error }));
        }
      } finally {
        try { reader.releaseLock(); } catch {}
        if (this.reader === reader) this.reader = null;
      }
    }
  }

  #consume(text) {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (line) this.dispatchEvent(new CustomEvent("line", { detail: line }));
    }
  }
}
