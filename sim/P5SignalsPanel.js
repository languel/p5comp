import { sampleSignal, signalPaths } from "./signalHistory.js";
import { icon } from "./uiIcons.js";

let plotsEnabled = false;
const ns = "http://www.w3.org/2000/svg";
const valueText = (v) =>
  v == null
    ? "—"
    : Array.isArray(v)
      ? v.map(valueText).join(" / ")
      : typeof v === "number"
        ? String(Number(v.toFixed(3)))
        : String(v);
export class P5SignalsPanel {
  constructor(root, before, onSet) {
    Object.assign(this, { root, onSet });
    this.rows = new Map();
    this.links = [];
    this.circuitGroups = [root.querySelector(".simulation-group"), before].map(
      (section, index) => {
        section.classList.add(
          index ? "signal-circuit-out" : "signal-circuit-in",
        );
        const body = document.createElement("div");
        body.className = "code-signal-rows protocol-signals";
        section.append(body);
        return body;
      },
    );
    this.groups = ["in", "out"].map((direction) => {
      const section = document.createElement("section");
      section.className =
        "simulation-group code-signals signal-p5-" + direction;
      const heading = document.createElement("h3");
      heading.textContent = "p5 " + (direction === "in" ? "In" : "Out");
      section.append(heading);
      const body = document.createElement("div");
      body.className = "code-signal-rows";
      body.textContent = "Run a sketch with @param / @watch";
      section.append(body);
      root.insertBefore(section, before);
      return body;
    });
    this.svg = document.createElementNS(ns, "svg");
    this.svg.classList.add("signal-connections");
    this.svg.setAttribute("aria-hidden", "true");
    root.append(this.svg);
    this.observer = new ResizeObserver(() => this.drawLinks());
    this.observer.observe(root);
  }
  update({ rows = [], links = [] }) {
    this.links = links;
    // Existing component links use the same rows as explicit serial terminals.
    const physical = new Set(
      [...this.root.querySelectorAll(".control[data-signal]")].map(
        (n) => n.dataset.signal,
      ),
    );
    const byName = new Map(rows.map((r) => [r.name, r]));
    const inferred = [];
    for (const { from, to } of links) {
      const id = physical.has(from) ? from : physical.has(to) ? to : null;
      const peer = byName.get(id === from ? to : from);
      if (id && peer && !byName.has(id) && !inferred.some((r) => r.name === id))
        inferred.push({
          name: id,
          scope: "circuit",
          direction: id === from ? "out" : "in",
          value: peer.value,
        });
    }
    if (
      rows.some((r) => r.scope === "circuit") ||
      inferred.length ||
      physical.size
    ) {
      this.updateFlow([...rows, ...inferred], links);
      return;
    }
    this.closeFlow();
    const signature = JSON.stringify(rows.map(({ value, error, ...r }) => r));
    if (signature !== this.signature) {
      this.signature = signature;
      this.rows.clear();
      [...this.groups, ...this.circuitGroups].forEach((g) =>
        g.replaceChildren(),
      );
      for (const r of rows) {
        const row = document.createElement("div");
        row.className = "code-signal";
        row.dataset.signal = r.name;
        const label = document.createElement("code");
        label.textContent = r.name;
        label.title = r.name;
        const value = document.createElement("output");
        row.append(label, value);
        let input;
        if (r.editable) {
          input = document.createElement("input");
          input.type = r.type === "boolean" ? "checkbox" : "range";
          if (input.type === "range") {
            input.min = r.min;
            input.max = r.max;
            input.step = r.step;
          }
          input.setAttribute("aria-label", "p5 " + r.name);
          input.title = "Live variable: " + r.name;
          input.oninput = () =>
            this.onSet(
              r.name,
              input.type === "checkbox" ? input.checked : Number(input.value),
            );
          row.append(input);
        }
        const paths = links
          .filter((l) => l.from === r.name || l.to === r.name)
          .map((l) => `${l.from} → ${l.to}`);
        row.title = paths.join("\n") || r.name;
        (r.scope === "circuit" ? this.circuitGroups : this.groups)[
          r.direction === "out" ? 1 : 0
        ].append(row);
        this.rows.set(r.name, { value, input, row });
      }
      for (const group of this.groups)
        if (!group.children.length) group.textContent = "No exposed variables";
    }
    for (const r of rows) {
      const ui = this.rows.get(r.name);
      if (!ui) continue;
      ui.value.textContent = valueText(r.value);
      ui.value.title = r.error || String(r.value);
      if (ui.input && ui.input !== document.activeElement) {
        if (ui.input.type === "checkbox") ui.input.checked = !!r.value;
        else ui.input.value = r.value;
      }
    }
    this.drawLinks();
  }
  updateFlow(rows, links) {
    const signature = JSON.stringify({
      rows: rows.map(({ value, error, ...r }) => r),
      links,
    });
    if (signature !== this.flowSignature) {
      this.closeFlow();
      this.flowSignature = signature;
      this.flowRows = [];
      this.movedControls = [];
      const physical = [...this.root.querySelectorAll(".control[data-signal]")];
      const remaining = new Set(physical);
      const attach = (row, endpoint) => {
        const parent = row.parentElement;
        this.movedControls.push({ row, parent, next: row.nextSibling });
        const role = parent.classList.contains("signal-circuit-in")
          ? "signalInput"
          : "signalOutput";
        const badge = icon(role);
        badge.classList.add("endpoint-role");
        badge.setAttribute(
          "aria-label",
          role === "signalInput" ? "Sensor or control" : "Physical output",
        );
        badge.dataset.roleBadge = "";
        if (!row.querySelector(".endpoint-test")) row.prepend(badge);
        endpoint.classList.add("simulation-group", "physical-endpoint");
        endpoint.append(row);
        remaining.delete(row);
      };
      this.root.classList.add("signal-flow-mode");
      this.flow = document.createElement("section");
      this.flow.className = "communication-flow";
      const heading = document.createElement("div");
      heading.className = "communication-heading";
      heading.innerHTML = "<span>Arduino</span><span></span><span>p5</span>";
      const plotToggle = document.createElement("button");
      plotToggle.className = "ui-icon-button signal-plot-toggle";
      plotToggle.append(icon("plot"));
      plotToggle.title = "Plot signals · last 10 seconds · auto scale";
      plotToggle.setAttribute("aria-label", "Plot communication signals");
      plotToggle.setAttribute("aria-pressed", String(plotsEnabled));
      plotToggle.onclick = () => {
        plotsEnabled = !plotsEnabled;
        plotToggle.setAttribute("aria-pressed", String(plotsEnabled));
        this.flow.classList.toggle("show-signal-plots", plotsEnabled);
      };
      heading.children[1].append(plotToggle);
      this.flow.classList.toggle("show-signal-plots", plotsEnabled);
      this.flow.append(heading);
      const byName = new Map(rows.map((r) => [r.name, r]));
      const used = new Set();
      for (const link of links) {
        const a = byName.get(link.from),
          b = byName.get(link.to);
        if (!a || !b || (a.scope === "circuit") === (b.scope === "circuit"))
          continue;
        const circuit = a.scope === "circuit" ? a : b,
          p5 = a.scope === "circuit" ? b : a;
        const row = document.createElement("div");
        row.className = "communication-row";
        const left = document.createElement("div");
        left.className = "communication-endpoint";
        const name = circuit.name.replace(/^arduino\./, "");
        const physicalRow = physical.find((r) => r.dataset.signal === name);
        if (physicalRow) attach(physicalRow, left);
        else {
          const label = document.createElement("code");
          label.textContent = name;
          left.append(
            icon(circuit.direction === "in" ? "signalInput" : "signalOutput"),
            label,
          );
        }
        const center = document.createElement("div");
        center.className = "communication-link";
        center.dataset.direction = circuit === a ? "right" : "left";
        const value = document.createElement("output");
        const plot = document.createElementNS(ns, "svg");
        plot.classList.add("signal-history");
        plot.setAttribute("viewBox", "0 0 240 24");
        plot.setAttribute("preserveAspectRatio", "none");
        plot.setAttribute("aria-hidden", "true");
        center.append(plot);
        const right = document.createElement("div");
        right.className = "communication-source";
        const label = document.createElement("code");
        label.textContent = p5.name;
        right.append(icon(p5.editable ? "properties" : "signalOutput"), label);
        let input;
        if (p5.editable) {
          input = document.createElement("input");
          input.type = p5.type === "boolean" ? "checkbox" : "range";
          if (input.type === "range") {
            input.min = p5.min;
            input.max = p5.max;
            input.step = p5.step;
          }
          input.setAttribute("aria-label", "p5 " + p5.name);
          input.oninput = () =>
            this.onSet(
              p5.name,
              input.type === "checkbox" ? input.checked : Number(input.value),
            );
          right.append(input);
        }
        right.prepend(value);
        row.append(left, center, right);
        this.flow.append(row);
        row.title = link.from + " → " + link.to;
        this.flowRows.push({ name: p5.name, value, input, plot, history: [] });
        used.add(p5.name);
      }
      // Keep unrelated exposed controls accessible without duplicating signal endpoints.
      for (const r of rows.filter(
        (r) => r.scope !== "circuit" && !used.has(r.name) && r.editable,
      )) {
        const row = document.createElement("div");
        row.className = "communication-row";
        const label = document.createElement("code");
        label.textContent = r.name;
        const value = document.createElement("output");
        const right = document.createElement("div");
        right.className = "communication-source";
        const input = document.createElement("input");
        input.type = r.type === "boolean" ? "checkbox" : "range";
        if (input.type === "range") {
          input.min = r.min;
          input.max = r.max;
          input.step = r.step;
        }
        input.setAttribute("aria-label", "p5 " + r.name);
        input.oninput = () =>
          this.onSet(
            r.name,
            input.type === "checkbox" ? input.checked : Number(input.value),
          );
        right.append(value, icon("properties"), label, input);
        row.append(
          document.createElement("span"),
          document.createElement("span"),
          right,
        );
        this.flow.append(row);
        this.flowRows.push({ name: r.name, value, input });
      }
      for (const control of remaining) {
        const row = document.createElement("div");
        row.className = "communication-row unlinked-signal";
        const endpoint = document.createElement("div");
        attach(control, endpoint);
        row.append(
          endpoint,
          document.createElement("span"),
          document.createElement("span"),
        );
        this.flow.append(row);
      }
      this.circuitGroups.forEach((g) => (g.parentElement.hidden = true));
      this.groups.forEach((g) => (g.parentElement.hidden = true));
      this.svg.hidden = true;
      this.root.prepend(this.flow);
    }
    const values = new Map(rows.map((r) => [r.name, r]));
    for (const ui of this.flowRows) {
      const r = values.get(ui.name);
      ui.value.textContent = valueText(r.value);
      ui.value.title = r.error || String(r.value);
      if (ui.plot) {
        const now = performance.now();
        sampleSignal(ui.history, r.value, now);
        if (plotsEnabled)
          ui.plot.replaceChildren(
            ...signalPaths(ui.history, now).map((d, index) => {
              const path = document.createElementNS(ns, "path");
              path.setAttribute("d", d);
              path.dataset.channel = index;
              return path;
            }),
          );
      }
      if (ui.input && ui.input !== document.activeElement) {
        if (ui.input.type === "checkbox") ui.input.checked = !!r.value;
        else ui.input.value = r.value;
      }
    }
  }
  closeFlow() {
    if (!this.flow) return;
    for (const { row, parent, next } of this.movedControls || []) {
      row.querySelector("[data-role-badge]")?.remove();
      parent.insertBefore(row, next?.parentElement === parent ? next : null);
    }
    this.circuitGroups.forEach((g) => (g.parentElement.hidden = false));
    this.groups.forEach((g) => (g.parentElement.hidden = false));
    this.svg.hidden = false;
    this.flow.remove();
    this.flow = null;
    this.flowSignature = null;
    this.root.classList.remove("signal-flow-mode");
  }
  drawLinks() {
    const root = this.root.getBoundingClientRect();
    if (!root.width) return;
    this.svg.setAttribute("width", this.root.scrollWidth);
    this.svg.setAttribute("height", this.root.scrollHeight);
    const nodes = new Map(
      [...this.root.querySelectorAll("[data-signal]")].map((n) => [
        n.dataset.signal,
        n,
      ]),
    );
    const paths = [];
    for (const { from, to } of this.links) {
      const a = nodes.get(from)?.getBoundingClientRect(),
        b = nodes.get(to)?.getBoundingClientRect();
      if (!a || !b) continue;
      const forward = a.x < b.x,
        x1 = (forward ? a.right : a.left) - root.left,
        x2 = (forward ? b.left : b.right) - root.left;
      const y1 = a.y + a.height / 2 - root.top,
        y2 = b.y + b.height / 2 - root.top;
      const path = document.createElementNS(ns, "path");
      const bend = Math.max(12, Math.abs(x2 - x1) / 2);
      path.setAttribute(
        "d",
        `M${x1} ${y1} C${x1 + (forward ? bend : -bend)} ${y1},${x2 + (forward ? -bend : bend)} ${y2},${x2} ${y2}`,
      );
      paths.push(path);
    }
    this.svg.replaceChildren(...paths);
  }
  clear() {
    this.signature = null;
    this.update({ rows: [], links: [] });
  }
  dispose() {
    this.closeFlow();
    this.observer.disconnect();
    this.circuitGroups.forEach((g) => g.remove());
    this.groups.forEach((g) => g.parentElement.remove());
    this.svg.remove();
  }
}
