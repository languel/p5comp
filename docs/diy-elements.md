# Make your own element

## 1. Start with a working preset

Open **File → Component editor**. Presets reuse an existing component's terminals, interaction and simulation. Save this definition, then search for **My switch** in Add element:

```json
[
  {
    "name": "My switch",
    "base": "p5comp-toggle-switch",
    "attrs": { "value": 0 }
  }
]
```

Wire terminal `1` to Arduino D2 and terminal `2` to GND. Use `pinMode(2, INPUT_PULLUP)` and `digitalRead(2)`: open reads HIGH, closed reads LOW. Click the lever to switch; drag the case to move it. Presets are saved in the project, including project JSON and ZIP exports. A preset changes defaults; it does not create a new electrical model or arbitrary SVG.

## 2. Draw a new body and terminals (developer workflow)

The app uses Lit web components. Study `sim/simpleElements.js` for a complete interactive switch. Add a module imported by `sim/main.js`, define a unique hyphenated tag, and register the same type in `sim/extraCatalog.js`.

```js
import { LitElement, html } from "lit";
class MySwitch extends LitElement {
  static properties = { value: { type: Number } };
  constructor() { super(); this.value = 0; }
  get pinInfo() {
    return [
      { name: "1", x: 10, y: 38, signals: [] },
      { name: "2", x: 19.5, y: 38, signals: [] }
    ];
  }
  toggle() {
    this.value = this.value ? 0 : 1;
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
  render() {
    return html`<svg width="30" height="38" viewBox="0 0 30 38">
      <path d="M10 24v14M19.5 24v14" stroke="#999" stroke-width="2" />
      <rect x="2" y="5" width="26" height="22" rx="3" fill="#aaa" />
      <rect data-active-control role="switch" tabindex="0"
        aria-label="My switch" aria-checked=${Boolean(this.value)}
        x=${this.value ? 16 : 6} y="10" width="8" height="12" fill="#333"
        @pointerdown=${e => e.stopPropagation()}
        @click=${() => this.toggle()}
        @keydown=${e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault(); this.toggle();
          }
        }} />
    </svg>`;
  }
}
customElements.define("my-switch", MySwitch);
```

Catalog entry:

```js
{ type: "my-switch", name: "My switch", group: "Inputs",
  pins: ["1", "2"], attrs: { value: 0 }, modeled: false,
  modelDescription: "Visual switch; add the electrical model before teaching with it" }
```

The example above is a complete visual control, not yet an electrical switch. Match `pinInfo` names exactly to catalog `pins`. Coordinates are local SVG/CSS pixels; current breadboard spacing is 9.5 units. Keep 1:1 viewBox sizing, allow room around the controls for dragging, and put only the interactive head inside `data-active-control`. Reactive scalar properties appear in Properties. Use `input` for controls; do not edit DOM globals or simulation state directly.

## 3. Give it electrical behavior

For this two-terminal switch, follow `p5comp-toggle-switch` in `sim/circuit.js`: register the same pair in `passive.switches` with the `toggle` kind and initial value. Add your type wherever the built-in switch is recognized in `sim/inputModels.js` and `sim/main.js` so input changes reach the simulator. Mark the catalog entry `modeled: true` only after both open and closed behavior are tested.

For other parts, topology is built in `sim/circuit.js`; existing digital input models live in `sim/inputModels.js`, digital output protocols in `sim/outputModels.js` and `sim/peripherals.js`, and instrument readings in `sim/instruments.js`. Electrical models belong in the worker, not the SVG render method. Render the reported state instead of inventing an animation unrelated to the measurement.

## 4. Save, automate, and teach

Parts save as `{ id, type, left, top, rotate, attrs }`; connections use `partId:terminalName`. Custom source modules must ship with the app: project files store data, not executable plugins. The component preset editor is not a JavaScript plugin loader.

The API/WebMCP catalog exposes terminals and defaults. `p5comp_part_put`, `p5comp_wire_put` and `p5comp_control_set` use the same component IDs and values as the human interface; semantic recording captures project changes. See `docs/agents.md` for the protocol.

Before adding a lesson: test pin positions, rotation, dragging versus interaction, open/floating inputs, value changes, save/reopen, copy/paste, and the actual simulation output. Run `npm test` and `npm run build`. Put a readable project JSON in `public/examples/` and add its entry to `public/examples/index.json`. Use black ground wires and avoid wiring under component bodies.
