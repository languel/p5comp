const DIGITAL_MESSAGE = 0x90;
const ANALOG_MESSAGE = 0xe0;
const REPORT_VERSION = 0xf9;
const START_SYSEX = 0xf0;
const END_SYSEX = 0xf7;

const MESSAGE_LENGTH = new Map([
  [REPORT_VERSION, 2],
  [0xf4, 2],
  [0xf5, 1]
]);

export class FirmataParser extends EventTarget {
  status = null;
  expected = 0;
  data = [];
  inSysex = false;
  sysex = [];

  feed(bytes) {
    for (const byte of bytes) this.#consume(byte & 0xff);
  }

  #consume(byte) {
    if (byte === START_SYSEX) {
      this.inSysex = true;
      this.sysex = [];
      return;
    }
    if (this.inSysex) {
      if (byte === END_SYSEX) {
        this.inSysex = false;
        this.#handleSysex(this.sysex);
      } else if (byte < 0x80) {
        this.sysex.push(byte);
      }
      return;
    }
    if (byte >= 0x80) {
      this.status = byte;
      this.expected = MESSAGE_LENGTH.get(byte) ??
        ((byte & 0xf0) === DIGITAL_MESSAGE || (byte & 0xf0) === ANALOG_MESSAGE ? 2 : 0);
      this.data = [];
      if (this.expected === 0) this.status = null;
      return;
    }
    if (!this.status || this.expected === 0) return;
    this.data.push(byte);
    if (this.data.length >= this.expected) {
      this.#handleMessage(this.status, this.data);
      this.status = null;
      this.data = [];
    }
  }

  #handleMessage(status, data) {
    if (status === REPORT_VERSION) {
      this.dispatchEvent(new CustomEvent("version", { detail: { major: data[0], minor: data[1] } }));
    } else if ((status & 0xf0) === DIGITAL_MESSAGE) {
      this.dispatchEvent(new CustomEvent("digitalPort", {
        detail: { port: status & 0x0f, value: data[0] | (data[1] << 7) }
      }));
    } else if ((status & 0xf0) === ANALOG_MESSAGE) {
      this.dispatchEvent(new CustomEvent("analog", {
        detail: { channel: status & 0x0f, value: data[0] | (data[1] << 7) }
      }));
    }
  }

  #handleSysex(data) {
    const [command, ...payload] = data;
    if (command === 0x79 && payload.length >= 2) {
      const nameBytes = [];
      for (let i = 2; i + 1 < payload.length; i += 2) {
        nameBytes.push(payload[i] | (payload[i + 1] << 7));
      }
      this.dispatchEvent(new CustomEvent("firmware", {
        detail: {
          major: payload[0],
          minor: payload[1],
          name: String.fromCharCode(...nameBytes)
        }
      }));
    } else if (command === 0x6c) {
      const pins = [];
      let pin = [];
      for (let i = 0; i < payload.length;) {
        if (payload[i] === 0x7f) {
          pins.push(pin);
          pin = [];
          i += 1;
        } else {
          pin.push({ mode: payload[i], resolution: payload[i + 1] });
          i += 2;
        }
      }
      if (pin.length) pins.push(pin);
      this.dispatchEvent(new CustomEvent("capabilities", { detail: pins }));
    } else if (command === 0x6a) {
      this.dispatchEvent(new CustomEvent("analogMapping", { detail: payload }));
    }
  }
}
