import { isBreadboard } from "./breadboard.js";
import catalog from "./elements.json" with { type: "json" };
const legacyBoard = catalog.find((e) => e.type === "wokwi-breadboard");
Object.assign(legacyBoard, {
  name: "Breadboard long",
  modelDescription:
    "63 columns · continuous power rails · automatic terminal seating",
  attrs: { size: "full" },
});
catalog.push(
  {
    ...legacyBoard,
    type: "wokwi-breadboard-half",
    name: "Breadboard medium",
    modelDescription:
      "30 columns · continuous power rails · automatic terminal seating",
    attrs: {},
  },
  {
    ...legacyBoard,
    type: "wokwi-breadboard-mini",
    name: "Breadboard mini",
    modelDescription:
      "17 columns · no power rails · automatic terminal seating",
    attrs: {},
  },
);
for (const info of catalog)
  if (
    [
      "wokwi-led",
      "wokwi-resistor",
      "wokwi-pushbutton",
      "wokwi-pushbutton-6mm",
    ].includes(info.type)
  ) {
    info.modeled = true;
    info.modelDescription = info.type.includes("pushbutton")
      ? "Momentary contacts: 1.l/1.r always joined, 2.l/2.r always joined; press joins 1 and 2"
      : "Classroom series LED/resistor model";
  }
export const ELEMENTS = catalog;
export const elementByType = new Map(catalog.map((e) => [e.type, e]));
export function elementPins(part) {
  const info = elementByType.get(part.type);
  if (!info) return [];
  const variant = info.variants?.find((v) =>
    Object.entries(v.attrs).every(([k, value]) => part.attrs?.[k] === value),
  );
  return variant?.pins || info.pins;
}
export function searchElements(query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalog
    .flatMap((info) => [
      info,
      ...(info.variants || []).map((v) => ({
        ...info,
        name: info.name + " (" + v.name + ")",
        attrs: v.attrs,
        pins: v.pins,
      })),
    ])
    .filter((info) =>
      words.every((w) =>
        `${info.name} ${info.type} ${info.group}`.toLowerCase().includes(w),
      ),
    );
}
export function terminalColors(connections, selectedWire = -1) {
  const colors = new Map();
  connections.forEach((c, i) => {
    for (const id of c.slice(0, 2)) {
      if (id.startsWith("free:")) continue;
      const list = colors.get(id) || [];
      list.push({
        color: /^#[0-9a-f]{6}$/i.test(c[2]) ? c[2] : "#788fa5",
        index: i,
      });
      colors.set(id, list);
    }
  });
  return new Map(
    [...colors].map(([id, list]) => [
      id,
      list.find((c) => c.index === selectedWire)?.color || list.at(-1).color,
    ]),
  );
}
