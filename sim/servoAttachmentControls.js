import { SERVO_MODELS, servoModel, servoReference } from "./servoCatalog.js";
import { assetDataURL } from "./projectFiles.js";

export function servoAttachmentControls(wb, panel, part, field) {
  if (part.type !== "wokwi-servo") return;
  const modelRow = document.createElement("label");
  modelRow.className = "attribute-row";
  const modelLabel = document.createElement("span");
  modelLabel.textContent = "Servo model";
  const modelSelect = document.createElement("select");
  modelSelect.setAttribute("aria-label", "Servo model");
  for (const [value, label] of [
    ["", "Generic"],
    ...Object.values(SERVO_MODELS).map((m) => [m.name, m.variant]),
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modelSelect.append(option);
  }
  modelSelect.value = part.attrs?.servoModel || "";
  modelSelect.onchange = () =>
    wb.action(() => {
      const attrs = { ...part.attrs };
      if (modelSelect.value) attrs.servoModel = modelSelect.value;
      else delete attrs.servoModel;
      wb.ctx.updatePart({ ...part, attrs });
      wb.selectPart();
    });
  modelRow.append(modelLabel, modelSelect);
  panel.append(modelRow);
  const model = servoModel(part);
  if (model) panel.append(servoReference(model));
  const a = part.attrs?.servoAttachment;
  const update = (patch) =>
    wb.ctx.updatePart({
      ...part,
      attrs: {
        ...part.attrs,
        servoAttachment: {
          kind: "arm",
          length: 180,
          color: "#528d9b",
          ...a,
          ...patch,
        },
      },
    });
  const row = document.createElement("label");
  row.className = "attribute-row";
  const label = document.createElement("span");
  label.textContent = "Shaft attachment";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Shaft attachment");
  for (const [value, text] of [
    ["", "None"],
    ["arm", "Arm"],
    ["arc", "Arc"],
    ["pen", "Pen"],
    ...(a?.kind === "drawing" ? [["drawing", "Poliplan artwork"]] : []),
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = a?.kind || "";
  select.onchange = () =>
    wb.action(() => {
      if (!select.value) {
        const attrs = { ...part.attrs };
        delete attrs.servoAttachment;
        wb.ctx.updatePart({ ...part, attrs });
      } else update({ kind: select.value, trace: select.value === "pen" });
      wb.selectPart();
    });
  row.append(label, select);
  panel.append(row);
  if (a) {
    field(
      "Length / artwork width",
      a.length ?? 180,
      (value) => update({ length: Number(value) }),
      "number",
    );
    field(
      "Mount angle (°)",
      a.offset || 0,
      (value) => update({ offset: Number(value) }),
      "number",
    );
    field(
      "Attachment color",
      a.color || "#528d9b",
      (value) => update({ color: value }),
      "color",
    );
    field(
      "Pen trail",
      !!a.trace,
      (value) => update({ trace: value }),
      "checkbox",
    );
    if (a.kind === "drawing") {
      field(
        "Artwork pivot X (0–1)",
        a.pivotX ?? 0,
        (value) => update({ pivotX: Number(value) }),
        "number",
      );
      field(
        "Artwork pivot Y (0–1)",
        a.pivotY ?? 0.5,
        (value) => update({ pivotY: Number(value) }),
        "number",
      );
    }
    const clear = document.createElement("button");
    clear.textContent = "Clear pen trails";
    clear.onclick = () => wb.ctx.clearServoTrails();
    panel.append(clear);
  }
  const mount = document.createElement("button");
  mount.textContent = "Mount Poliplan selection…";
  mount.title = "Select artwork in Poliplan first; mounts a copy on this servo";
  mount.onclick = () =>
    wb.action(() =>
      mountServoDrawing(wb, part.id, wb.drawing.drawingSelection),
    );
  panel.append(mount);
}

export async function mountServoDrawing(wb, servoId, ids) {
  const part = wb.ctx
    .project()
    .diagram.parts.find((p) => p.id === servoId && p.type === "wokwi-servo");
  if (!part)
    throw Error("Select a servo in the circuit before mounting artwork.");
  if (!ids?.length)
    throw Error(
      "Select artwork in Poliplan, then use its right-click “Mount selection on selected servo” action.",
    );
  await wb.drawing.start();
  if (!wb.drawing.editor) throw Error("Poliplan could not start.");
  const r = await wb.drawing.editor.export({ format: "svg", ids, scale: 1 });
  const blob = r.blob || new Blob([r.text], { type: "image/svg+xml" });
  const text = await blob.text();
  const root = new DOMParser().parseFromString(
    text,
    "image/svg+xml",
  ).documentElement;
  if (root.localName !== "svg" || root.querySelector("parsererror"))
    throw Error("Poliplan returned invalid artwork. Try another selection.");
  const view = root.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number);
  const width = view?.[2] || parseFloat(root.getAttribute("width")),
    height = view?.[3] || parseFloat(root.getAttribute("height"));
  if (
    !(width > 0 && height > 0) ||
    !Number.isFinite(width / height) ||
    width / height < 0.05 ||
    width / height > 20
  )
    throw Error(
      "Choose artwork with a width-to-height ratio between 1:20 and 20:1.",
    );
  const name = wb.drawing.assetNames("servo-artwork.svg");
  const asset = {
    src: await assetDataURL(blob),
    type: "image/svg+xml",
    size: blob.size,
  };
  // Save a frozen artwork copy; the original Poliplan marks keep their own editing history.
  wb.assets[name] = asset;
  try {
    wb.ctx.updatePart(
      {
        ...part,
        attrs: {
          ...part.attrs,
          servoAttachment: {
            length: 180,
            color: "#528d9b",
            ...part.attrs?.servoAttachment,
            kind: "drawing",
            asset: name,
            aspect: width / height,
            pivotX: 0,
            pivotY: 0.5,
          },
        },
      },
      part.id,
    );
  } catch (error) {
    delete wb.assets[name];
    throw error;
  }
  wb.ctx.persist();
  wb.renderAssets();
  wb.selectPart();
  wb.ctx.notice(
    `Mounted Poliplan artwork on ${part.label || part.id}. Its left-center is the pivot; adjust it in Properties. The source drawing is kept.`,
  );
  return { servoId, asset: name };
}
