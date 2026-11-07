import { flattenSVG } from "./exportCircuit.js";
import { toCanvas } from "html-to-image";
import { storeFrame } from "../shared/takes/frameStore.js";
/** Sample the actual workbench, excluding the bottom recording drawer. */
export class PageCapture {
  constructor(wb) {
    this.wb = wb;
    this.busy = false;
    this.latestP5 = null;
    wb.ctx.bridge.addEventListener("previewClear", () => { this.latestP5 = null; });
    wb.ctx.bridge.addEventListener("mirrorFrame", (e) => {
      this.latestP5 = e.detail.image;
    });
  }
  bounds() {
    const bottom = this.wb.bottom.getBoundingClientRect();
    return { width: innerWidth, height: Math.max(100, Math.round(bottom.top)) };
  }
  async capture() {
    if (this.busy) return null;
    this.busy = true;
    const { width, height } = this.bounds();
    try {
      const canvas = await toCanvas(document.body, {
        width,
        height,
        canvasWidth: Math.min(1920, width),
        canvasHeight: Math.round((height * Math.min(1920, width)) / width),
        pixelRatio: 1,
        skipFonts: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        filter: (node) =>
          !(node instanceof Element) ||
          (!node.matches(
            "iframe,svg,script,link,.wb-bottom,.take-page-overlay,.take-review,.page-capture-exclude",
          ) &&
            getComputedStyle(node).display !== "none"),
      });
      const ctx = canvas.getContext("2d"),
        scale = canvas.width / width;
      const draw = async (src, rect) => {
        if (!src || rect.width < 1 || rect.height < 1) return;
        const image = new Image();
        image.src = src;
        await image.decode();
        ctx.drawImage(
          image,
          rect.left * scale,
          rect.top * scale,
          rect.width * scale,
          rect.height * scale,
        );
      };
      // SVG components need their shadow-scoped text styles flattened before rasterization.
      const svgs = [];
      const collect = (root) => {
        for (const element of root.children || []) {
          if (element.matches?.(".wb-bottom,.take-page-overlay,.take-review"))
            continue;
          if (element instanceof SVGSVGElement) {
            if (
              element.getClientRects().length &&
              getComputedStyle(element).visibility !== "hidden"
            )
              svgs.push(element);
          } else {
            if (element.shadowRoot) collect(element.shadowRoot);
            collect(element);
          }
        }
      };
      collect(document.body);
      for (const svg of svgs) {
        const matrix = svg.getScreenCTM();
        if (!matrix) continue;
        const box = svg.viewBox.baseVal,
          rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.top >= height) continue;
        const w = box.width || svg.width.baseVal.value || rect.width,
          h = box.height || svg.height.baseVal.value || rect.height;
        const copy = flattenSVG(svg);
        copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        copy.setAttribute("width", w);
        copy.setAttribute("height", h);
        const image = new Image();
        image.src =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(new XMLSerializer().serializeToString(copy));
        await image.decode();
        ctx.save();
        ctx.setTransform(
          matrix.a * scale,
          matrix.b * scale,
          matrix.c * scale,
          matrix.d * scale,
          matrix.e * scale,
          matrix.f * scale,
        );
        ctx.drawImage(image, box.x, box.y, w, h);
        ctx.restore();
      }
      const p5 = this.wb.ctx.bridge.frame;
      if (p5?.getClientRects().length && !this.wb.preview.hidden)
        await draw(this.latestP5, p5.getBoundingClientRect());
      const editor = this.wb.drawing.editor;
      if (
        editor?.frame?.getClientRects().length &&
        !this.wb.drawing.layer.hidden
      ) {
        const frame = editor.frame,
          doc = frame.contentDocument,
          parent = frame.getBoundingClientRect();
        for (const c of doc?.querySelectorAll("canvas") || []) {
          const r = c.getBoundingClientRect();
          if (r.width && r.height)
            await draw(c.toDataURL(), {
              left: parent.left + r.left,
              top: parent.top + r.top,
              width: r.width,
              height: r.height,
            });
        }
      }
      const src = canvas.toDataURL("image/jpeg", 0.82);
      canvas.width = canvas.height = 0;
      return { src: await storeFrame(src), width, height };
    } finally {
      this.busy = false;
    }
  }
}
