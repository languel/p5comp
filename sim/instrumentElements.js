import "./Plotter.js";
import { LitElement, html, svg, css } from "lit";
class Multimeter extends LitElement {
  static properties = { mode: { type: String }, measurement: { state: true } };
  static styles = css`
    :host {
      display: block;
    }
    svg {
      display: block;
      overflow: visible;
    }
    text {
      font-family: ui-monospace, monospace;
    }
    .control {
      cursor: pointer;
      outline: none;
    }
    .control:focus-visible {
      outline: 1px dashed #999;
    }
  `;
  constructor() {
    super();
    this.mode = "voltage";
    this.measurement = {};
  }
  get pinInfo() {
    return [
      { name: "COM", x: 24, y: 111, signals: [] },
      { name: "V+", x: 66, y: 111, signals: [] },
    ];
  }
  render() {
    const m = this.measurement;
    return html`<svg width="90" height="111" viewBox="0 0 90 111">
      <rect
        x="2"
        y="2"
        width="86"
        height="100"
        rx="10"
        fill="#b9a05e"
        stroke="#706442"
        stroke-width="2"
      />
      <rect
        x="8"
        y="9"
        width="74"
        height="34"
        rx="3"
        fill="#c7d0b5"
        stroke="#464b40"
      />
      <text x="45" y="30" text-anchor="middle" fill="#28332c" font-size="17">
        ${m.reading || "—"}
      </text>
      <text x="75" y="40" text-anchor="end" fill="#374336" font-size="8">
        ${m.units || "V"}
      </text>
      ${["voltage", "current", "resistance"].map(
        (mode, i) =>
          svg`<g class="control" data-active-control role="button" tabindex="0" aria-label=${`Measure ${mode}`} @pointerdown=${(e) => e.stopPropagation()} @click=${() => {
            this.mode = mode;
            this.dispatchEvent(
              new CustomEvent("mode-change", {
                detail: mode,
                bubbles: true,
                composed: true,
              }),
            );
          }} @keydown=${(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
              );
            }
          }}><rect x=${8 + i * 25} y="50" width="23" height="23" rx="4" fill=${mode === this.mode ? "#4c514d" : "#827448"}/><text x=${19.5 + i * 25} y="65" text-anchor="middle" fill="#f0eee2" font-size="10">${["V", "mA", "Ω"][i]}</text></g>`,
      )}
      <circle cx="24" cy="89" r="6" fill="#17191a" />
      <circle cx="66" cy="89" r="6" fill="#ba5555" />
      <text x="24" y="81" text-anchor="middle" font-size="7" fill="#292c2b">
        COM
      </text>
      <text x="66" y="81" text-anchor="middle" font-size="7" fill="#292c2b">
        VΩmA
      </text>
      <path d="M24 95v16" stroke="#282a2a" stroke-width="3" />
      <path d="M66 95v16" stroke="#b95d5d" stroke-width="3" />
      <title>
        ${m.warning || "V: parallel · mA: series · Ω: disconnect power"}
      </title>
    </svg>`;
  }
}
class SignalProbe extends LitElement {
  static properties = { measurement: { state: true } };
  static styles = Multimeter.styles;
  constructor() {
    super();
    this.measurement = {};
  }
  get pinInfo() {
    return [
      { name: "GND", x: 20, y: 88, signals: [] },
      { name: "SIG", x: 110, y: 88, signals: [] },
    ];
  }
  render() {
    const m = this.measurement;
    let d = "";
    let last = 0;
    for (const [x, y] of m.samples || []) {
      if (x < 0 || x > 1) continue;
      d += `${d ? "H" : "M"}${(9 + x * 112).toFixed(2)}${d ? "" : ` ${last ? 27 : 48}`}V${y ? 27 : 48}`;
      last = y;
    }
    if (d) d += "H121";
    else d = `M9 ${Number(m.voltage) > 2.5 ? 27 : 48}H121`;
    return html`<svg width="130" height="88" viewBox="0 0 130 88">
      <rect
        x="2"
        y="2"
        width="126"
        height="77"
        rx="6"
        fill="#44494e"
        stroke="#7c838a"
      />
      <rect x="6" y="6" width="118" height="59" rx="3" fill="#191e23" />
      <path
        d="M9 27H121M9 48H121M37 23v30M65 23v30M93 23v30"
        stroke="#4c555c"
        stroke-width=".4"
      />
      <path d=${d} fill="none" stroke="#91baac" stroke-width="1.3" />
      <text x="10" y="18" fill="#d4dadc" font-size="8">
        ${m.reading || "FLOAT"}
      </text>
      <text x="10" y="61" fill="#a8b4ba" font-size="7">
        ${(m.frequency || 0).toFixed(0)}Hz ·
        ${m.duty == null ? "—" : (m.duty * 100).toFixed(0) + "%"}
      </text>
      <text x="20" y="75" text-anchor="middle" fill="#ddd" font-size="7">
        GND
      </text>
      <text x="110" y="75" text-anchor="middle" fill="#ddd" font-size="7">
        SIG
      </text>
      <path d="M20 79v9" stroke="#282a2a" stroke-width="3" />
      <path d="M110 79v9" stroke="#a5bdb2" stroke-width="3" />
      <title>
        ${m.warning || "Signal probe · voltage, frequency, duty cycle · last 50 ms"}
      </title>
    </svg>`;
  }
}
customElements.define("p5comp-multimeter", Multimeter);
customElements.define("p5comp-signal-probe", SignalProbe);

class PowerReference extends LitElement {
  static properties = { ground: {type: Boolean} };
  static styles = Multimeter.styles;
  get pinInfo() { return [{name: this.ground ? "GND" : "VCC", x: 20, y: this.ground ? 0 : 40, signals: []}]; }
  render() { return html`<svg width="40" height="40" viewBox="0 0 40 40"><path d=${this.ground ? "M20 0v17M7 17h26M11 23h18M16 29h8" : "M20 40V14M11 23l9-12 9 12"} fill="none" stroke=${this.ground ? "#707477" : "#bf7770"} stroke-width="2"/><text x="20" y=${this.ground ? 39 : 8} text-anchor="middle" fill="currentColor" font-size="8">${this.ground ? "GND" : "VCC 5V"}</text></svg>`; }
}
class GroundReference extends PowerReference { constructor() { super(); this.ground = true; } }
customElements.define("p5comp-ground", GroundReference);
customElements.define("p5comp-vcc", PowerReference);
