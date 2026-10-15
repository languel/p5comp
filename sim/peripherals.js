// Protocol decoders use emulated CPU cycles, never browser wall time.
export class PeripheralModels {
  constructor(parts = []) {
    this.parts = parts;
    this.memory = new Map(
      parts.map((p) => [
        p.id,
        {
          last: false,
          rise: null,
          angle: 0,
          pulse: 0,
          frequency: 0,
          lastRise: null,
          updated: -Infinity,
          nibble: null,
          fourBit: false,
          address: 0,
          chars: Array(p.type === "wokwi-lcd2004" ? 80 : 32).fill(32),
          display: true,
        },
      ]),
    );
  }
  tick(cycles, high) {
    for (const p of this.parts) {
      const m = this.memory.get(p.id),
        read = (n) => (p.pins[n] != null ? high(p.pins[n]) : !!p.levels?.[n]);
      if (p.type === "wokwi-servo" || p.type === "wokwi-buzzer") {
        const level = read(p.type === "wokwi-servo" ? "PWM" : "1");
        if (level && !m.last) {
          if (m.lastRise != null)
            m.frequency = 16000000 / (cycles - m.lastRise);
          m.lastRise = cycles;
          m.rise = cycles;
          m.updated = cycles;
        }
        if (!level && m.last && m.rise != null) {
          m.pulse = (cycles - m.rise) / 16;
          if (m.pulse >= 400 && m.pulse <= 2600)
            m.angle = Math.max(
              0,
              Math.min(180, ((m.pulse - 544) / (2400 - 544)) * 180),
            );
        }
        m.last = level;
      } else if (p.type.includes("lcd")) {
        const enable = read("E");
        if (!enable && m.last && !read("RW") && p.powered) {
          let data = 0;
          for (let bit = 0; bit < 8; bit++)
            if (read("D" + bit)) data |= 1 << bit;
          const rs = read("RS");
          if (!m.fourBit && (data & 0xf0) === 0x20) {
            m.fourBit = true;
            m.nibble = null;
          } else if (m.fourBit && m.nibble === null)
            m.nibble = { value: data & 0xf0, rs };
          else {
            if (m.fourBit) {
              data = m.nibble.value | ((data >> 4) & 15);
              m.nibble = null;
            }
            if (rs) {
              const cols = p.type === "wokwi-lcd2004" ? 20 : 16;
              const starts = cols === 20 ? [0, 64, 20, 84] : [0, 64];
              const row = starts.findIndex(
                (start) => m.address >= start && m.address < start + cols,
              );
              if (row >= 0)
                m.chars[row * cols + m.address - starts[row]] = data;
              m.address++;
            } else if (data === 1) {
              m.chars.fill(32);
              m.address = 0;
            } else if (data === 2) m.address = 0;
            else if (data & 128) m.address = data & 127;
            else if ((data & 0xf8) === 8) m.display = !!(data & 4);
          }
        }
        m.last = enable;
      }
    }
  }
  snapshot(cycles) {
    return Object.fromEntries(
      this.parts.map((p) => {
        const m = this.memory.get(p.id);
        if (p.type === "wokwi-servo")
          return [
            p.id,
            {
              angle: p.powered ? m.angle : 0,
              pulse: m.pulse,
              powered: p.powered,
            },
          ];
        if (p.type === "wokwi-buzzer")
          return [
            p.id,
            {
              hasSignal: p.powered && cycles - m.updated < 1600000,
              frequency: m.frequency,
              powered: p.powered,
            },
          ];
        return [
          p.id,
          {
            characters:
              p.powered && m.display ? m.chars.slice() : m.chars.map(() => 32),
            powered: p.powered,
          },
        ];
      }),
    );
  }
}
