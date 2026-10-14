import { passiveStates } from "./passiveStates.js";
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  portBConfig,
  portCConfig,
  portDConfig,
  AVRTimer,
  timer0Config,
  timer1Config,
  timer2Config,
  AVRADC,
  adcConfig,
  AVRUSART,
  usart0Config,
  PinState,
} from "avr8js";

export const F_CPU = 16000000;
export function loadHex(text) {
  const bytes = new Uint8Array(32768).fill(255);
  let offset = 0,
    eof = false,
    used = 0;
  for (const line of text.trim().split(/\r?\n/)) {
    if (!/^:[\da-f]+$/i.test(line) || line.length % 2 !== 1)
      throw new Error("Invalid Intel HEX.");
    const b = Uint8Array.from(
      line
        .slice(1)
        .match(/../g)
        .map((x) => parseInt(x, 16)),
    );
    if (b.length !== b[0] + 5 || b.reduce((a, n) => a + n, 0) % 256)
      throw new Error("Invalid HEX checksum.");
    if (eof) throw new Error("HEX contains data after EOF.");
    const type = b[3],
      addr = b[1] * 256 + b[2] + offset;
    if (type === 0) {
      if (addr + b[0] > 32768) throw new Error("Firmware exceeds Uno flash.");
      bytes.set(b.slice(4, -1), addr);
      used += b[0];
    } else if (type === 1) eof = true;
    else if (type === 4) offset = (b[4] * 256 + b[5]) * 65536;
    else if (type === 2) offset = (b[4] * 256 + b[5]) * 16;
    else if (type !== 3 && type !== 5)
      throw new Error("Unsupported HEX record.");
  }
  if (!eof || !used) throw new Error("Incomplete HEX.");
  return new Uint16Array(bytes.buffer);
}

export class UnoRuntime {
  constructor(hex, topology, controls = {}, onByte = () => {}) {
    this.cpu = new CPU(loadHex(hex));
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.timers = [
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
    ];
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.uart = new AVRUSART(this.cpu, usart0Config, F_CPU);
    this.uart.onByteTransmit = onByte;
    this.rx = [];
    this.controls = controls;
    this.topology = topology;
    this.triggerStarts = new Map();
    this.lastTriggers = new Map();
    this.echoBusy = new Set();
    this.uart.onRxComplete = () => this.pumpRx();
    for (const port of Object.values(this.ports))
      port.addListener(() => {
        this.applyDigitalInputs();
        this.checkTriggers();
      });
    this.applyInputs();
  }
  pin(n) {
    return n < 8
      ? [this.ports.D, n]
      : n < 14
        ? [this.ports.B, n - 8]
        : [this.ports.C, n - 14];
  }
  setInput(n, value) {
    if (n === null || n < 0 || n > 19) return;
    const [port, bit] = this.pin(n);
    port.setPin(bit, Boolean(value));
  }
  setControls(controls) {
    this.controls = controls;
    this.applyInputs();
  }
  applyInputs() {
    this.applyDigitalInputs();
    this.adc.channelValues.fill(0);
    for (const p of this.topology.pots)
      if (p.pin >= 14 && p.powered)
        this.adc.channelValues[p.pin - 14] =
          (Math.max(0, Math.min(1023, this.controls[p.id] ?? 512)) / 1023) * 5;
  }
  applyDigitalInputs() {
    // An open switch releases its pin. INPUT_PULLUP determines its idle level.
    const driven = new Set(
      this.topology.sonars
        .filter((s) => s.powered && s.echo !== null)
        .map((s) => s.echo),
    );
    for (const b of this.topology.buttons)
      if (b.pin !== null && this.controls[b.id]) {
        this.setInput(b.pin, !!b.high);
        driven.add(b.pin);
      }
    for (const r of this.topology.rails || []) {
      this.setInput(r.pin, r.high);
      driven.add(r.pin);
    }
    for (let n = 0; n < 20; n++)
      if (!driven.has(n)) {
        const [port, bit] = this.pin(n);
        this.setInput(n, port.pinState(bit) === PinState.InputPullUp);
      }
  }
  checkTriggers() {
    for (const s of this.topology.sonars) {
      if (!s.powered || s.trig === null || s.echo === null) continue;
      const [port, bit] = this.pin(s.trig),
        high = port.pinState(bit) === PinState.High,
        last = this.lastTriggers.get(s.id) || false;
      this.lastTriggers.set(s.id, high);
      if (high && !last) this.triggerStarts.set(s.id, this.cpu.cycles);
      if (
        !high &&
        last &&
        this.cpu.cycles - (this.triggerStarts.get(s.id) ?? this.cpu.cycles) >=
          160 &&
        !this.echoBusy.has(s.id)
      ) {
        const cm = this.controls[s.id] ?? 100;
        if (cm < 0) continue;
        this.echoBusy.add(s.id);
        this.cpu.addClockEvent(() => {
          this.setInput(s.echo, true);
          this.cpu.addClockEvent(
            () => {
              this.setInput(s.echo, false);
              this.echoBusy.delete(s.id);
            },
            Math.max(1, Math.round(((cm * 2) / 0.0343) * 16)),
          );
        }, 3200);
      }
    }
  }
  write(data) {
    this.rx.push(...data);
    this.pumpRx();
  }
  pumpRx() {
    if (this.rx.length && this.uart.rxEnable && !this.uart.rxBusy)
      this.uart.writeByte(this.rx.shift());
  }
  advance(cycles) {
    const end = this.cpu.cycles + cycles;
    while (this.cpu.cycles < end) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
    this.pumpRx();
  }
  snapshot() {
    return {
      cycles: this.cpu.cycles,
      seconds: this.cpu.cycles / F_CPU,
      led: this.ports.B.pinState(5) === PinState.High,
      baudRate: this.uart.baudRate,
      parts: passiveStates(
        this.topology.passive,
        Array.from({ length: 20 }, (_, n) => {
          const [port, bit] = this.pin(n),
            state = port.pinState(bit);
          return state === PinState.High
            ? 5
            : state === PinState.Low
              ? 0
              : null;
        }),
        this.controls,
      ),
    };
  }
}
