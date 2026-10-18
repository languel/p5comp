import { LitElement, html, svg, css } from "lit";
class SimplePart extends LitElement {
  static properties = {
    value: { type: String },
    color: { type: String },
  };
  static styles = css`
    :host {
      display: inline-block;
      color: #72767a;
    }
    svg {
      display: block;
      overflow: visible;
    }
    [data-active-control]:focus {
      outline: none;
    }
    [data-active-control]:focus-visible {
      outline: 1px dashed #92969b;
      outline-offset: 3px;
    }
    .lead {
      stroke: #939698;
      stroke-width: 2;
      fill: none;
    }
    .body {
      fill: #dbd6c6;
      stroke: #777b80;
      stroke-width: 1.5;
    }
    text {
      font: 9px system-ui;
      fill: #42454a;
    }
    input {
      display: block;
      width: 66px;
      margin: 7px 7px 0;
      accent-color: #92969b;
    }
    button {
      border: 0;
      background: none;
      padding: 0;
      cursor: pointer;
    }
    input[type="range"] {
      appearance: none;
      height: 2px;
      background: #7778;
    }
    input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 7px;
      height: 13px;
      background: #96999e;
      border-radius: 1px;
    }
  `;
  constructor() {
    super();
    this.value = "0";
    this.rl10 = 50;
    this.gamma = 0.7;
    this.color = "#d9c69e";
  }
  emit(value) {
    this.value = String(value);
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
}
class SimpleToggle extends SimplePart {
  get pinInfo() {
    return [
      { name: "1", x: 19, y: 29, signals: [] },
      { name: "2", x: 28.5, y: 29, signals: [] },
    ];
  }
  render() {
    const on = Number(this.value) !== 0;
    return html`<svg width="48" height="29" viewBox="0 0 48 29">
      <defs>
        <linearGradient id="plate" x2="0" y2="1">
          <stop stop-color="#e3e4df" /><stop offset="1" stop-color="#b0b4b3" />
        </linearGradient>
        <linearGradient id="lever" x2="0" y2="1">
          <stop stop-color="#f3f4f2" /><stop offset=".45" stop-color="#c7cccd" /><stop offset="1" stop-color="#858c8f" />
        </linearGradient>
      </defs>
      <path class="lead" d="M19 22v7m9.5-7v7" />
      <rect x="1" y="1" width="46" height="22" rx="4" fill="url(#plate)" stroke="#777d7f" stroke-width="1" />
      <rect x="3" y="8" width="11" height="8" rx="1.5" fill=${on ? "#4a4e50" : "#272b2d"} />
      <rect x="34" y="8" width="11" height="8" rx="1.5" fill=${on ? "#a32f2a" : "#75413d"} />
      <text x="8.5" y="13.8" text-anchor="middle" style="font:600 5px system-ui;fill:#f1f0e9">OFF</text>
      <text x="39.5" y="13.8" text-anchor="middle" style="font:600 5px system-ui;fill:#fff2e8">ON</text>
      <path d="M24 3.5l7.5 4.2v8.6L24 20.5l-7.5-4.2V7.7z" fill="#bfc3c2" stroke="#747b7d" stroke-width=".8" />
      <circle cx="24" cy="12" r="7" fill="#e4e6e2" stroke="#8c9394" stroke-width=".7" />
      <circle cx="24" cy="12" r="4.7" fill="#555d60" stroke="#a2a8a7" stroke-width="1" />
      <g
        data-active-control
        role="switch"
        tabindex="0"
        aria-label="Toggle switch"
        aria-checked=${on}
        style="cursor:pointer"
        @pointerdown=${(e) => e.stopPropagation()}
        @click=${() => this.emit(on ? 0 : 1)}
        @keydown=${(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            this.emit(on ? 0 : 1);
          }
        }}
      >
        <title>${on ? "On (I)" : "Off (O)"} · click lever</title>
        <path
          d=${on ? "M24 12L31 12" : "M24 12L17 12"}
          stroke="#737b7e"
          stroke-width="6.5"
          stroke-linecap="round"
        />
        <path
          d=${on ? "M24 11.3L31 11.3" : "M24 11.3L17 11.3"}
          stroke="url(#lever)"
          stroke-width="5"
          stroke-linecap="round"
        />
        <circle cx=${on ? 31 : 17} cy="11.3" r="2.5" fill="#dde0de" />
      </g>
    </svg>`;
  }
}
class SimpleSlideSwitch extends SimplePart {
  get pinInfo() {
    return [1, 2, 3].map((name, i) => ({ name: String(name), x: 9.5 + i * 9.5, y: 28.5, signals: [] }));
  }
  render() {
    const on = Number(this.value) !== 0;
    return html`<svg width="38" height="28.5" viewBox="0 0 38 28.5">
      <path class="lead" d="M9.5 17v11.5M19 17v11.5M28.5 17v11.5" />
      <rect x="1" y="1" width="36" height="18" rx="3" fill="#55595a" stroke="#777c7d" stroke-width=".7" />
      <rect x="6" y="4" width="26" height="12" rx=".5" fill="#202425" />
      <text x=${on ? 12.5 : 25.5} y="11.7" text-anchor="middle" style="font:600 4.5px system-ui;fill:#e5e7e4">${on ? "ON" : "OFF"}</text>
      <g data-active-control role="switch" tabindex="0" aria-label="Slide switch" aria-checked=${on}
        style="cursor:ew-resize"
        @pointerdown=${e => { e.stopPropagation(); this._startX = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }}
        @pointerup=${e => { e.stopPropagation(); const dx = e.clientX - this._startX; this.emit(Math.abs(dx) > 3 ? (dx > 0 ? 1 : 0) : (on ? 0 : 1)); }}
        @keydown=${e => { if ([" ", "Enter", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); this.emit(e.key === "ArrowLeft" ? 0 : e.key === "ArrowRight" ? 1 : on ? 0 : 1); } }}>
        <title>${on ? "ON · 2–3" : "OFF · 2–1"} · slide or click thumb · drag body to move</title>
        <rect x=${on ? 20 : 6} y="4" width="12" height="12" fill="#343839" />
        ${[2, 4.5, 7, 9.5].map(x => svg`<path d=${`M${(on ? 20 : 6) + x} 5.5v9`} stroke="#b4b8b8" stroke-width="1.2" />`)}
      </g>
    </svg>`;
  }
}
class SimpleDipSwitch extends SimplePart {
  static properties = { values: { type: Array } };
  constructor() { super(); this.values = []; }
  get count() { return Number(this.localName.split("-").at(-1)); }
  get pinInfo() {
    return Array.from({ length: this.count }, (_, i) => [
      { name: `${i + 1}a`, x: 9.5 + i * 9.5, y: 0, signals: [] },
      { name: `${i + 1}b`, x: 9.5 + i * 9.5, y: 38, signals: [] },
    ]).flat();
  }
  change(i, value) {
    this.values = Array.from({length:this.count}, (_, n) => n === i ? Number(value) : Number(this.values[n] || 0));
    this.dispatchEvent(new Event("switch-change", {bubbles:true, composed:true}));
  }
  render() {
    const width = (this.count + 1) * 9.5;
    return html`<svg width=${width} height="38" viewBox=${`0 0 ${width} 38`}>
      ${this.pinInfo.map(pin => svg`<path class="lead" d=${`M${pin.x} ${pin.y}v${pin.y ? -6 : 6}`} />`)}
      <rect x="2" y="5" width=${width-4} height="28" rx="1.5" fill=${this.count === 4 ? "#177bb6" : "#b92b25"} stroke="#6b5551" stroke-width=".6" />
      <text x="4.5" y="10.5" style="font:600 4px system-ui;fill:#fff">ON ↑</text>
      ${Array.from({length:this.count}, (_,i) => {
        const x = 9.5+i*9.5, on = !!this.values[i];
        return svg`<g data-active-control role="switch" tabindex="0" aria-label=${`DIP switch ${i+1}`} aria-checked=${on}
          style="cursor:pointer" @pointerdown=${e=>e.stopPropagation()} @click=${()=>this.change(i,!on)}
          @keydown=${e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();e.stopPropagation();this.change(i,!on);}}}>
          <title>Switch ${i+1}: ${on ? "ON" : "OFF"}</title>
          <rect x=${x-3} y="13" width="6" height="12" rx=".5" fill="#78231f" stroke="#eee" stroke-width=".4" />
          <rect x=${x-2.5} y=${on ? 13.5 : 19} width="5" height="5.5" fill="#e7e8e1" stroke="#a3a8a5" stroke-width=".5" />
          <path d=${`M${x-1.7} ${on ? 15.3 : 20.8}h3.4`} stroke="#fff" stroke-width=".7" />
        </g><text x=${x} y="30" text-anchor="middle" style="font:5px system-ui;fill:white">${i+1}</text>`;
      })}
    </svg>`;
  }
}
class PotControl extends SimplePart {
  static properties = { maxResistance: { type: String } };
  constructor() {
    super();
    this.value = "512";
    this.maxResistance = "10000";
  }
  adjust(e) {
    const keys = {
      ArrowRight: 16,
      ArrowUp: 16,
      ArrowLeft: -16,
      ArrowDown: -16,
    };
    if (e.key in keys || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      this.emit(
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 1023
            : Math.max(0, Math.min(1023, Number(this.value) + keys[e.key])),
      );
    }
  }
  drag(e, slide = false) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget,
      svg = target.ownerSVGElement;
    target.setPointerCapture(e.pointerId);
    const move = (event) => {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        svg.getScreenCTM().inverse(),
      );
      const ratio = slide
        ? (point.x - 15) / 130
        : ((Math.atan2(point.x - 39, 28 - point.y) * 180) / Math.PI + 135) /
          270;
      this.emit(Math.round(Math.max(0, Math.min(1, ratio)) * 1023));
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    if (slide) move(e);
  }
}
class SimplePot extends PotControl {
  constructor() {
    super();
    this.color = "#2685b0";
  }
  get pinInfo() {
    return [
      { name: "GND", x: 10, y: 35, signals: [] },
      { name: "SIG", x: 19.5, y: 35, signals: [] },
      { name: "VCC", x: 29, y: 35, signals: [] },
    ];
  }
  render() {
    const angle = -135 + (Number(this.value) / 1023) * 270;
    return html`<svg width="39" height="35" viewBox="0 0 78 70">
      <defs>
        <linearGradient id="blue" x2=".7" y2="1">
          <stop stop-color="#ffffff" stop-opacity=".2" />
          <stop offset="1" stop-color="#000000" stop-opacity=".25" />
        </linearGradient>
      </defs>
      <path d="M20 48v22m19-22v22m19-22v22" stroke="#adb1b4" stroke-width="4" />
      <rect
        x="8"
        y="8"
        width="62"
        height="49"
        rx="3"
        fill="#d7d9d5"
        stroke="#a5a7a3"
      />
      <path d="M14 49h11m9 0h10m9 0h11" stroke="#909699" stroke-width="5" />
      <circle
        cx="39"
        cy="29"
        r="27"
        fill=${this.color}
        stroke="#000000"
        stroke-opacity=".25"
      />
      <g
        data-active-control
        role="slider"
        tabindex="0"
        aria-label="Potentiometer dial"
        aria-valuemin="0"
        aria-valuemax="1023"
        aria-valuenow=${this.value}
        style="cursor:grab;touch-action:none"
        @pointerdown=${(e) => this.drag(e)}
        @keydown=${(e) => this.adjust(e)}
      >
        <title>
          Drag dial · arrow keys adjust · ${this.maxResistance} Ω total
        </title>
        <circle cx="39" cy="27" r="24" fill=${this.color} />
        <circle
          cx="39"
          cy="27"
          r="24"
          fill="url(#blue)"
          stroke="#51a3c9"
          stroke-width="1"
        />
        <circle
          cx="39"
          cy="27"
          r="19"
          fill="none"
          stroke="#6bb0cd"
          stroke-opacity=".35"
        />
        <g transform=${`rotate(${angle} 39 28)`}>
          <path
            d="M39 11v27"
            stroke="#104e70"
            stroke-width="6"
            stroke-linecap="round"
          />
          <path
            d="M37 11v27"
            stroke="#78b6ce"
            stroke-opacity=".5"
            stroke-width="1"
          />
        </g>
      </g>
    </svg>`;
  }
}
class SimpleSlidePot extends PotControl {
  get pinInfo() {
    return [
      { name: "GND", x: 20, y: 42, signals: [] },
      { name: "SIG", x: 125, y: 42, signals: [] },
      { name: "VCC", x: 140, y: 42, signals: [] },
    ];
  }
  render() {
    const x = 15 + (Number(this.value) / 1023) * 130;
    return html`<svg width="160" height="42" viewBox="0 0 160 42">
      <path
        d="M20 31v11m105-11v11m15-11v11"
        stroke="#aeb1b3"
        stroke-width="3"
      />
      <rect
        x="2"
        y="14"
        width="156"
        height="19"
        rx="2"
        fill="#36383a"
        stroke="#727477"
      />
      <path d="M10 17h140" stroke="#929597" />
      <path d="M15 20h130" stroke="#121314" stroke-width="4" />
      <circle cx="6" cy="28" r="1.5" fill="#a1a3a5" />
      <circle cx="154" cy="28" r="1.5" fill="#a1a3a5" />
      <g
        data-active-control
        role="slider"
        tabindex="0"
        aria-label="Slide potentiometer handle"
        aria-valuemin="0"
        aria-valuemax="1023"
        aria-valuenow=${this.value}
        style="cursor:ew-resize;touch-action:none"
        @pointerdown=${(e) => this.drag(e, true)}
        @keydown=${(e) => this.adjust(e)}
      >
        <title>
          Drag handle · arrow keys adjust · ${this.maxResistance} Ω total
        </title>
        <rect
          x=${x - 6}
          y="11"
          width="12"
          height="12"
          rx="1"
          fill="#202224"
          stroke="#888b8d"
        />
        <rect x=${x - 2.5} y="2" width="5" height="13" rx="1" fill="#b1b3b5" />
        <path d=${`M${x} 3v10`} stroke="#63676a" />
      </g>
    </svg>`;
  }
}
class SimplePhoto extends SimplePart {
  static properties = {
    rl10: { type: Number },
    gamma: { type: Number },
    _lightOpen: { state: true },
  };
  static styles = [
    SimplePart.styles,
    css`
      :host {
        position: relative;
      }
      .light-control {
        position: absolute;
        bottom: calc(100% + 7px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--ui-line, #555);
        border-radius: 6px;
        background: var(--ui-panel, #292929);
        color: var(--ui-text, #ddd);
        box-shadow: 0 3px 10px #0003;
        z-index: 10;
      }
      .light-control input {
        width: 80px;
        margin: 0;
        accent-color: var(--ui-quiet, #999);
      }
      .light-control input::-webkit-slider-thumb {
        background: var(--ui-quiet, #999);
      }
      .sun {
        flex: none;
        overflow: visible;
      }
    `,
  ];
  constructor() {
    super();
    this.value = "100";
    this._lightOpen = false;
  }
  connectedCallback() {
    super.connectedCallback();
    this._outside = (e) => {
      if (!e.composedPath().includes(this)) this._lightOpen = false;
    };
    this._escape = (e) => {
      if (e.key === "Escape" && this._lightOpen) {
        this._lightOpen = false;
        e.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", this._outside);
    document.addEventListener("keydown", this._escape, true);
  }
  disconnectedCallback() {
    document.removeEventListener("pointerdown", this._outside);
    document.removeEventListener("keydown", this._escape, true);
    super.disconnectedCallback();
  }
  get pinInfo() {
    return [
      { name: "1", x: 10, y: 35, signals: [] },
      { name: "2", x: 19.5, y: 35, signals: [] },
    ];
  }
  render() {
    const light = Math.max(0, Math.min(1, Number(this.value) / 1000));
    return html` ${
        this._lightOpen
          ? html`<div
              class="light-control"
              data-active-control
              @pointerdown=${(e) => e.stopPropagation()}
            >
              <svg
                class="sun"
                width="19"
                height="19"
                viewBox="0 0 24 24"
                aria-hidden="true"
                style=${`color:rgb(${Math.round(125 + 130 * light)},${Math.round(122 + 111 * light)},${Math.round(115 + 50 * light)});filter:drop-shadow(0 0 ${light * 5}px currentColor)`}
              >
                <circle cx="12" cy="12" r="4" fill="currentColor" />
                <path
                  d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12l2 2M4 20l2-2M18 6l2-2"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
              <input
                aria-label="Light level lux"
                title=${`${this.value} lux`}
                type="range"
                min="1"
                max="1000"
                .value=${String(this.value)}
                @input=${(e) => this.emit(e.target.value)}
              />
            </div>`
          : ""
      }
      <svg width="30" height="35" viewBox="0 0 30 35">
        <path d="M10 22v13m9.5-13v13" stroke="#a9acaa" stroke-width="2" />
        <circle
          cx="15"
          cy="13"
          r="12.3"
          fill="#a47e58"
          stroke="#795b41"
          stroke-width=".7"
        />
        <circle
          cx="15"
          cy="12.5"
          r="11"
          fill=${this.color}
          stroke="#d9c9a4"
          stroke-width=".7"
        />
        <g
          data-active-control
          role="button"
          tabindex="0"
          aria-label="Photocell light control"
          aria-expanded=${this._lightOpen}
          style="cursor:pointer"
          @pointerdown=${(e) => e.stopPropagation()}
          @click=${() => (this._lightOpen = !this._lightOpen)}
          @keydown=${(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              this._lightOpen = !this._lightOpen;
            }
          }}
        >
          <title>Click to adjust light · drag the rim to move</title>
          <circle cx="15" cy="12.5" r="9.7" fill="transparent" />
          <path
            d="M19 3H12Q8 3 8 5t4 2h6q4 0 4 2t-4 2h-6q-4 0-4 2t4 2h6q4 0 4 2t-4 2h-6q-4 0-4 2h10"
            transform="translate(15 12.5) scale(.82) translate(-15 -12.5)"
            fill="none"
            stroke="#986044"
            stroke-width="1.35"
            stroke-linecap="round"
          />
          <circle
            cx="6.5"
            cy="12.5"
            r="1.7"
            fill="#a2966d"
            stroke="#cfc39a"
            stroke-width=".5"
          />
          <circle
            cx="23.5"
            cy="12.5"
            r="1.7"
            fill="#a2966d"
            stroke="#cfc39a"
            stroke-width=".5"
          />
        </g>
      </svg>`;
  }
}
class SimpleCapacitor extends SimplePart {
  constructor() {
    super();
    this.value = "100nF";
  }
  get pinInfo() {
    return [
      { name: "1", x: 0, y: 18, signals: [] },
      { name: "2", x: 60, y: 18, signals: [] },
    ];
  }
  render() {
    return html`<svg width="60" height="36" viewBox="0 0 60 36">
      <path class="lead" d="M0 18h25m10 0h25" />
      <path d="M25 5v26m10-26v26" stroke=${this.color} stroke-width="4" />
    </svg>`;
  }
}
for (const [tag, type] of [
  ["p5comp-toggle-switch", SimpleToggle],
  ["p5comp-slide-switch", SimpleSlideSwitch],
  ["p5comp-dip-switch-1", class extends SimpleDipSwitch {}],
  ["p5comp-dip-switch-4", class extends SimpleDipSwitch {}],
  ["p5comp-dip-switch-6", class extends SimpleDipSwitch {}],
  ["p5comp-potentiometer", SimplePot],
  ["p5comp-slide-potentiometer", SimpleSlidePot],
  ["p5comp-photoresistor", SimplePhoto],
  ["p5comp-capacitor", SimpleCapacitor],
])
  if (!customElements.get(tag)) customElements.define(tag, type);
