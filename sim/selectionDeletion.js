// Component deletion never protects a particular board; keep surviving links valid.
export function deleteCircuitSelection(diagram, selectedParts, selectedWires) {
  const remove = new Set(selectedParts),
    wires = new Set(selectedWires);
  const next = structuredClone(diagram);
  next.parts = next.parts.filter((p) => !remove.has(p.id));
  const removedEndpoint = (end) => remove.has(end.split(":")[0]);
  next.connections = next.connections.filter(
    (c, i) => !wires.has(i) && !c.slice(0, 2).some(removedEndpoint),
  );
  for (const field of ["attachments", "detachedContacts"])
    if (next[field])
      next[field] = next[field].filter((pair) => !pair.some(removedEndpoint));
  if (next.groups)
    next.groups = next.groups
      .map((g) => g.filter((id) => !remove.has(id)))
      .filter((g) => g.length > 1);
  return next;
}
export function isObjectDeleteShortcut(event) {
  return (
    (event.metaKey || event.ctrlKey) &&
    ["Delete", "Backspace"].includes(event.key) &&
    !event.repeat &&
    !event.defaultPrevented &&
    !event
      .composedPath()
      .some((n) =>
        n.matches?.(
          'input,select,textarea,.cm-editor,[contenteditable]:not([contenteditable="false"])',
        ),
      )
  );
}
export function releaseReferenceStream(streams, id) {
  streams
    ?.get(id)
    ?.getTracks()
    .forEach((track) => track.stop());
  streams?.delete(id);
}
