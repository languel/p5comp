export class AVRUploader {
  async flash({ board, port, firmware, onProgress = () => {} }) {
    if (!port || !firmware) throw new Error("An open board port and compiled firmware are required.");
    const serial = navigator.serial;
    if (!serial || typeof serial.requestPort !== "function") {
      throw new Error("Web Serial is required to upload firmware.");
    }

    const requestPort = serial.requestPort;
    const { default: AvrgirlArduino } = await import("avrgirl-arduino/dist/avrgirl-arduino.js");
    const instance = new AvrgirlArduino({
      board: board.id,
      debug: message => onProgress(String(message))
    });
    try {
      await new Promise((resolve, reject) => {
        serial.requestPort = async () => port;
        // Avrgirl treats strings as filesystem paths, even in its browser build.
        const hexBytes = typeof firmware === "string" ? new TextEncoder().encode(firmware) : firmware;
        instance.flash(hexBytes, error => error ? reject(error) : resolve());
      });
    } finally {
      serial.requestPort = requestPort;
      if (port.readable || port.writable) {
        try { await port.close(); } catch {}
      }
    }
  }
}
