import { LitElement, html, svg, css } from "lit";
import { foundationCatalog } from "./foundationCatalog.js";
const pin = (name, x, y) => ({ name, x, y, signals: [] });
class FoundationPart extends LitElement {
  static properties = { measurement: { state: true } };
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
    button {
      color: inherit;
      background: none;
      border: 0;
    }
  `;
  constructor() {
    super();
    this.measurement = {};
    Object.assign(this, this.constructor.info.attrs);
  }
  get info() {
    return this.constructor.info;
  }
  get pinInfo() {
    const t = this.info.type;
    if (["p5comp-opamp", "p5comp-comparator"].includes(t))
      return [
        pin("IN+", 0, 24),
        pin("IN-", 0, 52),
        pin("OUT", 100, 38),
        pin("V+", 48, 0),
        pin("V-", 48, 76),
      ];
    if (t === "p5comp-555")
      return [
        pin("GND", 0, 25),
        pin("TRIG", 0, 44),
        pin("OUT", 0, 63),
        pin("RESET", 0, 82),
        pin("CTRL", 100, 82),
        pin("THRESH", 100, 63),
        pin("DISCH", 100, 44),
        pin("VCC", 100, 25),
      ];
    if (t.endsWith("npn") || t.endsWith("pnp"))
      return [pin("B", 0, 38), pin("C", 57, 0), pin("E", 57, 76)];
    if (t === "p5comp-signal-generator")
      return [pin("OUT", 25, 82), pin("GND", 100, 82)];
    return this.info.pins.map((n, i) => pin(n, i ? 76 : 0, 24));
  }
  render() {
    const t = this.info.type,
      transistor = t.endsWith("npn") || t.endsWith("pnp");
    let body;
    if (["p5comp-opamp", "p5comp-comparator"].includes(t))
      body = svg`<path d="M12 6v64l72-32z" fill="#d4d2c8" stroke="#777"/><path d="M0 24h12M0 52h12M84 38h16M48 0v22M48 54v22" stroke="#888" stroke-width="2"/><text x="18" y="28" font-size="12">+</text><text x="18" y="56" font-size="12">−</text>`;
    else if (t === "p5comp-555")
      body = svg`<rect x="10" y="7" width="80" height="94" rx="4" fill="#343639" stroke="#92969b"/><text x="50" y="19" fill="#ddd" text-anchor="middle" font-size="9">555</text>${this.pinInfo.map((p) => svg`<path d="M${p.x} ${p.y}h${p.x ? -10 : 10}" stroke="#aaa" stroke-width="3"/><text x=${p.x ? 86 : 14} y=${p.y + 3} text-anchor=${p.x ? "end" : "start"} fill="#ddd" font-size="8">${p.name}</text>`)}`;
    else if (transistor)
      body = svg`<circle cx="36" cy="38" r="27" fill="#e0ddce" stroke="#777"/><path d="M0 38h25M25 23v30M25 31 57 10V0M25 45l32 20v11" fill="none" stroke="#555" stroke-width="2"/><path d=${t.endsWith("npn") ? "m44 50 1 8 8-2" : "m36 51 8-2-1 8"} fill="#555"/><text x="4" y="30" font-size="8">B</text><text x="62" y="10" font-size="8">C</text><text x="62" y="73" font-size="8">E</text>`;
    else if (t === "p5comp-signal-generator")
      body = svg`<rect x="1" y="1" width="123" height="72" rx="5" fill="#40464e" stroke="#9299a2"/><text x="62" y="17" text-anchor="middle" fill="#eee" font-size="9">Signal generator</text><path d="M12 38q12-24 24 0t24 0t24 0t24 0" fill="none" stroke="#9bc792"/><text x="62" y="62" text-anchor="middle" fill="#ddd" font-size="8">${this.waveform} · ${this.frequency}Hz</text><path d="M25 73v9M100 73v9" stroke="#aaa" stroke-width="2"/>`;
    else if (t === "p5comp-battery")
      body = svg`<path d="M0 24h29m18 0h29M29 7v34M40 14v20M47 7v34" fill="none" stroke="#9b8e70" stroke-width="3"/><text x="12" y="13" fill="currentColor" font-size="10">+</text><text x="38" y="53" text-anchor="middle" fill="currentColor" font-size="9">${this.voltage}V</text>`;
    else if (t === "p5comp-inductor")
      body = svg`<path d="M0 24h10q0-18 9-18t0 18q0-18 9-18t0 18q0-18 9-18t0 18q0-18 9-18t0 18h30" fill="none" stroke="#b89468" stroke-width="2"/><text x="38" y="49" text-anchor="middle" fill="currentColor" font-size="8">${this.value}</text>`;
    else if (t === "p5comp-diode")
      body = svg`<path d="M0 24h76" stroke="#aaa" stroke-width="2"/><rect x="19" y="15" width="38" height="18" rx="3" fill="#393b3e"/><path d="M50 15v18" stroke="#c9c9c5" stroke-width="5"/><text x="5" y="43" fill="currentColor" font-size="8">A</text><text x="65" y="43" fill="currentColor" font-size="8">K</text>`;
    else
      body = svg`<path d="M0 24h18m40 0h18" stroke="#aaa" stroke-width="2"/><circle cx="38" cy="24" r="21" fill="#45484b" stroke="#999"/><circle cx="38" cy="24" r="13" fill="#25272a"/><path d="M30 14v20m5-24v28m5-28v28m5-24v20" stroke="#62666b"/><text x="38" y="55" text-anchor="middle" fill="currentColor" font-size="8">Speaker</text>`;
    const amplifier = ["p5comp-opamp", "p5comp-comparator"].includes(t);
    const w = amplifier
        ? 100
        : t === "p5comp-555"
          ? 100
          : transistor
            ? 76
            : t === "p5comp-signal-generator"
              ? 125
              : 76,
      h = amplifier
        ? 76
        : t === "p5comp-555"
          ? 106
          : transistor
            ? 76
            : t === "p5comp-signal-generator"
              ? 82
              : 60;
    return html`<svg width=${w} height=${h} viewBox="0 0 ${w} ${h}">
      ${body}
      <title>
        ${this.info.name} ·
        ${this.measurement.warning || "Select to edit properties"}
      </title>
    </svg>`;
  }
}
for (const info of foundationCatalog.filter(
  (p) => p.type !== "p5comp-oscilloscope",
)) {
  class Part extends FoundationPart {
    static info = info;
    static properties = Object.fromEntries(
      Object.entries(info.attrs).map(([k, v]) => [
        k,
        {
          type:
            typeof v === "number"
              ? Number
              : typeof v === "boolean"
                ? Boolean
                : String,
        },
      ]),
    );
  }
  customElements.define(info.type, Part);
}
class Scope extends LitElement {
  static properties = {
    timeWindow: { type: Number },
    voltsPerDiv: { type: Number },
    verticalOffset: { type: Number },
    triggerLevel: { type: Number },
    triggerMode: { type: String },
    measurement: { state: true },
  };
  static styles = FoundationPart.styles;
  constructor() {
    super();
    this.timeWindow = 0.02;
    this.voltsPerDiv = 1;
    this.verticalOffset = 2.5;
    this.triggerLevel = 2.5;
    this.triggerMode = "auto";
    this.samples = [];
    this.measurement = {};
  }
  get pinInfo() {
    return [pin("GND", 20, 192), pin("CH1", 120, 192), pin("CH2", 220, 192)];
  }
  ingest(frames, id) {
    if (!frames.length) return;
    const now = frames.at(-1).time;
    if (this.samples.at(-1)?.time > now) this.samples = [];
    this.samples.push(
      ...frames.map((f) => ({ time: f.time, v: f.scope[id] || [] })),
    );
    const keep =
      Math.max(0.1, Math.min(2, Number(this.timeWindow) || 0.02)) * 2;
    this.samples = this.samples
      .filter((p) => p.time >= now - keep)
      .slice(-48000);
    this.requestUpdate();
  }
  render() {
    const duration = Math.max(
        0.001,
        Math.min(1, Number(this.timeWindow) || 0.02),
      ),
      vdiv = Math.max(0.001, Number(this.voltsPerDiv) || 1),
      samples = this.samples,
      now = samples.at(-1)?.time || 0;
    let start = now - duration,
      triggered = false;
    for (let i = samples.length - 2; i > 0; i--)
      if (
        samples[i].time <= now - duration * 0.8 &&
        samples[i - 1].v[0] < this.triggerLevel &&
        samples[i].v[0] >= this.triggerLevel
      ) {
        start = samples[i].time - duration * 0.2;
        triggered = true;
        break;
      }
    const waiting = this.triggerMode === "normal" && !triggered;
    const paths = [0, 1].map((ch) => {
      let path = "",
        pen = false;
      for (const s of samples) {
        if (s.time < start || s.time > start + duration || s.v[ch] == null) {
          pen = false;
          continue;
        }
        path += `${pen ? "L" : "M"}${(10 + (300 * (s.time - start)) / duration).toFixed(1)},${Math.max(30, Math.min(160, 95 - ((s.v[ch] - this.verticalOffset) * 130) / (vdiv * 8))).toFixed(1)}`;
        pen = true;
      }
      return path;
    });
    return html`<svg width="320" height="192" viewBox="0 0 320 192">
      <rect
        x="1"
        y="1"
        width="318"
        height="180"
        rx="6"
        fill="#3d4248"
        stroke="#888"
      />
      <rect x="6" y="24" width="308" height="140" fill="#181c21" />
      <text x="10" y="16" fill="#ddd" font-size="9">
        Scope · ${(duration * 1000).toFixed(1)}ms · ${vdiv}V/div ·
        ${waiting ? "waiting" : triggered ? "triggered" : "auto"}
      </text>
      ${Array.from({ length: 9 }, (_, i) => svg`<path d="M10 ${30 + i * 16.25}H310M${10 + i * 37.5} 30V160" stroke="#535c65" stroke-width=".4"/>`)}${waiting ? "" : paths.map((d, i) => svg`<path d=${d} fill="none" stroke=${i ? "#7bb4db" : "#e0a76e"} stroke-width="1.3"/>`)}${this.pinInfo.map((p) => svg`<path d="M${p.x} 181v11" stroke="#aaa" stroke-width="2"/><text x=${p.x} y="175" text-anchor="middle" fill="#ddd" font-size="8">${p.name}</text>`)}
      <title>
        12k samples/s · useful signals up to 1kHz. timeWindow in seconds,
        voltsPerDiv, triggerLevel in volts, triggerMode auto/normal. Rising CH1
        trigger.
      </title>
    </svg>`;
  }
}
customElements.define("p5comp-oscilloscope", Scope);
