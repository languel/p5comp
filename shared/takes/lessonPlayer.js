import { stateAt, flatten, describe } from "./take.js";

/** Shared canvas presentation. Serialized into HTML and used unchanged by MP4 export. */
export function createLessonPlayer(canvas, take, drawingRenderer = null) {
  const ctx = canvas.getContext("2d"),
    clips = flatten(take);
  const duration = Math.max(
    take.duration || 0,
    ...clips.map((c) => c.start + c.dur),
    1,
  );
  const images = new Map();
  let t = 0,
    playing = false,
    rate = 1,
    last = 0,
    raf;
  const frameClips = clips.filter((c) => c.track === "frame" && !c.muted);
  const ready = Promise.all(
    [...new Set(frameClips.map((c) => c.src))].map(
      (src) =>
        new Promise((resolve, reject) => {
          if (!/^data:image\/(png|jpeg|webp);base64,/.test(src)) {
            reject(new Error("Preview frames must be embedded images."));
            return;
          }
          const image = new Image();
          image.onload = () => {
            images.set(src, image);
            resolve();
          };
          image.onerror = () =>
            reject(new Error("A recorded preview frame could not load."));
          image.src = src;
        }),
    ),
  );
  if (drawingRenderer && take.baseline?.elements) drawingRenderer.prepare(take);
  const text = (s, x, y, size = 16, color = "#d8d8da", font = "system-ui") => {
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(String(s), x, y);
  };
  function wrap(
    s,
    x,
    y,
    maxWidth,
    lineHeight,
    size = 18,
    color = "#d8d8da",
    maxLines = 3,
  ) {
    ctx.font = `${size}px system-ui`;
    const words = String(s).split(/\s+/);
    let line = "",
      row = 0;
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        text(line, x, y + row * lineHeight, size, color);
        line = word;
        row++;
        if (row >= maxLines) return;
      } else line = next;
    }
    if (row < maxLines) text(line, x, y + row * lineHeight, size, color);
  }
  const panel = (x, y, w, h, title) => {
    ctx.fillStyle = "#242426";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#3d3d40";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    text(title, x + 14, y + 24, 14, "#a1a1a5");
  };
  function code(source, x, y, w, h, name, changed) {
    panel(x, y, w, h, name);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, y + 34, w - 8, h - 38);
    ctx.clip();
    const lines = String(source || "").split("\n"),
      rows = Math.max(1, Math.floor((h - 54) / 18));
    const focus = changed?.diff?.from ?? Math.max(0, lines.length - 1);
    const first = Math.max(
      0,
      Math.min(Math.max(0, lines.length - rows), focus - Math.floor(rows / 2)),
    );
    const lineWidth = Math.floor((w - 60) / 7.25);
    for (let i = first; i < Math.min(lines.length, first + rows); i++) {
      const yy = y + 53 + (i - first) * 18;
      if (
        changed &&
        i >= changed.diff?.from &&
        i < changed.diff.from + Math.max(1, changed.diff.lines.length)
      ) {
        ctx.fillStyle = "#324237";
        ctx.fillRect(x + 4, yy - 13, w - 8, 18);
      }
      text(i + 1, x + 10, yy, 11, "#858e88", "monospace");
      text(
        lines[i].slice(0, lineWidth),
        x + 45,
        yy,
        12,
        "#d8d8da",
        "monospace",
      );
    }
    ctx.restore();
  }
  function circuit(diagram, x, y, w, h, led) {
    panel(x, y, w, h, "Circuit · recorded construction");
    const parts = diagram.parts || [],
      connections = [
        ...(diagram.connections || []),
        ...(diagram.attachments || []),
      ];
    if (!parts.length) {
      text("Empty circuit — add an Arduino", x + 18, y + 65, 15, "#858e88");
      return;
    }
    const minX = Math.min(...parts.map((p) => Number(p.left) || 0)),
      minY = Math.min(...parts.map((p) => Number(p.top) || 0));
    const maxX = Math.max(...parts.map((p) => (Number(p.left) || 0) + 180)),
      maxY = Math.max(...parts.map((p) => (Number(p.top) || 0) + 100));
    const scale = Math.min(
      (w - 40) / Math.max(300, maxX - minX),
      (h - 65) / Math.max(170, maxY - minY),
    );
    const positions = new Map(
      parts.map((p) => [
        p.id,
        {
          x: x + 20 + ((Number(p.left) || 0) - minX) * scale,
          y: y + 45 + ((Number(p.top) || 0) - minY) * scale,
        },
      ]),
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 34, w - 2, h - 35);
    ctx.clip();
    for (const c of connections) {
      const a = positions.get(String(c[0]).split(":")[0]),
        b = positions.get(String(c[1]).split(":")[0]);
      if (!a || !b) continue;
      ctx.strokeStyle = /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(c[2])
        ? c[2]
        : "#8fa99a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x + 55 * scale, a.y + 25 * scale);
      ctx.lineTo(b.x + 55 * scale, b.y + 25 * scale);
      ctx.stroke();
    }
    for (const p of parts) {
      const a = positions.get(p.id),
        isLED = /led$/.test(p.type),
        isBoard = /arduino/.test(p.type);
      ctx.fillStyle = isBoard
        ? "#1d607a"
        : isLED
          ? led
            ? "#ed655d"
            : "#763a37"
          : "#56565c";
      ctx.fillRect(a.x, a.y, 140 * scale, 48 * scale);
      text(
        p.label || p.id,
        a.x + 7,
        a.y + 19 * scale,
        Math.max(10, 13 * scale),
        "#fff",
      );
      text(
        p.type.replace(/^(wokwi|p5comp)-/, ""),
        a.x + 7,
        a.y + 37 * scale,
        Math.max(8, 9 * scale),
        "#e1e1e3",
      );
    }
    ctx.restore();
    const labels = connections.map((c) => `${c[0]} → ${c[1]}`).join("   ");
    wrap(labels, x + 14, y + h - 15, w - 28, 13, 10, "#a1a1a5", 1);
  }
  function frame(ms) {
    t = Math.max(0, Math.min(duration, Number(ms) || 0));
    const W = canvas.width,
      H = canvas.height;
    ctx.setTransform(W / 1280, 0, 0, H / 720, 0, 0);
    ctx.fillStyle = "#1c1c1e";
    ctx.fillRect(0, 0, 1280, 720);
    text(take.title || "p5comp lesson", 22, 34, 23);
    text("p5comp · recorded lesson", 1015, 31, 13, "#a1a1a5");
    const state = stateAt(take, t),
      project = take.meta?.p5comp?.project,
      ino = project?.workbench?.arduinoName || "sketch.ino",
      js = project?.workbench?.p5Name || "sketch.js";
    const changes = clips.filter(
      (c) => !c.muted && c.track === "code" && c.start <= t,
    );
    code(
      state.files[ino] || "",
      16,
      52,
      390,
      540,
      `Arduino · ${ino}`,
      changes.filter((c) => c.file === ino).at(-1),
    );
    code(
      state.files[js] || "",
      418,
      52,
      390,
      540,
      `p5 · ${js}`,
      changes.filter((c) => c.file === js).at(-1),
    );
    const packet = clips
      .filter(
        (c) =>
          !c.muted && c.track === "say" && c.meta?.dir === "rx" && c.start <= t,
      )
      .at(-1);
    const led = Number(
      packet?.text?.match(/(?:led\s*[:=]\s*)?([01])\s*$/)?.[1] || 0,
    );
    circuit(state.diagram, 820, 52, 444, 228, led);
    panel(820, 292, 444, 300, "p5 output · recorded frames");
    const clip = frameClips
        .filter((c) => c.channel === "p5" && c.start <= t)
        .at(-1),
      image = images.get(clip?.src);
    if (image) {
      const scale = Math.min(416 / image.width, 246 / image.height);
      ctx.drawImage(
        image,
        834 + (416 - image.width * scale) / 2,
        332 + (246 - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
    } else if (
      drawingRenderer &&
      ((take.baseline?.elements?.length || 0) > 0 ||
        clips.some((c) => c.track === "draw"))
    ) {
      const drawing = document.createElement("canvas");
      drawing.width = 416;
      drawing.height = 246;
      drawingRenderer.renderFrame(drawing.getContext("2d"), take, t, {
        width: 416,
        height: 246,
        captions: false,
        background: "#242426",
      });
      ctx.setTransform(W / 1280, 0, 0, H / 720, 0, 0);
      ctx.drawImage(drawing, 834, 332);
    } else text("Run p5 to see the sketch respond", 840, 427, 16, "#858e88");
    const active = clips.filter(
      (c) => !c.muted && c.start <= t && c.start + c.dur > t,
    );
    const captions = active
      .filter((c) => ["say", "title"].includes(c.track) && !c.meta?.dir)
      .map((c) => c.text)
      .join(" · ");
    wrap(captions || " ", 22, 628, 1236, 25, 21, "#f0eee9", 2);
    const action = active.filter((c) => c.track === "action").at(-1);
    if (action) text(`◉ ${describe(action)}`, 22, 691, 14, "#c6a188");
    text(
      `${(t / 1000).toFixed(1)} / ${(duration / 1000).toFixed(1)} s`,
      1100,
      691,
      14,
      "#a1a1a5",
    );
    ctx.fillStyle = "#3d3d40";
    ctx.fillRect(16, 706, 1248, 3);
    ctx.fillStyle = "#a4b9ab";
    ctx.fillRect(16, 706, (1248 * t) / duration, 3);
    return canvas;
  }
  function tick(now) {
    if (!playing) return;
    t = Math.min(duration, t + (now - last) * rate);
    last = now;
    frame(t);
    api.onTime?.(t);
    if (t >= duration) {
      playing = false;
      api.onEnd?.();
    } else raf = requestAnimationFrame(tick);
  }
  const api = {
    duration,
    ready,
    frame,
    seek: frame,
    get time() {
      return t;
    },
    get playing() {
      return playing;
    },
    set rate(value) {
      rate = Number(value) || 1;
    },
    play() {
      if (playing) return;
      if (t >= duration) t = 0;
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
    },
    destroy() {
      api.pause();
      images.clear();
    },
  };
  frame(0);
  ready.then(
    () => frame(t),
    () => {},
  );
  return api;
}
