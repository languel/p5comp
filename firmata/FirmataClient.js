import { FirmataParser } from "./FirmataParser.js";

export const PIN_MODES = Object.freeze({
  0: "INPUT",
  1: "OUTPUT",
  2: "ANALOG",
  3: "PWM",
  4: "SERVO",
  5: "SHIFT",
  6: "I2C",
  11: "INPUT_PULLUP"
});

const MODE_IDS = Object.freeze(Object.fromEntries(
  Object.entries(PIN_MODES).map(([id, name]) => [name, Number(id)])
));
const MAX_ANALOG_VALUE = 0x3fff;

export class FirmataClient extends EventTarget {
  constructor(serial) {
    super();
    this.serial = serial;
    this.parser = new FirmataParser();
    this.pins = [];
    this.capabilities = null;
    this.analogMapping = null;
    this.version = null;
    this.firmware = null;
    this.digitalPorts = [];
    this.samplingInterval = 20;
    this.bytesListener = event => this.parser.feed(event.detail);
    this.parser.addEventListener("version", event => {
      this.version = event.detail;
      this.dispatchEvent(new CustomEvent("version", { detail: event.detail }));
    });
    this.parser.addEventListener("firmware", event => {
      this.firmware = event.detail;
      this.dispatchEvent(new CustomEvent("firmware", { detail: event.detail }));
    });
    this.parser.addEventListener("capabilities", event => {
      this.capabilities = event.detail;
      this.#buildPins();
    });
    this.parser.addEventListener("analogMapping", event => {
      this.analogMapping = event.detail;
      this.#buildPins();
    });
    this.parser.addEventListener("digitalPort", event => this.#onDigitalPort(event.detail));
    this.parser.addEventListener("analog", event => this.#onAnalog(event.detail));
    serial.addEventListener("bytes", this.bytesListener);
  }

  async initialize() {
    await this.#send([0xf9]);
    await this.#sendSysex(0x79);
    await this.#sendSysex(0x6b);
    await this.#sendSysex(0x69);
  }

  async setSamplingInterval(milliseconds) {
    const value = Math.max(10, Math.min(1000, Math.round(milliseconds)));
    this.samplingInterval = value;
    await this.#sendSysex(0x7a, value & 0x7f, (value >> 7) & 0x7f);
  }

  async setPinMode(pin, mode) {
    const entry = this.#pin(pin);
    const modeId = typeof mode === "string" ? MODE_IDS[mode] : mode;
    if (modeId === undefined || !entry.capabilities.some(capability => capability.mode === modeId)) {
      throw new Error(`${entry.id} does not support ${PIN_MODES[modeId] ?? mode}.`);
    }
    await this.#send([0xf4, entry.pin, modeId]);
    entry.mode = modeId;
    if (modeId === 1 || modeId === 3) entry.value ??= 0;
    this.#emitPin(entry);
    if (modeId === 2) {
      await this.#reportAnalog(entry.analogChannel, true);
    } else if (modeId === 0 || modeId === 11) {
      await this.#reportDigital(entry.pin >> 3, true);
    }
  }

  async write(name, rawValue) {
    const entry = this.#pin(name);
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new TypeError("Pin writes must be finite numbers.");
    if (entry.mode === 1) {
      const bit = 1 << (entry.pin & 7);
      const current = this.digitalPorts[entry.pin >> 3] ?? 0;
      const next = value ? current | bit : current & ~bit;
      this.digitalPorts[entry.pin >> 3] = next;
      await this.#send([0x90 | (entry.pin >> 3), next & 0x7f, (next >> 7) & 0x7f]);
      entry.value = value ? 1 : 0;
    } else if (entry.mode === 3) {
      const amount = Math.round(Math.max(0, Math.min(255, value)));
      if (entry.pin < 16) {
        await this.#send([0xe0 | entry.pin, amount & 0x7f, (amount >> 7) & 0x7f]);
      } else {
        await this.#sendSysex(0x6f, entry.pin, amount & 0x7f, (amount >> 7) & 0x7f);
      }
      entry.value = amount;
    } else {
      throw new Error(`${entry.id} must be OUTPUT or PWM before writing.`);
    }
    this.#emitPin(entry);
  }

  destroy() {
    this.serial.removeEventListener("bytes", this.bytesListener);
  }

  #buildPins() {
    if (!this.capabilities || !this.analogMapping) return;
    this.pins = this.capabilities.map((capabilities, index) => {
      const analogChannel = this.analogMapping[index] === 127 ? null : this.analogMapping[index];
      const id = analogChannel === null ? `D${index}` : `A${analogChannel}`;
      const available = capabilities.filter(item => Object.hasOwn(PIN_MODES, item.mode));
      return {
        id,
        pin: index,
        analogChannel,
        capabilities: available,
        mode: analogChannel !== null && available.some(item => item.mode === 2) ? 2 : 0,
        value: null,
        alias: ""
      };
    });
    this.dispatchEvent(new CustomEvent("ready", { detail: this.pins }));
  }

  #onDigitalPort({ port, value }) {
    this.digitalPorts[port] = value;
    for (let bit = 0; bit < 8; bit += 1) {
      const pin = this.pins[port * 8 + bit];
      if (!pin) continue;
      pin.value = (value >> bit) & 1;
      this.#emitPin(pin);
    }
  }

  #onAnalog({ channel, value }) {
    const pin = this.pins.find(item => item.analogChannel === channel);
    if (!pin) return;
    pin.value = value & MAX_ANALOG_VALUE;
    this.#emitPin(pin);
  }

  async #reportDigital(port, enabled) {
    await this.#send([0xd0 | port, enabled ? 1 : 0]);
  }

  async #reportAnalog(channel, enabled) {
    if (channel === null || channel === undefined) return;
    await this.#send([0xc0 | (channel & 0x0f), enabled ? 1 : 0]);
  }

  async #sendSysex(command, ...values) {
    await this.#send([0xf0, command, ...values, 0xf7]);
  }

  async #send(bytes) {
    await this.serial.write(Uint8Array.from(bytes));
  }

  #pin(id) {
    const pin = typeof id === "number"
      ? this.pins[id]
      : this.pins.find(entry => entry.id === id || entry.alias === id);
    if (!pin) throw new Error(`Unknown Firmata pin: ${id}`);
    return pin;
  }

  #emitPin(pin) {
    this.dispatchEvent(new CustomEvent("pin", { detail: pin }));
  }
}
