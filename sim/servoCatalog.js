// Manufacturer reference data, checked 2026-11-05. It does not change the ideal
// servo decoder, schematic footprint, simulated speed, torque or supply model.
export const SERVO_MODELS = {
  SG90: {
    name: "SG90",
    variant: "SG90 · analog / plastic gear",
    url: "https://towerpro.com.tw/product/sg90-analog/",
    specs: [
      ["Version", "TowerPro SG90 Analog"],
      ["Mass", "9 g"],
      ["Body (L × W × H)", "23 × 12.2 × 29 mm"],
      ["Gears", "POM / plastic"],
      ["Published voltage", "4.8 V"],
      ["Stall torque at 4.8 V", "1.8 kgf·cm"],
      ["Speed at 4.8 V", "0.12 s / 60°"],
    ],
    description:
      "SG90 analog · 9 g · POM gears · 1.8 kgf·cm / 0.12 s per 60° at 4.8 V · ideal servo simulation",
    hornColor: "#d7e7f0",
  },
  MG90S: {
    name: "MG90S",
    variant: "MG90S · metal gear",
    url: "https://towerpro.com.tw/product/mg90s-3/",
    specs: [
      ["Version", "TowerPro MG90S"],
      ["Mass", "13.4 g"],
      ["Body (L × W × H)", "22.8 × 12.2 × 28.5 mm"],
      ["Gears", "Metal (6061-T6 aluminum)"],
      ["Published voltage", "4.8 V"],
      ["Stall torque at 4.8 V", "1.8 kgf·cm"],
      ["Speed at 4.8 V", "0.10 s / 60°"],
    ],
    description:
      "MG90S · 13.4 g · metal gears · 1.8 kgf·cm / 0.10 s per 60° at 4.8 V · ideal servo simulation",
    hornColor: "#b5b7bc",
  },
};
export const servoModel = (part) =>
  part?.type === "wokwi-servo"
    ? SERVO_MODELS[part.attrs?.servoModel]
    : undefined;
export const servoVariants = Object.values(SERVO_MODELS).map((m) => ({
  name: m.variant,
  attrs: { servoModel: m.name, hornColor: m.hornColor },
  pins: ["GND", "V+", "PWM"],
  modelDescription: m.description,
}));
export function servoReference(model, { expanded = false } = {}) {
  const section = document.createElement("details");
  section.open = expanded;
  section.className = "servo-hardware-reference";
  const heading = document.createElement("summary");
  heading.textContent = `${model.name} · hardware reference`;
  const link = document.createElement("a");
  link.textContent = "TowerPro specifications ↗";
  link.href = model.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const table = document.createElement("table");
  for (const [name, value] of model.specs) {
    const row = document.createElement("tr"),
      key = document.createElement("th"),
      cell = document.createElement("td");
    key.textContent = name;
    cell.textContent = value;
    row.append(key, cell);
    table.append(row);
  }
  const note = document.createElement("p");
  note.textContent =
    "Published hardware figures; the shared symbol and ideal pulse decoder do not simulate these dimensions, torque, speed or current. Calibrate travel and check the ratings of your particular unit.";
  section.append(heading, link, table, note);
  return section;
}
