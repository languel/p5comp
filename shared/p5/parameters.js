// Opt-in bindings to real sketch variables. Annotations are inert in standalone p5.
const path = "[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*";
export function parseParameters(source) {
  const rows = [],
    links = [];
  for (const line of source.split("\n")) {
    let m = line.match(
      /^\s*\/\/\s*@param\s+([A-Za-z_$][\w$]*)\s*=\s*(-?(?:\d*\.)?\d+|true|false)\s*\(([^)]*)\)/,
    );
    if (m) {
      const boolean = /^(true|false)$/.test(m[2]);
      const range = m[3].match(
        /(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(?:\s*,?\s*step\s*:\s*([\d.]+))?/,
      );
      if (!boolean && !range) continue;
      const min = boolean ? 0 : Number(range[1]),
        max = boolean ? 1 : Number(range[2]),
        step = boolean ? 1 : Number(range[3] || 0.01);
      if (![min, max, step].every(Number.isFinite) || max <= min || step <= 0)
        continue;
      rows.push({
        name: m[1],
        direction: "in",
        editable: new RegExp("\\b(?:let|var)\\s+" + m[1] + "\\b").test(source),
        type: boolean ? "boolean" : "number",
        min,
        max,
        step,
      });
      continue;
    }
    m = line.match(
      new RegExp("^\\s*//\\s*@(send|receive)\\s+(" + path + ")\\s*$"),
    );
    if (m) {
      const outgoing = m[1] === "send",
        name = m[2],
        terminal = "arduino." + name;
      rows.push({ name, direction: outgoing ? "out" : "in", editable: false });
      rows.push({
        name: terminal,
        expression: name,
        scope: "circuit",
        direction: outgoing ? "in" : "out",
        editable: false,
      });
      links.push(
        outgoing ? { from: name, to: terminal } : { from: terminal, to: name },
      );
      continue;
    }
    m = line.match(
      new RegExp(
        "^\\s*//\\s*@terminal\\s+circuit\\s+(in|out)\\s+(" +
          path +
          ")\\s*=\\s*(" +
          path +
          ")\\s*$",
      ),
    );
    if (m)
      rows.push({
        name: m[2],
        expression: m[3],
        scope: "circuit",
        direction: m[1],
        editable: false,
      });
    m = line.match(
      new RegExp("^\\s*//\\s*@watch\\s+(in|out)\\s+(" + path + ")\\s*$"),
    );
    if (m) rows.push({ name: m[2], direction: m[1], editable: false });
    m = line.match(
      new RegExp(
        "^\\s*//\\s*@link\\s+(" + path + ")\\s*->\\s*(" + path + ")\\s*$",
      ),
    );
    if (m) links.push({ from: m[1], to: m[2] });
  }
  for (const row of rows) {
    const watch = rows.find(
      (other) => other.name === row.name && !other.editable && !other.type,
    );
    if (watch && row.editable) row.direction = watch.direction;
  }
  return {
    rows: rows
      .filter((r, i, a) => a.findIndex((x) => x.name === r.name) === i)
      .slice(0, 64),
    links: links.slice(0, 128),
  };
}
export function parameterBindings(source) {
  const { rows, links } = parseParameters(source);
  return (
    "\n;window.__p5compBindings = [" +
    rows
      .map(
        (r) =>
          `{...${JSON.stringify(r)},get:()=>(${r.expression || r.name})${r.editable ? `,set:v=>{${r.name}=v}` : ""}}`,
      )
      .join(",") +
    "];\nwindow.__p5compLinks=" +
    JSON.stringify(links) +
    ";"
  );
}
export function parameterValue(binding, value) {
  if (!binding.editable) throw Error("Variable is read-only");
  if (binding.type === "boolean") {
    if (typeof value !== "boolean") throw Error("Expected boolean");
    return value;
  }
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error("Expected finite number");
  const snapped =
    binding.min +
    Math.round((value - binding.min) / binding.step) * binding.step;
  return Math.max(
    binding.min,
    Math.min(binding.max, Number(snapped.toFixed(8))),
  );
}
export function readParameters(bindings = []) {
  return bindings.map(({ get, set, ...row }) => {
    try {
      const value = get();
      return {
        ...row,
        value:
          typeof value === "number"
            ? Number.isFinite(value)
              ? value
              : null
            : typeof value === "boolean" || typeof value === "string"
              ? value
              : Array.isArray(value)
                ? value
                    .slice(0, 16)
                    .map((v) =>
                      typeof v === "number" && Number.isFinite(v) ? v : null,
                    )
                : null,
      };
    } catch {
      return { ...row, value: null, error: "Variable unavailable" };
    }
  });
}
