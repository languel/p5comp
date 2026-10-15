import { ExtendedOutputs } from "./outputModels.js";
import { digitalLevels, sensorReading } from "./inputModels.js";
import { avrConfig, boardLayout, megaPins } from "./avrBoards.js";
import { PeripheralModels } from "./peripherals.js";
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
export function loadHex(text, flashSize = 32768) {
  const bytes = new Uint8Array(flashSize).fill(255);
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
      if (addr + b[0] > flashSize)
        throw new Error("Firmware exceeds board flash.");
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
    this.kind = topology.board || "uno";
    this.layout = boardLayout(this.kind);
    const config = avrConfig(this.kind);
    this.cpu = new CPU(
      loadHex(hex, this.layout.flash),
      this.kind === "mega" ? 8448 : 2048,
    );
    this.ports = Object.fromEntries(
      Object.entries(config.ports).map(([name, cfg]) => [
        name,
        new AVRIOPort(this.cpu, cfg),
      ]),
    );
    this.timers = config.timers.map((cfg) => new AVRTimer(this.cpu, cfg));
    this.adc = new AVRADC(this.cpu, config.adc);
    this.uarts = config.uarts.map((cfg) => new AVRUSART(this.cpu, cfg, F_CPU));
    this.uart = this.uarts[0];
    this.uart.onByteTransmit = onByte;
    this.rx = [];
    this.controls = controls;
    this.topology = topology;
    this.peripherals = new PeripheralModels(
      (topology.peripherals || []).filter((p) =>
        [
          "wokwi-servo",
          "wokwi-buzzer",
          "wokwi-lcd1602",
          "wokwi-lcd2004",
        ].includes(p.type),
      ),
    );
    this.outputs = new ExtendedOutputs(
      (topology.peripherals || []).filter(
        (p) =>
          ![
            "wokwi-servo",
            "wokwi-buzzer",
            "wokwi-lcd1602",
            "wokwi-lcd2004",
          ].includes(p.type),
      ),
    );
    this.pirMemory = new Map();
    this.inputStates = {};
    this.runtimeControls = { ...controls };
    this.triggerStarts = new Map();
    this.lastTriggers = new Map();
    this.echoBusy = new Set();
    this.uart.onRxComplete = () => this.pumpRx();
    for (const port of Object.values(this.ports))
      port.addListener(() => {
        this.applyDigitalInputs();
        this.checkTriggers();
        const high = (n) => {
          const [port, bit] = this.pin(n);
          const state = port.pinState(bit);
          return (
            state === PinState.High ||
            (state >= PinState.Input && !!this.levels?.[n])
          );
        };
        this.peripherals.tick(this.cpu.cycles, high);
        this.outputs.tick(this.cpu.cycles, high);
      });
    this.applyInputs();
  }
  pin(n) {
    if (this.kind === "mega") {
      const [name, bit] = megaPins[n];
      return [this.ports[name], bit];
    }
    return n < 8
      ? [this.ports.D, n]
      : n < 14
        ? [this.ports.B, n - 8]
        : [this.ports.C, n - 14];
  }
  setInput(n, value) {
    if (n === null || n < 0 || n >= this.layout.digitalCount) return;
    const [port, bit] = this.pin(n);
    port.setPin(bit, Boolean(value));
  }
  setControls(controls) {
    this.controls = controls;
    this.applyInputs();
  }
  applyInputs() {
    this.adc.channelValues.fill(0);
    for (const p of this.topology.pots)
      if (p.pin >= this.layout.analogBase && p.powered)
        this.adc.channelValues[p.pin - this.layout.analogBase] =
          (Math.max(0, Math.min(1023, this.controls[p.id] ?? 512)) / 1023) * 5;
    this.applyDigitalInputs();
  }
  applyDigitalInputs() {
    if (this.applyingInputs) return;
    this.applyingInputs = true;
    try {
      if (this.topology.digital) {
        const states = Array.from(
          { length: this.layout.digitalCount },
          (_, n) => {
            const [port, bit] = this.pin(n);
            return port.pinState(bit);
          },
        );
        const sources = [];
        for (const sensor of this.topology.sensors || []) {
          let reading;
          if (sensor.type === "wokwi-pir-motion-sensor") {
            let m = this.pirMemory.get(sensor.id);
            if (!m) {
              m = { until: 0, inhibit: 0, last: false };
              this.pirMemory.set(sensor.id, m);
            }
            const motion = !!this.controls[sensor.id],
              now = this.cpu.cycles,
              delay =
                Math.max(0.01, Number(sensor.attrs.delayTime ?? 5)) * F_CPU;
            if (
              motion &&
              !m.last &&
              ((now < m.until &&
                String(sensor.attrs.retrigger ?? "") !== "0") ||
                now >= m.inhibit)
            ) {
              m.until = now + delay;
              this.cpu.addClockEvent(() => this.applyDigitalInputs(), delay);
              m.inhibit =
                m.until +
                Math.max(0, Number(sensor.attrs.inhibitTime ?? 1.2)) * F_CPU;
            }
            m.last = motion;
            reading = {
              volts: 0,
              high: sensor.powered && now < m.until,
              value: motion,
            };
          } else reading = sensorReading(sensor, this.controls[sensor.id]);
          if (sensor.powered) {
            sources.push({ net: sensor.digitalNet, high: reading.high });
            if (sensor.analog >= this.layout.analogBase)
              this.adc.channelValues[sensor.analog - this.layout.analogBase] =
                reading.volts;
          }
          this.inputStates[sensor.id] = {
            powered: sensor.powered,
            analog: Math.round((reading.volts / 5) * 1023),
            digital: sensor.powered && reading.high,
            ledPower: sensor.powered,
            ledDO: sensor.powered && !reading.high,
            ledSignal: sensor.powered && reading.high,
          };
        }
        this.runtimeControls = { ...this.controls };
        for (const relay of this.topology.peripherals || [])
          if (relay.type === "wokwi-relay-module") {
            const pin = relay.pins.IN;
            const level = pin == null ? relay.levels.IN : states[pin] === 1;
            const connected =
              relay.connectedIN && (pin == null || states[pin] < 2);
            this.runtimeControls[relay.id + ":coil"] =
              relay.powered &&
              connected &&
              (relay.attrs.activeLow === true ||
              relay.attrs.transistor === "pnp"
                ? !level
                : level);
          }
        this.levels = digitalLevels(
          this.topology,
          states,
          this.runtimeControls,
          sources,
        );
        const echoes = new Set(
          this.topology.sonars.filter((s) => s.powered).map((s) => s.echo),
        );
        for (let n = 0; n < this.layout.digitalCount; n++)
          if (states[n] >= 2 && !echoes.has(n))
            this.setInput(n, this.levels[n]);
        return;
      }
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
      for (let n = 0; n < this.layout.digitalCount; n++)
        if (!driven.has(n)) {
          const [port, bit] = this.pin(n);
          this.setInput(n, port.pinState(bit) === PinState.InputPullUp);
        }
    } finally {
      this.applyingInputs = false;
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
    this.applyDigitalInputs();
    const end = this.cpu.cycles + cycles;
    while (this.cpu.cycles < end) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
    this.pumpRx();
    this.applyDigitalInputs();
  }
  snapshot() {
    const outputs = this.outputs.snapshot(this.cpu.cycles);
    for (const p of this.topology.peripherals || [])
      if (p.type === "wokwi-relay-module")
        outputs[p.id] = {
          ...outputs[p.id],
          energized: !!this.runtimeControls[p.id + ":coil"],
        };
    return {
      cycles: this.cpu.cycles,
      seconds: this.cpu.cycles / F_CPU,
      led:
        this.ports.B.pinState(this.kind === "mega" ? 7 : 5) === PinState.High,
      baudRate: this.uart.baudRate,
      parts: {
        ...this.peripherals.snapshot(this.cpu.cycles),
        ...outputs,
        ...this.inputStates,
        ...passiveStates(
          this.topology.passive,
          Array.from({ length: this.layout.digitalCount }, (_, n) => {
            const [port, bit] = this.pin(n),
              state = port.pinState(bit);
            return state === PinState.High
              ? 5
              : state === PinState.Low
                ? 0
                : null;
          }),
          this.runtimeControls,
        ),
      },
    };
  }
}
