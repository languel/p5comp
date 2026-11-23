export const WIRE_COLORS = [
  ["red", "#cf6868"],
  ["gold", "#c4a34d"],
  ["yellow", "#d8c85a"],
  ["green", "#789e83"],
  ["blue", "#658eac"],
  ["purple", "#a583b9"],
  ["gray", "#87918c"],
  ["blackish", "#121415"],
  ["brownish", "#977b64"],
];

/** Auto-pick black for GND rails/pins and red for 5V/VCC/power rails/pins; otherwise keep the chosen signal color. */
export function autoWireColor(pinA, pinB, fallback = "#658eac") {
  const pins = [pinA, pinB].map((p) => String(p || "").split(":").slice(1).join(":"));
  if (pins.some((n) => /^(GND(\.\d+)?|NEG|-|[tb]n\.\d+)$/i.test(n))) return "#121415";
  if (pins.some((n) => /^(5V|3\.3V|VCC|VIN|V\+|\+|[tb]p\.\d+)$/i.test(n))) return "#cf6868";
  return fallback;
}
