/** Poliplan automation through its published embed client, without changing the editor. */
export async function drawingCommand(drawing, a) {
  await drawing.start();
  const editor = drawing.editor;
  if (!editor) throw Error("Poliplan is not installed. Run npm run vendor:poliplan.");
  if (a.action === "get") {
    const result = await editor.getDocument();
    drawing.remember(result);
    return result;
  }
  if (a.action === "tools") return editor.listTools();
  if (a.action === "active") {
    if (typeof a.active !== "boolean") throw Error("active must be boolean.");
    drawing.setActive(a.active);
    await drawing.applyUI();
    return { active: drawing.active };
  }
  if (a.action === "load") {
    if (!a.document) throw Error("document is required.");
    await editor.load(a.document);
  } else if (a.action === "call") {
    if (!a.name) throw Error("Choose a tool name from drawing tools discovery.");
    const tools = await editor.listTools();
    const list = Array.isArray(tools) ? tools : tools.tools;
    if (!list?.some(t => t.name === a.name)) throw Error("Unknown Poliplan tool: " + a.name);
    const result = await editor.callTool(a.name, a.arguments || {});
    drawing.remember(await editor.getDocument());
    return result;
  } else if (a.action === "export") {
    const format = a.format || "png";
    const result = await editor.export({ format, ...(a.ids?.length ? { ids: a.ids } : { board: "main", transparent: true }), scale: 1 });
    const blob = result.blob || new Blob([result.text], { type: "image/svg+xml" });
    const name = drawing.assetNames(`drawing.${format}`);
    await drawing.addAsset(name, blob);
    return { name, type: blob.type, size: blob.size };
  } else throw Error("Unsupported drawing action.");
  const result = await editor.getDocument();
  drawing.remember(result);
  return result;
}
