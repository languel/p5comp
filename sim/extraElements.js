import { LitElement, html, svg, css } from "lit";
import { extraCatalog } from "./extraCatalog.js";
class ModuleSymbol extends LitElement {
  static properties = {
    energized: { type: Boolean },
    active: { type: Boolean },
  };
  static styles = css`
    :host {
      display: inline-block;
    }
    svg {
      display: block;
    }
    text {
      font-family: system-ui;
      font-size: 8px;
      fill: #eee;
    }
    .pin {
      fill: #baa77e;
    }
    .board {
      fill: #3e5963;
      stroke: #91a1a5;
    }
  `;
  get definition() {
    return extraCatalog.find((e) => e.type === this.tagName.toLowerCase());
  }
  get pinInfo() {
    return this.definition.pins.map((name, i) => ({
      name,
      x: i < this.definition.pins.length / 2 ? 3 : 137,
      y: 18 + (i % (this.definition.pins.length / 2)) * 16,
      signals: [],
    }));
  }
  render() {
    const relay = this.tagName.toLowerCase().includes("relay");
    const h = relay ? 90 : 150;
    return html`<svg width="140" height=${h} viewBox=${`0 0 140 ${h}`}>
      <rect class="board" x="3" y="3" width="134" height=${h - 6} rx="5" />
      <rect
        x="47"
        y="30"
        width="46"
        height="35"
        rx="3"
        fill=${this.energized ? "#799b85" : "#526b83"}
      />
      <text x="70" y="22" text-anchor="middle">
        ${relay ? "RELAY" : "A4988"}
      </text>
      ${relay ? svg`<path d=${this.energized ? "M55 50 L83 40" : "M55 50 L83 60"} stroke="#eee" stroke-width="2"/>` : svg`<text x="70" y="51" text-anchor="middle">STEP / DIR</text>`}${this.pinInfo.map((p) => svg`<circle class="pin" cx=${p.x} cy=${p.y} r="2.5"/><text x=${p.x === 3 ? 10 : 130} y=${p.y + 3} text-anchor=${p.x === 3 ? "start" : "end"}>${p.name}</text>`)}
    </svg>`;
  }
}
class RelaySymbol extends ModuleSymbol {}
class DriverSymbol extends ModuleSymbol {}
class PixelStrip extends LitElement {
  static properties = { pixels: { type: Number }, colors: { state: true } };
  static styles = css`
    :host {
      display: inline-block;
    }
    svg {
      display: block;
    }
    text {
      font: 7px system-ui;
      fill: #eee;
    }
  `;
  constructor() {
    super();
    this.pixels = 8;
    this.colors = [];
  }
  get pinInfo() {
    return [
      { name: "VCC", x: 4, y: 8, signals: [] },
      { name: "GND", x: 4, y: 20, signals: [] },
      { name: "DIN", x: 4, y: 32, signals: [] },
      { name: "DOUT", x: this.width - 4, y: 32, signals: [] },
    ];
  }
  get width() {
    return Math.max(100, Math.min(256, this.pixels) * 20 + 40);
  }
  setPixel(index, color) {
    this.colors[index] = color;
    this.requestUpdate();
  }
  reset() {
    this.colors = [];
    this.requestUpdate();
  }
  render() {
    return html`<svg
      width=${this.width}
      height="42"
      viewBox=${`0 0 ${this.width} 42`}
    >
      <rect
        x="4"
        y="2"
        width=${this.width - 8}
        height="38"
        rx="4"
        fill="#333"
      />
      ${Array.from({ length: Math.min(256, this.pixels) }, (_, i) => {
        const c = this.colors[i] || { r: 0, g: 0, b: 0 };
        return svg`<rect x=${25 + i * 20} y="11" width="14" height="18" rx="2" fill=${`rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`} stroke="#999"/>`;
      })}${this.pinInfo.map((p) => svg`<circle cx=${p.x} cy=${p.y} r="2" fill="#c6b98a"/>`)}
    </svg>`;
  }
  updated(changes) {
    if (changes.has("pixels"))
      this.dispatchEvent(new CustomEvent("pininfo-change"));
  }
}
if (!customElements.get("wokwi-relay-module"))
  customElements.define("wokwi-relay-module", RelaySymbol);
if (!customElements.get("wokwi-a4988"))
  customElements.define("wokwi-a4988", DriverSymbol);
if (!customElements.get("wokwi-led-strip"))
  customElements.define("wokwi-led-strip", PixelStrip);
