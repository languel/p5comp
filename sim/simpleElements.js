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
      { name: "1", x: 14, y: 55, signals: [] },
      { name: "2", x: 33, y: 55, signals: [] },
    ];
  }
  render() {
    const on = Number(this.value) !== 0;
    return html`<svg width="48" height="55" viewBox="0 0 48 55">
      <path class="lead" d="M14 39v16m19-16v16" />
      <rect class="body" x="3" y="18" width="42" height="23" rx="4" />
      <text x="7" y="30">O</text>
      <text x="36" y="30">I</text>
      <circle cx="24" cy="28" r="9" fill="#797e83" />
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
          d=${on ? "M24 28L34 4" : "M24 28L14 4"}
          stroke="#c3c5c7"
          stroke-width="7"
          stroke-linecap="round"
        />
        <circle cx=${on ? 34 : 14} cy="4" r="3.5" fill="#a1a4a7" />
      </g>
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
  ["p5comp-potentiometer", SimplePot],
  ["p5comp-slide-potentiometer", SimpleSlidePot],
  ["p5comp-photoresistor", SimplePhoto],
  ["p5comp-capacitor", SimpleCapacitor],
])
  if (!customElements.get(tag)) customElements.define(tag, type);
