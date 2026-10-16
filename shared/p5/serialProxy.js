// Device access stays in the host. This frame-local Web Serial facade transports
// actual UART bytes, from either the emulated Uno or the host's physical USB port.
export function installSerialProxy(send) {
  let available = false,
    controller = null,
    portOpen = false,
    mode = "simulation";
  const serial = new EventTarget();
  class FrameSerialPort extends EventTarget {}
  const port = new FrameSerialPort();
  Object.defineProperty(window, "SerialPort", {
    value: FrameSerialPort,
    configurable: true,
  });
  port.readable = null;
  port.writable = null;
  port.getInfo = () => ({ usbVendorId: 0x2341, usbProductId: 0x0043 });
  port.setSignals = async () => {};
  port.getSignals = async () => ({
    dataCarrierDetect: true,
    clearToSend: true,
    dataSetReady: true,
    ringIndicator: false,
  });
  port.open = async (options) => {
    if (portOpen)
      throw new DOMException(
        "Serial port is already open.",
        "InvalidStateError",
      );
    if (!available)
      throw new Error(
        "Run the Uno simulation or connect USB from the host toolbar first.",
      );
    if (!options?.baudRate) throw new TypeError("baudRate is required.");
    portOpen = true;
    port.readable = new ReadableStream({
      start(c) {
        controller = c;
      },
      cancel() {
        controller = null;
      },
    });
    port.writable = new WritableStream({
      write(bytes) {
        if (!available) throw new Error("Device disconnected.");
        send(Array.from(bytes));
      },
    });
  };
  port.close = async () => {
    if (port.readable?.locked || port.writable?.locked)
      throw new DOMException(
        "Release serial reader/writer locks before closing.",
        "InvalidStateError",
      );
    try {
      controller?.close();
    } catch {}
    controller = null;
    portOpen = false;
    port.readable = null;
    port.writable = null;
  };
  serial.getPorts = async () => (available ? [port] : []);
  serial.requestPort = async () => {
    if (!available)
      throw new Error("Start simulation or connect USB in the host toolbar.");
    return port;
  };
  Object.defineProperty(navigator, "serial", {
    value: serial,
    configurable: true,
  });
  const reset = () => {
    try {
      controller?.close();
    } catch {}
    controller = null;
    portOpen = false;
    port.readable = null;
    port.writable = null;
  };
  return {
    reset,
    setConnected(value, nextMode = "simulation") {
      mode = nextMode;
      const changed = value !== available;
      available = value;
      if (changed) {
        const e = new Event(value ? "connect" : "disconnect");
        Object.defineProperty(e, "port", { value: port });
        serial.dispatchEvent(e);
      }
      if (!value) {
        try {
          controller?.close();
        } catch {}
        controller = null;
        // An unplugged Web Serial port has no streams. Keeping the closed
        // readable here makes p5.webserial repeatedly reacquire it in a microtask loop.
        port.readable = null;
        port.writable = null;
        portOpen = false;
      }
    },
    receive(bytes) {
      if (controller && portOpen) {
        try {
          controller.enqueue(Uint8Array.from(bytes));
        } catch {
          controller = null;
        }
      }
    },
    get mode() {
      return mode;
    },
  };
}
