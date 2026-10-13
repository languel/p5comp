const SIGNAL_RE =
  /([A-Za-z_][A-Za-z0-9_]*)[^A-Za-z0-9_+\-.]+([+-]?\d+(?:\.\d+)?)/g;

export function parseSignals(line) {
  const values = {};
  for (const match of line.matchAll(SIGNAL_RE)) {
    const value = Number(match[2]);
    if (Number.isFinite(value)) {
      Object.defineProperty(values, match[1], {
        value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
  }
  return values;
}

export class SignalStore extends EventTarget {
  #values = {};

  get values() {
    return this.#values;
  }

  update(nextValues) {
    const entries = Object.entries(nextValues);
    if (entries.length === 0) return false;
    for (const [name, value] of entries) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && Number.isFinite(value)) {
        Object.defineProperty(this.#values, name, {
          value,
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
    }
    this.dispatchEvent(new CustomEvent("change", { detail: this.#values }));
    return true;
  }

  clear() {
    for (const name of Object.keys(this.#values)) delete this.#values[name];
    this.dispatchEvent(new CustomEvent("change", { detail: this.#values }));
  }
}
