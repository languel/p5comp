import { buildInBrowser } from "./engine.js";
self.onmessage = async ({ data }) => {
  try {
    const result = await buildInBrowser(data.input, {
      base: new URL(data.base),
      progress: (message) => self.postMessage({ type: "progress", message }),
    });
    self.postMessage({ type: "result", result });
  } catch (error) {
    let message = error.message || "Browser compilation failed.";
    if (/fatal error:.*No such file or directory/s.test(message))
      message +=
        "\nThe browser includes our six classroom libraries plus Wire, SPI, EEPROM and SoftwareSerial headers. Extra libraries and custom C files can use the optional Local helper in Settings.";
    self.postMessage({
      type: "error",
      message,
      compilation: !!error.compilation,
    });
  }
};
