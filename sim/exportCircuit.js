const NS = "http://www.w3.org/2000/svg";
const svgNode = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const findSVG = (n) =>
  n?.tagName?.toLowerCase() === "svg"
    ? n
    : [...((n?.shadowRoot || n)?.children || [])].map(findSVG).find(Boolean);
function flatten(svg) {
  const clone = svg.cloneNode(true),
    src = [svg, ...svg.querySelectorAll("*")],
    dst = [clone, ...clone.querySelectorAll("*")];
  const properties = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "visibility",
    "display",
    "color",
  ];
  src.forEach((e, i) => {
    const style = getComputedStyle(e);
    dst[i].removeAttribute("style");
    for (const key of properties)
      dst[i].style.setProperty(key, style.getPropertyValue(key));
  });
  return clone;
}
export function circuitSVG(diagram, references, background, sources = {}) {
  const rectangles = [
    ...diagram.parts.map((p) => {
      const b = document.querySelector(`[data-id="${p.id}"] .part-body`);
      return {
        x: p.left,
        y: p.top,
        w: b?.offsetWidth || 100,
        h: b?.offsetHeight || 100,
      };
    }),
    ...references.map((r) => ({
      x: r.x,
      y: r.y,
      w: r.width,
      h:
        [...document.querySelectorAll("[data-reference]")].find(
          (e) => e.dataset.reference === r.id,
        )?.offsetHeight || r.width,
    })),
  ];
  const x = Math.min(0, ...rectangles.map((r) => r.x)) - 30,
    y = Math.min(0, ...rectangles.map((r) => r.y)) - 30;
  const width = Math.max(850, ...rectangles.map((r) => r.x + r.w)) - x + 30,
    circuitHeight = Math.max(540, ...rectangles.map((r) => r.y + r.h)) - y + 30;
  let height = circuitHeight;
  for (const source of Object.values(sources))
    height += 50 + source.split("\n").length * 16;
  const root = svgNode("svg", {
    xmlns: NS,
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
  });
  root.append(svgNode("rect", { width, height, fill: background }));
  const scene = svgNode("g", { transform: `translate(${-x},${-y})` });
  root.append(scene);
  for (const r of references) {
    const item = [...document.querySelectorAll("[data-reference]")].find(
      (e) => e.dataset.reference === r.id,
    );
    const h = item?.offsetHeight || r.width;
    if (r.kind === "note") {
      scene.append(
        svgNode("rect", {
          x: r.x,
          y: r.y,
          width: r.width,
          height: h,
          fill: background,
          stroke: "#888",
          opacity: r.opacity,
        }),
      );
      const text = item?.querySelector("article")?.innerText || r.source || "";
      let y = r.y + 20;
      for (const line of text.split("\n")) {
        const t = svgNode("text", {
          x: r.x + 12,
          y,
          fill: "#888",
          "font-family": "sans-serif",
          "font-size": 13,
        });
        t.textContent = line;
        scene.append(t);
        y += 18;
      }
      continue;
    }
    let src = r.src;
    if (r.kind === "video") {
      const video = item?.querySelector("video");
      if (!video?.videoWidth) continue;
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d").drawImage(video, 0, 0);
      src = frame.toDataURL("image/png");
    }
    scene.append(
      svgNode("image", {
        href: src,
        x: r.x,
        y: r.y,
        width: r.width,
        height: h,
        opacity: r.opacity,
        style: `mix-blend-mode:${r.blend}`,
      }),
    );
  }
  for (const p of diagram.parts) {
    const body = document.querySelector(`[data-id="${p.id}"] .part-body`),
      original = findSVG(body);
    if (!original) continue;
    const image = flatten(original),
      w = body.offsetWidth,
      h = body.offsetHeight;
    image.setAttribute("width", w);
    image.setAttribute("height", h);
    image.setAttribute("x", 0);
    image.setAttribute("y", 0);
    const c = getComputedStyle(body),
      origin = c.transformOrigin.split(" ").map(parseFloat),
      matrix = c.transform === "none" ? "" : c.transform;
    const group = svgNode("g", {
      transform: `translate(${p.left},${p.top}) translate(${origin[0]},${origin[1]}) ${matrix} translate(${-origin[0]},${-origin[1]})`,
    });
    group.style.opacity = getComputedStyle(body).opacity;
    group.style.filter = getComputedStyle(body).filter.replace(
      /url\(["']?[^#)]*#([^"')]+)["']?\)/g,
      "url(#$1)",
    );
    group.append(image);
    scene.append(group);
  }
  const wires = document.querySelector("#wires");
  for (const e of wires.children) {
    if (e.tagName === "defs") scene.append(e.cloneNode(true));
    if (
      e.classList.contains("wire-line") ||
      e.matches("[data-pin].connected")
    ) {
      const copy = flatten(e);
      copy.removeAttribute("class");
      copy.removeAttribute("tabindex");
      scene.append(copy);
    }
  }
  let textY = circuitHeight + 30;
  for (const [name, source] of Object.entries(sources)) {
    const heading = svgNode("text", {
      x: 25,
      y: textY,
      fill: "#87918c",
      "font-family": "sans-serif",
      "font-size": 16,
    });
    heading.textContent = name;
    root.append(heading);
    textY += 24;
    for (const line of source.split("\n")) {
      const t = svgNode("text", {
        x: 25,
        y: textY,
        fill: background === "#ffffff" ? "#242728" : "#aeb6b1",
        "font-family": "monospace",
        "font-size": 12,
        "xml:space": "preserve",
      });
      t.textContent = line;
      root.append(t);
      textY += 16;
    }
    textY += 26;
  }
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}
export async function svgPNG(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Could not render circuit SVG."));
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = width * 2;
    c.height = height * 2;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
