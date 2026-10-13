// Prefer a component's own declared color property; otherwise preserve tint behavior.
export function componentColor(attrs, value, nativeColor, original = false) {
  const next = { ...attrs };
  if (nativeColor && (value || original)) {
    if (value) next.color = value;
    else delete next.color;
    delete next.tint;
    next.appearance = "original";
  } else {
    next.tint = value || null;
    next.appearance = original ? "original" : "gray";
  }
  return next;
}
