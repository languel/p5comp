export const isNeoPixel = (type) =>
  [
    "wokwi-neopixel",
    "wokwi-led-ring",
    "wokwi-led-strip",
    "wokwi-neopixel-matrix",
  ].includes(type);
export function pixelCount(p) {
  return p.type === "wokwi-neopixel"
    ? 1
    : p.type === "wokwi-neopixel-matrix"
      ? Math.max(
          1,
          Math.min(
            256,
            Number(p.attrs?.rows || 8) * Number(p.attrs?.cols || 8),
          ),
        )
      : Math.max(
          1,
          Math.min(
            256,
            Number(p.attrs?.pixels || (p.type === "wokwi-led-ring" ? 16 : 8)),
          ),
        );
}
export class NeoPixelDecoder {
  constructor(count = 1, offset = 0, order = "GRB") {
    this.count = count;
    this.offset = offset;
    this.order = /^(RGB|GRB|BRG|RBG|GBR|BGR)$/.test(order) ? order : "GRB";
    this.colors = Array.from({ length: count }, () => ({ r: 0, g: 0, b: 0 }));
    this.bits = [];
    this.last = false;
    this.rise = 0;
    this.fall = 0;
  }
  latch() {
    if (this.bits.length >= (this.offset + this.count) * 24) {
      for (let i = 0; i < this.count; i++) {
        const color = {};
        for (let channel = 0; channel < 3; channel++) {
          let byte = 0;
          for (let b = 0; b < 8; b++)
            byte =
              (byte << 1) | this.bits[(this.offset + i) * 24 + channel * 8 + b];
          color[this.order[channel].toLowerCase()] = byte / 255;
        }
        this.colors[i] = color;
      }
    }
    this.bits = [];
  }
  tick(cycles, level) {
    if (level === this.last) return;
    if (level) {
      if (cycles - this.fall >= 800) this.latch();
      this.rise = cycles;
    } else {
      const width = cycles - this.rise;
      if (
        width >= 2 &&
        width <= 32 &&
        this.bits.length < (this.offset + this.count) * 24
      )
        this.bits.push(width >= 9 ? 1 : 0);
      else if (width > 32) this.bits = [];
      this.fall = cycles;
    }
    this.last = level;
  }
  snapshot(cycles) {
    if (!this.last && cycles - this.fall >= 800) this.latch();
    return this.colors.map((c) => ({ ...c }));
  }
}
export class ExtendedOutputs {
  constructor(parts = []) {
    this.parts = parts;
    this.memory = new Map(
      parts.map((p) => [
        p.id,
        {
          last: false,
          steps: 0,
          angle: 0,
          phase: null,
          innerPhase: null,
          innerAngle: 0,
          decoder: isNeoPixel(p.type)
            ? new NeoPixelDecoder(
                p.count,
                p.offset,
                p.attrs.colorOrder || "GRB",
              )
            : null,
        },
      ]),
    );
  }
  tick(cycles, high) {
    for (const p of this.parts) {
      const m = this.memory.get(p.id),
        read = (n) => (p.pins[n] != null ? high(p.pins[n]) : !!p.levels?.[n]);
      if (m.decoder) {
        m.decoder.tick(cycles, read("DIN"));
        continue;
      }
      if (p.type === "wokwi-relay-module") {
        m.energized =
          p.powered &&
          p.connectedIN &&
          (p.attrs.activeLow === true || p.attrs.transistor === "pnp"
            ? !read("IN")
            : read("IN"));
        continue;
      }
      if (p.type === "wokwi-a4988") {
        const level = read("STEP");
        m.enabled =
          p.powered && !read("ENABLE") && read("RESET") && read("SLEEP");
        if (!read("RESET")) {
          m.angle = 0;
          m.steps = 0;
        }
        if (level && !m.last && m.enabled) {
          const mode =
            Number(read("MS1")) +
            Number(read("MS2")) * 2 +
            Number(read("MS3")) * 4;
          const divisor = { 0: 1, 1: 2, 2: 4, 3: 8, 7: 16 }[mode] || 1;
          const dir = read("DIR") ? 1 : -1;
          m.steps += dir / divisor;
          m.angle = m.steps * 1.8;
        }
        m.last = level;
        continue;
      }
      if (
        p.type === "wokwi-stepper-motor" ||
        p.type === "wokwi-biaxial-stepper"
      ) {
        const step = (names, key, angleKey) => {
          const a = Number(read(names[0])) - Number(read(names[1])),
            b = Number(read(names[2])) - Number(read(names[3]));
          const phase = [
            [1, 0],
            [1, 1],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [-1, -1],
            [0, -1],
            [1, -1],
          ].findIndex((v) => v[0] === a && v[1] === b);
          if (phase < 0) return;
          let delta = m[key] === null ? 0 : ((phase - m[key] + 12) % 8) - 4;
          if (Math.abs(delta) > 2) delta = 0;
          m[angleKey] +=
            (delta * 180) /
            Math.max(1, Number(p.attrs.stepsPerRevolution || 200));
          m[key] = phase;
        };
        if (p.type === "wokwi-stepper-motor")
          step(["A+", "A-", "B+", "B-"], "phase", "angle");
        else {
          step(["A1+", "A1-", "B1+", "B1-"], "phase", "angle");
          step(["A2+", "A2-", "B2+", "B2-"], "innerPhase", "innerAngle");
        }
      }
    }
  }
  snapshot(cycles) {
    const result = {};
    for (const p of this.parts) {
      const m = this.memory.get(p.id);
      if (m.decoder) {
        const pixels = p.powered
          ? m.decoder.snapshot(cycles)
          : Array.from({ length: p.count }, () => ({ r: 0, g: 0, b: 0 }));
        result[p.id] = { pixels, powered: p.powered };
      } else if (p.type === "wokwi-relay-module")
        result[p.id] = { energized: !!m.energized, powered: p.powered };
      else if (p.type === "wokwi-a4988")
        result[p.id] = {
          angle: m.angle,
          steps: m.steps,
          active: !!m.enabled,
          powered: p.powered,
        };
      else {
        const driver = p.driver ? this.memory.get(p.driver) : null;
        result[p.id] = {
          angle: driver?.angle ?? m.angle,
          steps: driver?.steps ?? m.angle / 1.8,
          outerHandAngle: m.angle,
          innerHandAngle: m.innerAngle,
        };
      }
    }
    return result;
  }
}
