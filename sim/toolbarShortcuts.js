/**
 * Shared toolbar keyboard shortcut resolvers for Physics & Circuit host tools.
 * Convention:
 * - Plain key selects the tool (or its last-used submenu variant):
 *   M = Physics Brush, J = Constraint/Joint, + / = = Mechanism stamp, A = Add part, W = Connect pins
 * - Shift + key cycles through the submenu options (Shift+M, Shift+J, Shift+= / + while stamping).
 */

export const PHYSICS_BODY_TOOLS = ["box", "circle", "link", "gear", "ramp"];
export const PHYSICS_JOINT_TOOLS = ["hinge", "weld", "spring", "slider"];
export const PHYSICS_TOOL_LABELS = {
  box: "Box",
  circle: "Circle",
  link: "Link bar",
  gear: "Spur gear",
  ramp: "Ramp / wall",
  hinge: "Hinge",
  weld: "Weld",
  spring: "Spring",
  slider: "Slider rail",
};

export function nextInCycle(list, current) {
  if (!list.length) return null;
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length];
}

export function resolvePhysicsShortcut(e, state = {}) {
  if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.code === "KeyM") {
    const next = e.shiftKey
      ? nextInCycle(PHYSICS_BODY_TOOLS, state.activeBodyTool || "link")
      : (state.activeBodyTool || "link");
    return { kind: "body", tool: next, cycled: Boolean(e.shiftKey) };
  }
  if (e.code === "KeyJ") {
    const next = e.shiftKey
      ? nextInCycle(PHYSICS_JOINT_TOOLS, state.activeJointTool || "hinge")
      : (state.activeJointTool || "hinge");
    return { kind: "joint", tool: next, cycled: Boolean(e.shiftKey) };
  }
  if (e.code === "Equal" || e.code === "NumpadAdd" || e.key === "+") {
    const presets = state.presetIds || [];
    const cur = state.activeStampPresetId || presets[0] || null;
    const shouldCycle = Boolean(state.inStampMode && (e.shiftKey || e.key === "+"));
    const presetId = shouldCycle ? nextInCycle(presets, cur) : cur;
    return { kind: "stamp", presetId, cycled: shouldCycle };
  }
  if (e.key === "?") {
    return { kind: "guide" };
  }
  return null;
}

export function resolveCircuitShortcut(e) {
  if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.code === "KeyA" && !e.shiftKey) return { kind: "add" };
  if (e.code === "KeyW" && !e.shiftKey) return { kind: "wire" };
  return null;
}
