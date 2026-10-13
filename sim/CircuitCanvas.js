import { WIRE_COLORS } from "./colors.js";
import {
  CONNECTION_DOT_RADIUS,
  usesOriginalColors,
  rotationFromDrag,
} from "./partGeometry.js";
import { ColorPicker } from "./ColorPicker.js";
import { terminalColors } from "./elements.js";
import {
  partPoint,
  partBounds,
  intersects,
  lineInBox,
  freePoint,
  freeEnd,
} from "./partGeometry.js";
import { partPins, TYPES } from "./circuit.js";
import {
  copy,
  same,
  simplify,
  wirePoints,
  projectPoint,
  snapPoint,
  moveBend,
  moveSegment,
  autoroute,
} from "./wireGeometry.js";
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#788fa5");
export class CircuitCanvas {
  constructor({
    stage,
    world,
    wires,
    onChange,
    onSelectWire,
    onSelectPart,
    onRestore,
    onViewChange,
    onDocs,
    onRename,
    saved = {},
  }) {
    Object.assign(this, {
      stage,
      world,
      wires,
      onChange,
      onSelectWire,
      onSelectPart,
      onRestore,
      onViewChange,
      onDocs,
      onRename,
    });
    this.camera = {
      x: Number(saved.camera?.x) || 0,
      y: Number(saved.camera?.y) || 0,
      zoom: Math.max(0.15, Math.min(4, Number(saved.camera?.zoom) || 1)),
    };
    this.gridReference = ["arduino", "none"].includes(saved.gridReference)
      ? saved.gridReference
      : "breadboard";
    this.gridBetween = saved.gridBetween === true;
    this.gridMultiplier = [0.5, 1, 2].includes(Number(saved.gridMultiplier))
      ? Number(saved.gridMultiplier)
      : 1;
    this.labels = saved.labels !== false;
    this.selectMode = false;
    this.selectedParts = new Set();
    this.selectedWires = new Set();
    this.snap = saved.snap !== false;
    this.orthogonal = saved.orthogonal !== false;
    this.newColor = color(saved.color);
    this.wireMode = false;
    this.selectedWire = -1;
    this.selectedBend = -1;
    this.selectedPart = null;
    this.elements = new Map();
    this.pins = new Map();
    this.draft = null;
    this.drag = null;
    this.guides = [];
    this.undoStack = [];
    this.redoStack = [];
    this.space = false;
    this.hasView = !!saved.camera;
    this.handleSVG = el("svg", {
      id: "wireHandles",
      "aria-label": "Wire bend controls",
    });
    this.world.append(this.handleSVG);
    this.menu = document.createElement("div");
    this.menu.className = "canvas-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.hidden = true;
    document.body.append(this.menu);
    stage.addEventListener("pointerdown", (e) => this.down(e));
    stage.addEventListener("pointermove", (e) => this.move(e));
    stage.addEventListener("pointerup", (e) => this.up(e));
    stage.addEventListener("pointercancel", (e) => this.cancelDrag(e));
    stage.addEventListener("dblclick", (e) => this.doubleClick(e));
    stage.addEventListener("contextmenu", (e) => this.context(e));
    stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey)
          this.zoomAt(Math.exp(-e.deltaY * 0.006), {
            x: e.clientX - stage.getBoundingClientRect().left,
            y: e.clientY - stage.getBoundingClientRect().top,
          });
        else {
          this.camera.x -= e.shiftKey ? e.deltaY : e.deltaX;
          this.camera.y -= e.shiftKey ? e.deltaX : e.deltaY;
          this.view();
        }
      },
      { passive: false },
    );
    stage.addEventListener("keydown", (e) => this.key(e));
    stage.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.space = false;
        stage.classList.remove("pan-ready");
      }
    });
    window.addEventListener("blur", () => {
      this.space = false;
      this.drag = null;
      this.guides = [];
      stage.classList.remove("pan-ready");
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.menu.contains(e.target)) this.menu.hidden = true;
    });
    this.observer = new ResizeObserver(() => this.view());
    this.observer.observe(stage);
  }
  setData(
    diagram,
    elements,
    { selectedWire = -1, selectedPart = null, wireMode = false } = {},
  ) {
    if (this.diagram && this.diagram !== diagram) this.clearSelection();
    this.diagram = diagram;
    this.elements = elements;
    this.selectedWire = selectedWire;
    this.selectedPart = selectedPart;
    this.wireMode = wireMode;
    this.refreshPins();
    this.applyTints();
    this.stage.classList.toggle("labels-hidden", !this.labels);
    this.render();
    if (!this.hasView) {
      this.hasView = true;
      requestAnimationFrame(() => this.fit());
    }
  }
  getState() {
    return {
      camera: { ...this.camera },
      snap: this.snap,
      orthogonal: this.orthogonal,
      color: this.newColor,
      labels: this.labels,
      gridMultiplier: this.gridMultiplier,
      gridReference: this.gridReference,
      gridBetween: this.gridBetween,
    };
  }
  toWorld(e) {
    const r = this.stage.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.camera.x) / this.camera.zoom,
      y: (e.clientY - r.top - this.camera.y) / this.camera.zoom,
    };
  }
  refreshPins() {
    this.pins.clear();
    if (!this.diagram) return;
    for (const p of this.diagram.parts) {
      const supported = new Set(partPins(p)),
        element = this.elements.get(p.id);
      for (const pin of element?.pinInfo || [])
        if (supported.has(pin.name)) {
          let direction = null;
          if (p.type === TYPES[0]) direction = pin.y < 100 ? "up" : "down";
          else if ([TYPES[2], TYPES[3]].includes(p.type)) direction = "down";
          else if (p.type === TYPES[4])
            direction = pin.name.endsWith(".l") ? "left" : "right";
          if (direction) {
            const vectors = {
                up: { x: 0, y: -1 },
                down: { x: 0, y: 1 },
                left: { x: -1, y: 0 },
                right: { x: 1, y: 0 },
              },
              v = vectors[direction],
              size = this.size(p),
              center = partPoint(p, { x: size.w / 2, y: size.h / 2 }, size),
              q = partPoint(
                p,
                { x: size.w / 2 + v.x, y: size.h / 2 + v.y },
                size,
              ),
              dx = q.x - center.x,
              dy = q.y - center.y;
            direction =
              Math.abs(dx) > Math.abs(dy)
                ? dx > 0
                  ? "right"
                  : "left"
                : dy > 0
                  ? "down"
                  : "up";
          }
          this.pins.set(p.id + ":" + pin.name, {
            ...partPoint(p, pin, this.size(p)),
            part: p.id,
            direction,
          });
        }
    }
  }
  size(p) {
    const element = this.elements.get(p.id),
      body = element?.parentElement,
      pins = element?.pinInfo || [];
    return {
      w: body?.offsetWidth || Math.max(30, ...pins.map((q) => q.x)) + 12,
      h: body?.offsetHeight || Math.max(30, ...pins.map((q) => q.y)) + 12,
    };
  }
  rectangles(includeBreadboards = false) {
    return this.diagram.parts
      .filter((p) => includeBreadboards || p.type !== TYPES[1])
      .map((p) => partBounds(p, this.size(p)));
  }
  gridSettings() {
    if (this.gridReference === "none")
      return { grid: 0, gridOrigin: { x: 0, y: 0 } };
    const board =
      this.diagram?.parts.find(
        (p) => p.type === TYPES[this.gridReference === "breadboard" ? 1 : 0],
      ) || this.diagram?.parts.find((p) => p.type === TYPES[0]);
    const breadboard = board?.type === TYPES[1],
      info = this.elements.get(board?.id)?.pinInfo || [],
      first = breadboard ? "1t.a" : "0",
      second = breadboard ? "2t.a" : "1",
      a = info.find((p) => p.name === first),
      b = info.find((p) => p.name === second),
      pitch = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : breadboard ? 10 : 9.5,
      anchor = board ? this.pins.get(board.id + ":" + first) : null,
      gridOrigin = { x: anchor?.x || 0, y: anchor?.y || 0 };
    if (this.gridBetween) {
      gridOrigin.x += pitch / 2;
      gridOrigin.y += pitch / 2;
    }
    return { grid: pitch * this.gridMultiplier, gridOrigin };
  }
  setGridMultiplier(n) {
    if (![0.5, 1, 2].includes(n)) return;
    this.gridMultiplier = n;
    this.view();
  }
  gridView() {
    this.stage.classList.toggle("grid-none", this.gridReference === "none");
    const { grid, gridOrigin } = this.gridSettings(),
      z = this.camera.zoom;
    this.stage.style.backgroundSize = `${grid * z}px ${grid * z}px`;
    this.stage.style.backgroundPosition = `${this.camera.x + (gridOrigin.x - grid / 2) * z}px ${this.camera.y + (gridOrigin.y - grid / 2) * z}px`;
  }
  setLabels(show) {
    this.labels = show;
    this.stage.classList.toggle("labels-hidden", !show);
    this.onViewChange?.(this.getState());
  }
  transformPart(action) {
    const before = this.checkpoint();
    for (const p of this.diagram.parts.filter((p) =>
      this.selectedParts.has(p.id),
    )) {
      if (action === "rotate") p.rotate = ((p.rotate || 0) + 45) % 360;
      else p[action] = !p[action];
    }
    this.applyTints();
    this.refreshPins();
    this.diagram.connections.forEach((c, i) => {
      if (c.slice(0, 2).some((e) => this.selectedParts.has(e.split(":")[0])))
        this.route(i);
    });
    this.commit(before);
  }
  fit() {
    if (!this.diagram) return;
    this.refreshPins();
    const rects = this.rectangles(true),
      points = this.diagram.connections.flatMap((c) =>
        wirePoints(c, this.pins),
      );
    const xs = [
        ...rects.flatMap((r) => [r.x, r.x + r.w]),
        ...points.map((p) => p.x),
      ],
      ys = [
        ...rects.flatMap((r) => [r.y - 26, r.y + r.h]),
        ...points.map((p) => p.y),
      ];
    if (!xs.length) return;
    const minX = Math.min(...xs) - 35,
      maxX = Math.max(...xs) + 35,
      minY = Math.min(...ys) - 35,
      maxY = Math.max(...ys) + 35;
    this.camera.zoom = Math.max(
      0.15,
      Math.min(
        1.3,
        this.stage.clientWidth / (maxX - minX),
        this.stage.clientHeight / (maxY - minY),
      ),
    );
    this.camera.x =
      (this.stage.clientWidth - (maxX - minX) * this.camera.zoom) / 2 -
      minX * this.camera.zoom;
    this.camera.y =
      (this.stage.clientHeight - (maxY - minY) * this.camera.zoom) / 2 -
      minY * this.camera.zoom;
    this.view();
  }
  zoomAt(
    factor,
    p = { x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 },
  ) {
    const old = this.camera.zoom,
      next = Math.max(0.15, Math.min(4, old * factor));
    this.camera.x = p.x - ((p.x - this.camera.x) * next) / old;
    this.camera.y = p.y - ((p.y - this.camera.y) * next) / old;
    this.camera.zoom = next;
    this.view();
  }
  view() {
    const { x, y, zoom } = this.camera;
    this.world.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
    const left = -x / zoom,
      top = -y / zoom,
      w = this.stage.clientWidth / zoom,
      h = this.stage.clientHeight / zoom;
    this.wires.style.left = left + "px";
    this.wires.style.top = top + "px";
    this.wires.style.width = w + "px";
    this.wires.style.height = h + "px";
    this.wires.setAttribute("viewBox", `${left} ${top} ${w} ${h}`);
    this.handleSVG.setAttribute("style", this.wires.getAttribute("style"));
    this.handleSVG.setAttribute("viewBox", `${left} ${top} ${w} ${h}`);
    this.gridView();
    this.onViewChange?.(this.getState());
    if (this.diagram) this.render();
  }
  applyTints() {
    for (const p of this.diagram.parts) {
      const body = this.elements.get(p.id)?.parentElement;
      if (!body) continue;
      body.style.transform = `rotate(${p.rotate || 0}deg) scale(${p.flipX ? -1 : 1},${p.flipY ? -1 : 1})`;
      body.dataset.original = String(usesOriginalColors(p));
      body.dataset.tinted = String(!!p.attrs?.tint);
      body.style.filter = p.attrs?.tint ? `url(#part-tint-${p.id})` : "";
    }
  }
  checkpoint() {
    return JSON.stringify(this.diagram);
  }
  commit(before, nets = false) {
    if (before && before !== JSON.stringify(this.diagram)) {
      this.undoStack.push(before);
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack = [];
      this.onChange?.({ nets });
    }
    this.render();
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.checkpoint());
    const diagram = JSON.parse(this.undoStack.pop());
    this.draft = null;
    this.selectedBend = -1;
    this.clearSelection();
    this.onRestore?.(diagram);
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.checkpoint());
    const diagram = JSON.parse(this.redoStack.pop());
    this.draft = null;
    this.selectedBend = -1;
    this.clearSelection();
    this.onRestore?.(diagram);
  }
  clearSelection() {
    this.selectedParts.clear();
    this.selectedWires.clear();
    this.selectedWire = -1;
    this.selectedPart = null;
    this.selectedBend = -1;
  }
  selectWire(i, bend = -1, additive = false) {
    if (!additive && !this.selectedWires.has(i)) this.clearSelection();
    if (additive && this.selectedWires.has(i)) this.selectedWires.delete(i);
    else if (i >= 0) this.selectedWires.add(i);
    this.selectedWire = this.selectedWires.has(i)
      ? i
      : ([...this.selectedWires].at(-1) ?? -1);
    this.selectedBend = bend;
    this.onSelectPart?.(this.selectedPart);
    this.onSelectWire?.(this.selectedWire);
    this.render();
  }
  selectPart(id, additive = false) {
    if (!additive && !this.selectedParts.has(id)) this.clearSelection();
    if (additive && this.selectedParts.has(id)) this.selectedParts.delete(id);
    else if (id) this.selectedParts.add(id);
    this.selectedPart = this.selectedParts.has(id)
      ? id
      : ([...this.selectedParts].at(-1) ?? null);
    this.onSelectPart?.(this.selectedPart);
    this.onSelectWire?.(this.selectedWire);
    this.render();
  }
  setColor(value) {
    this.newColor = color(value);
    const before = this.checkpoint();
    for (const i of this.selectedWires)
      this.diagram.connections[i][2] = this.newColor;
    this.commit(before);
    this.onViewChange?.(this.getState());
  }
  setTint(value, original = false) {
    const before = this.checkpoint();
    for (const p of this.diagram.parts.filter((p) =>
      this.selectedParts.has(p.id),
    ))
      p.attrs = {
        ...p.attrs,
        tint: value ? color(value) : null,
        appearance: original ? "original" : "gray",
      };
    this.applyTints();
    this.commit(before);
  }
  snapPoint(p, e, align = []) {
    const terminal = this.nearestPin(p);
    if (terminal && this.snap && !e.altKey)
      align = [...align, this.pins.get(terminal)];
    return snapPoint(p, {
      ...(this.drag?.kind === "group" ? this.drag.grid : this.gridSettings()),
      zoom: this.camera.zoom,
      enabled: this.snap,
      alt: e.altKey,
      shift: e.shiftKey,
      origin: align[0],
      align,
    });
  }
  routingBoards() {
    return this.diagram.parts
      .filter((p) => p.type === TYPES[1])
      .map((p) => {
        const holes = [...this.pins.values()].filter((q) => q.part === p.id);
        const xs = [
            ...new Set(holes.map((q) => Math.round(q.x * 1000) / 1000)),
          ].sort((a, b) => a - b),
          ys = [
            ...new Set(holes.map((q) => Math.round(q.y * 1000) / 1000)),
          ].sort((a, b) => a - b);
        const axisAligned = (p.rotate || 0) % 90 === 0;
        return {
          holes,
          bounds: partBounds(p, this.size(p)),
          lanesX: axisAligned ? xs.slice(1).map((x, i) => (x + xs[i]) / 2) : [],
          lanesY: axisAligned ? ys.slice(1).map((y, i) => (y + ys[i]) / 2) : [],
        };
      });
  }
  route(i, mode = "careful") {
    const c = this.diagram.connections[i],
      from = this.pins.get(c[0]) || freePoint(c[0]),
      to = this.pins.get(c[1]) || freePoint(c[1]);
    if (!from || !to) return;
    const others = this.diagram.connections
      .filter((_, j) => j !== i)
      .map((c) => wirePoints(c, this.pins));
    c[3] = autoroute(
      from,
      to,
      this.rectangles(),
      others,
      this.routingBoards(),
      { mode },
    ).slice(1, -1);
  }
  routeSelectedParts() {
    const before = this.checkpoint();
    this.refreshPins();
    this.diagram.connections.forEach((c, i) => {
      if (
        c.slice(0, 2).some((end) => this.selectedParts.has(end.split(":")[0]))
      )
        this.route(i);
    });
    this.commit(before);
  }
  autoRoute(i = this.selectedWire, mode = "careful") {
    if (i < 0) return;
    this.refreshPins();
    const before = this.checkpoint();
    this.route(i, mode);
    this.selectedBend = -1;
    this.commit(before);
  }
  cleanup() {
    this.refreshPins();
    const before = this.checkpoint();
    const order = this.diagram.connections
      .map((c, i) => ({
        i,
        length: wirePoints(c, this.pins).reduce(
          (n, p, j, w) =>
            n + (j ? Math.hypot(p.x - w[j - 1].x, p.y - w[j - 1].y) : 0),
          0,
        ),
      }))
      .sort((a, b) => a.length - b.length);
    for (const { i } of order) this.route(i);
    this.selectedBend = -1;
    this.commit(before);
  }
  finish(id) {
    if (!this.draft || id === this.draft.source) return;
    const before = this.checkpoint(),
      from = this.pins.get(this.draft.source),
      to = this.pins.get(id);
    let points = [from, ...this.draft.points, to];
    if (this.orthogonal && !this.draft.free && this.draft.points.length === 0)
      points = autoroute(
        from,
        to,
        this.rectangles(),
        this.diagram.connections.map((c) => wirePoints(c, this.pins)),
        this.routingBoards(),
      );
    else if (this.orthogonal && !this.draft.free) {
      const previous = points.at(-2);
      if (previous.x !== to.x && previous.y !== to.y)
        points.splice(points.length - 1, 0, { x: to.x, y: previous.y });
    }
    if (this.diagram.connections.length >= 300) return;
    this.diagram.connections.push([
      this.draft.source,
      id,
      this.newColor,
      simplify(points).slice(1, -1),
    ]);
    this.draft = null;
    this.wireMode = false;
    const index = this.diagram.connections.length - 1;
    this.selectWire(index);
    this.commit(before, true);
  }
  nearestPin(p) {
    let best = null,
      distance = 13 / this.camera.zoom;
    for (const [id, q] of this.pins) {
      if (this.drag?.kind === "group" && this.selectedParts.has(q.part))
        continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < distance && id !== this.draft?.source) {
        best = id;
        distance = d;
      }
    }
    return best;
  }
  down(e) {
    if (e.button === 2) return;
    this.menu.hidden = true;
    const target = e.target;
    if (target.closest(".part-doc-help")) return;
    const rotationHandle = target.closest(".part-rotate");
    if (rotationHandle && e.button === 0) {
      e.preventDefault();
      const id = rotationHandle.closest(".part").dataset.id;
      this.selectPart(id);
      const part = this.diagram.parts.find((p) => p.id === id),
        size = this.size(part);
      const center = { x: part.left + size.w / 2, y: part.top + size.h / 2 },
        point = this.toWorld(e);
      this.drag = {
        kind: "rotate",
        id,
        center,
        angle: Math.atan2(point.y - center.y, point.x - center.x),
        rotation: part.rotate || 0,
        before: this.checkpoint(),
      };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      return;
    }
    if (e.button === 1 || this.space) {
      e.preventDefault();
      this.stage.focus({ preventScroll: true });
      this.drag = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        camera: { ...this.camera },
      };
      this.stage.setPointerCapture(e.pointerId);
      return;
    }
    const endpoint = target.closest("[data-end]");
    if (endpoint) {
      e.preventDefault();
      const i = Number(endpoint.dataset.wire),
        end = Number(endpoint.dataset.end);
      this.drag = {
        kind: "endpoint",
        i,
        end,
        before: this.checkpoint(),
        original: this.diagram.connections[i][end],
      };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      return;
    }
    if (
      this.selectMode &&
      !target.closest(".part,[data-bend],[data-midpoint]")
    ) {
      e.preventDefault();
      if (!e.shiftKey) this.clearSelection();
      this.drag = {
        kind: "box",
        start: this.toWorld(e),
        current: this.toWorld(e),
      };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      return;
    }
    const pin = target.closest("[data-pin]");
    if (pin) {
      e.preventDefault();
      e.stopPropagation();
      const id = pin.dataset.pin;
      if (!this.draft && !this.wireMode) {
        const attached = this.diagram.connections
            .map((c, i) => ({ i, end: c.slice(0, 2).indexOf(id) }))
            .filter((c) => c.end >= 0),
          candidate =
            attached.find((c) => c.i === this.selectedWire) || attached.at(-1);
        if (candidate) {
          this.selectWire(candidate.i);
          this.drag = {
            kind: "endpoint",
            ...candidate,
            before: this.checkpoint(),
            original: id,
          };
          this.stage.setPointerCapture(e.pointerId);
          this.stage.focus({ preventScroll: true });
          return;
        }
      }
      if (this.draft) {
        this.draft.free = Boolean(e.altKey);
        this.finish(id);
        return;
      }
      this.draft = { source: id, points: [], cursor: copy(this.pins.get(id)) };
      this.drag = {
        kind: "new-wire",
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      this.render();
      return;
    }
    const bend = target.closest("[data-bend]");
    if (bend) {
      e.preventDefault();
      const i = Number(bend.dataset.wire),
        index = Number(bend.dataset.bend);
      this.selectWire(i, index);
      this.drag = {
        kind: "bend",
        i,
        index,
        base: wirePoints(this.diagram.connections[i], this.pins),
        before: this.checkpoint(),
      };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      return;
    }
    const midpoint = target.closest("[data-midpoint]");
    if (midpoint) {
      e.preventDefault();
      const i = Number(midpoint.dataset.wire),
        segment = Number(midpoint.dataset.midpoint),
        before = this.checkpoint(),
        points = wirePoints(this.diagram.connections[i], this.pins),
        p = projectPoint(this.toWorld(e), points[segment], points[segment + 1]);
      points.splice(segment + 1, 0, p);
      this.diagram.connections[i][3] = points.slice(1, -1);
      this.selectWire(i, segment + 1);
      this.drag = { kind: "bend", i, index: segment + 1, base: points, before };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      return;
    }
    const wire = target.closest("[data-wire]");
    if (wire) {
      e.preventDefault();
      const i = Number(wire.dataset.wire),
        points = wirePoints(this.diagram.connections[i], this.pins),
        p = this.toWorld(e),
        segment = this.closestSegment(points, p).index;
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        this.insertBend(i, p);
        this.stage.focus({ preventScroll: true });
        return;
      }
      this.selectWire(i, -1, e.ctrlKey || e.metaKey);
      if (e.ctrlKey || e.metaKey) return;
      if (this.selectedParts.size || this.selectedWires.size > 1) {
        this.beginGroup(e);
        return;
      }
      this.drag = {
        kind: "segment",
        i,
        index: segment,
        start: p,
        base: points,
        before: this.checkpoint(),
      };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.focus({ preventScroll: true });
      return;
    }
    if (target.closest(".part-label-input")) return;
    const part = target.closest(".part");
    if (
      part &&
      (target.closest(".part-handle") || e.altKey || !this.activeBody(e, part))
    ) {
      e.preventDefault();
      this.selectPart(part.dataset.id, e.shiftKey);
      if (e.shiftKey) return;
      this.beginGroup(e);
      return;
    }
    if (part) return;
    this.stage.focus({ preventScroll: true });
    if (this.draft) {
      this.draft.free = Boolean(e.altKey);
      const { point, guides } = this.snapPoint(this.toWorld(e), e, [
        this.draft.points.at(-1) || this.pins.get(this.draft.source),
      ]);
      const prev = this.draft.points.at(-1) || this.pins.get(this.draft.source);
      if (
        this.orthogonal &&
        !e.altKey &&
        prev.x !== point.x &&
        prev.y !== point.y
      )
        this.draft.points.push({ x: point.x, y: prev.y });
      this.draft.points.push(point);
      this.draft.cursor = point;
      this.guides = guides;
      this.render();
      return;
    }
    if (e.shiftKey || this.selectMode) {
      if (!e.shiftKey) this.clearSelection();
      this.drag = {
        kind: "box",
        start: this.toWorld(e),
        current: this.toWorld(e),
      };
      this.stage.setPointerCapture(e.pointerId);
      return;
    }
    this.drag = {
      kind: "pan",
      x: e.clientX,
      y: e.clientY,
      camera: { ...this.camera },
    };
    this.stage.setPointerCapture(e.pointerId);
  }
  activeBody(e, wrapper) {
    const p = this.diagram.parts.find((p) => p.id === wrapper.dataset.id),
      path = e.composedPath();
    if (p.type === TYPES[2]) {
      if (path.some((n) => n.tagName === "INPUT")) return true;
      const size = this.size(p),
        q = this.toWorld(e),
        a = (-(p.rotate || 0) * Math.PI) / 180,
        dx = q.x - p.left - size.w / 2,
        dy = q.y - p.top - size.h / 2,
        x =
          (dx * Math.cos(a) - dy * Math.sin(a)) * (p.flipX ? -1 : 1) +
          size.w / 2,
        y =
          (dx * Math.sin(a) + dy * Math.cos(a)) * (p.flipY ? -1 : 1) +
          size.h / 2;
      // Wokwi's pot SVG uses a 20 by 20 viewBox; the dial includes its top decoration.
      return (
        (((x / size.w) * 20 - 9.91) / 7.27) ** 2 +
          (((y / size.h) * 20 - 8.18) / 7.43) ** 2 <=
        1
      );
    }
    if (p.type === TYPES[4])
      return path.some((n) => n.classList?.contains("clickable-element"));
    return path.some(
      (n) =>
        n.id === "reset-button" ||
        n.getAttribute?.("role") === "slider" ||
        (n.tagName === "BUTTON" && n.getRootNode() instanceof ShadowRoot) ||
        (n.matches?.("input,select,textarea") &&
          n.getRootNode() instanceof ShadowRoot),
    );
  }
  beginGroup(e) {
    this.drag = {
      kind: "group",
      start: this.toWorld(e),
      before: this.checkpoint(),
      grid: this.gridSettings(),
      parts: this.diagram.parts
        .filter((p) => this.selectedParts.has(p.id))
        .map((p) => ({ p, x: p.left, y: p.top })),
      anchor: [...this.pins.values()].find((q) =>
        this.selectedParts.has(q.part),
      ),
      wires: this.diagram.connections.map((c) => ({
        ends: c.slice(0, 2),
        points: wirePoints(c, this.pins),
      })),
    };
    this.stage.setPointerCapture(e.pointerId);
    this.stage.focus({ preventScroll: true });
  }
  move(e) {
    const p = this.toWorld(e),
      d = this.drag;
    if (!d) {
      if (this.draft) {
        this.draft.free = Boolean(e.altKey);
        const result = this.snapPoint(p, e, [
          this.draft.points.at(-1) || this.pins.get(this.draft.source),
        ]);
        this.draft.cursor = result.point;
        this.guides = result.guides;
        this.render();
      }
      return;
    }
    if (d.kind === "rotate") {
      const part = this.diagram.parts.find((part) => part.id === d.id);
      part.rotate = rotationFromDrag(
        d.rotation,
        d.angle,
        Math.atan2(p.y - d.center.y, p.x - d.center.x),
      );
      this.applyTints();
      this.render();
      return;
    }
    if (d.kind === "pan") {
      this.camera.x = d.camera.x + e.clientX - d.x;
      this.camera.y = d.camera.y + e.clientY - d.y;
      this.view();
      return;
    }
    if (d.kind === "new-wire") {
      this.draft.free = Boolean(e.altKey);
      d.moved ||= Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3;
      const result = this.snapPoint(p, e, [this.pins.get(this.draft.source)]);
      this.draft.cursor = result.point;
      this.guides = result.guides;
      this.render();
      return;
    }
    if (d.kind === "box") {
      d.current = p;
      this.render();
      return;
    }
    if (d.kind === "endpoint") {
      const pin = this.nearestPin(p),
        q = pin ? this.pins.get(pin) : this.snapPoint(p, e).point;
      this.diagram.connections[d.i][d.end] = pin || freeEnd(q);
      this.render();
      return;
    }
    if (d.kind === "group") {
      const anchor = d.anchor || d.parts[0] || { x: 0, y: 0 },
        result = this.snapPoint(
          { x: anchor.x + p.x - d.start.x, y: anchor.y + p.y - d.start.y },
          e,
        ),
        dx = result.point.x - anchor.x,
        dy = result.point.y - anchor.y;
      for (const { p, x, y } of d.parts) {
        p.left = x + dx;
        p.top = y + dy;
        const w = this.elements.get(p.id)?.closest(".part");
        w.style.left = p.left + "px";
        w.style.top = p.top + "px";
      }
      this.diagram.connections.forEach((c, i) => {
        const old = d.wires[i],
          a = this.selectedParts.has(old.ends[0].split(":")[0]),
          b = this.selectedParts.has(old.ends[1].split(":")[0]),
          selected = this.selectedWires.has(i);
        let points = old.points.slice(1, -1).map(copy);
        if ((a && b) || selected)
          points = points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
        else {
          if (a && points.length) {
            if (
              same({ x: old.points[0].x, y: 0 }, { x: old.points[1].x, y: 0 })
            )
              points[0].x += dx;
            else points[0].y += dy;
          }
          if (b && points.length) {
            if (Math.abs(old.points.at(-1).x - old.points.at(-2).x) < 0.001)
              points.at(-1).x += dx;
            else points.at(-1).y += dy;
          }
        }
        if (selected)
          for (const end of [0, 1]) {
            const q = freePoint(old.ends[end]);
            if (q) c[end] = freeEnd({ x: q.x + dx, y: q.y + dy });
          }
        c[3] = points;
      });
      this.guides = result.guides;
      this.refreshPins();
      this.render();
      return;
    }
    if (d.kind === "bend") {
      const result = this.snapPoint(p, e, [
          d.base[d.index - 1],
          d.base[d.index + 1],
        ]),
        points = moveBend(
          d.base,
          d.index,
          result.point,
          this.orthogonal && !e.altKey,
        );
      this.diagram.connections[d.i][3] = points.slice(1, -1);
      this.selectedBend = points.findIndex((q) => same(q, result.point));
      this.guides = result.guides;
      this.render();
      return;
    }
    if (d.kind === "segment") {
      const center = d.base[d.index],
        result = this.snapPoint(
          { x: center.x + p.x - d.start.x, y: center.y + p.y - d.start.y },
          e,
          [d.base[d.index], d.base[d.index + 1]],
        );
      this.diagram.connections[d.i][3] = moveSegment(d.base, d.index, {
        x: result.point.x - center.x,
        y: result.point.y - center.y,
      }).slice(1, -1);
      this.guides = result.guides;
      this.render();
    }
  }
  up(e) {
    const d = this.drag;
    this.drag = null;
    this.guides = [];
    if (!d) return;
    if (d.kind === "rotate") {
      this.diagram.connections.forEach((c, i) => {
        if (c.slice(0, 2).some((end) => end.split(":")[0] === d.id))
          this.route(i);
      });
      this.commit(d.before);
      return;
    }
    if (d.kind === "new-wire" && d.moved) {
      const target = this.nearestPin(this.toWorld(e));
      if (target) this.finish(target);
    } else if (d.kind === "box") {
      const box = {
        x: Math.min(d.start.x, d.current.x),
        y: Math.min(d.start.y, d.current.y),
        w: Math.abs(d.start.x - d.current.x),
        h: Math.abs(d.start.y - d.current.y),
      };
      for (const r of this.rectangles(true))
        if (intersects(r, box)) this.selectedParts.add(r.id);
      this.diagram.connections.forEach((c, i) => {
        if (lineInBox(wirePoints(c, this.pins), box)) this.selectedWires.add(i);
      });
      this.selectedPart = [...this.selectedParts].at(-1) || null;
      this.selectedWire = [...this.selectedWires].at(-1) ?? -1;
      this.onSelectPart?.(this.selectedPart);
      this.onSelectWire?.(this.selectedWire);
    } else if (d.before)
      this.commit(
        d.before,
        d.kind === "endpoint" &&
          this.diagram.connections[d.i][d.end] !== d.original,
      );
    if (d.kind === "pan") {
      if (
        Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3 &&
        !this.space &&
        e.button !== 1
      ) {
        this.clearSelection();
        this.onSelectPart?.(null);
        this.onSelectWire?.(-1);
      }
      this.onViewChange?.(this.getState());
    }
    this.render();
  }
  cancelDrag() {
    const d = this.drag;
    this.drag = null;
    this.guides = [];
    if (d?.before) {
      const previous = JSON.parse(d.before);
      Object.assign(this.diagram, previous);
      this.onRestore?.(previous);
    }
    this.render();
  }
  closestSegment(points, p) {
    let best = { index: 0, point: p, distance: Infinity };
    for (let i = 0; i < points.length - 1; i++) {
      const q = projectPoint(p, points[i], points[i + 1]),
        distance = Math.hypot(q.x - p.x, q.y - p.y);
      if (distance < best.distance) best = { index: i, point: q, distance };
    }
    return best;
  }
  insertBend(i, p) {
    const before = this.checkpoint(),
      points = wirePoints(this.diagram.connections[i], this.pins),
      nearest = this.closestSegment(points, p);
    points.splice(nearest.index + 1, 0, nearest.point);
    this.diagram.connections[i][3] = points.slice(1, -1);
    this.selectWire(i, nearest.index + 1);
    this.commit(before);
  }
  doubleClick(e) {
    const hit = this.stage.ownerDocument.elementFromPoint(e.clientX, e.clientY),
      part = hit?.closest(".part");
    if (
      part &&
      !this.activeBody(e, part) &&
      !hit.closest(".part-doc-help,.part-rotate")
    ) {
      e.preventDefault();
      this.selectPart(part.dataset.id);
      this.onRename?.(part);
      return;
    }
    const wire = e.target.closest("[data-wire]");
    if (wire && !e.target.closest("[data-bend],[data-midpoint]")) {
      e.preventDefault();
      this.insertBend(Number(wire.dataset.wire), this.toWorld(e));
    }
  }
  removeBend() {
    if (this.selectedWire < 0 || this.selectedBend < 1) return;
    const before = this.checkpoint();
    this.diagram.connections[this.selectedWire][3].splice(
      this.selectedBend - 1,
      1,
    );
    this.selectedBend = -1;
    this.commit(before);
  }
  deleteWire() {
    if (this.selectedWire < 0) return;
    const before = this.checkpoint();
    this.diagram.connections.splice(this.selectedWire, 1);
    this.selectedWires.clear();
    this.selectedWire = -1;
    this.selectedBend = -1;
    this.onSelectWire?.(-1);
    this.commit(before, true);
  }
  deleteSelection() {
    const before = this.checkpoint(),
      remove = new Set(
        this.diagram.parts
          .filter(
            (p) =>
              this.selectedParts.has(p.id) &&
              p.id !== this.diagram.parts.find((q) => q.type === TYPES[0])?.id,
          )
          .map((p) => p.id),
      );
    const next = structuredClone(this.diagram);
    next.parts = next.parts.filter((p) => !remove.has(p.id));
    next.connections = next.connections.filter(
      (c, i) =>
        !this.selectedWires.has(i) &&
        !c.slice(0, 2).some((e) => remove.has(e.split(":")[0])),
    );
    if (JSON.stringify(next) === before) return;
    this.undoStack.push(before);
    this.redoStack = [];
    this.clearSelection();
    this.onRestore?.(next);
  }
  context(e) {
    const wire = e.target.closest("[data-wire]"),
      part = e.target.closest(".part");
    if (!wire && !part) return;
    e.preventDefault();
    this.menu.replaceChildren();
    const action = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("role", "menuitem");
      b.onclick = () => {
        this.menu.hidden = true;
        fn();
      };
      this.menu.append(b);
    };
    if (wire) {
      const i = Number(wire.dataset.wire),
        p = this.toWorld(e);
      this.selectWire(
        i,
        e.target.dataset.bend ? Number(e.target.dataset.bend) : -1,
      );
      action("Autoroute simple", () => this.autoRoute(i, "simple"));
      action("Autoroute", () => this.autoRoute(i));
      action("Add bend here", () => this.insertBend(i, p));
      action("Straight line", () => {
        const before = this.checkpoint();
        this.diagram.connections[i][3] = [];
        this.commit(before);
      });
      if (this.selectedBend > 0) action("Remove bend", () => this.removeBend());
      this.palette("Wire color", (c) => this.setColor(c));
      action("Delete wire", () => this.deleteWire());
    } else {
      this.selectPart(part.dataset.id);
      this.palette(
        "Part tint",
        (c) => this.setTint(c),
        () => this.setTint(null, true),
      );
      action("Autoroute connections", () => this.routeSelectedParts());
      action("Documentation", () => this.onDocs?.(this.selectedPart));
      const transforms = document.createElement("div");
      transforms.className = "canvas-transform-tools";
      for (const [glyph, label, operation] of [
        ["↻", "Rotate 45°", "rotate"],
        ["⇋", "Flip horizontal", "flipX"],
        ["⇅", "Flip vertical", "flipY"],
      ]) {
        const button = document.createElement("button");
        button.textContent = glyph;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("role", "menuitem");
        button.onclick = () => {
          this.menu.hidden = true;
          this.transformPart(operation);
        };
        transforms.append(button);
      }
      this.menu.append(transforms);
      action("Delete selection", () => this.deleteSelection());
    }
    this.menu.hidden = false;
    this.menu.style.left =
      Math.min(e.clientX, window.innerWidth - this.menu.offsetWidth - 10) +
      "px";
    this.menu.style.top =
      Math.min(e.clientY, window.innerHeight - this.menu.offsetHeight - 10) +
      "px";
  }
  palette(label, fn, original = null) {
    const row = document.createElement("div");
    row.className = "canvas-palette";
    row.setAttribute("aria-label", label);
    for (const [name, c] of WIRE_COLORS) {
      const b = document.createElement("button");
      b.title = label + " " + name;
      b.setAttribute("aria-label", label + " " + name);
      b.style.background = c;
      b.onclick = (e) => {
        if (e.shiftKey) {
          this.customColor(row, c, fn);
          return;
        }
        fn(c);
        this.menu.hidden = true;
      };
      row.append(b);
    }
    if (original) {
      const clear = document.createElement("button");
      clear.textContent = "ø";
      clear.className = "no-tint-dot";
      clear.title = "Original colors · no tint";
      clear.setAttribute("aria-label", "Original colors");
      clear.onclick = () => {
        original();
        this.menu.hidden = true;
      };
      row.append(clear);
    }
    const custom = document.createElement("button");
    custom.textContent = "+";
    custom.title = label + " — custom color";
    custom.setAttribute("aria-label", label + " custom color");
    custom.className = "custom-color-dot";
    custom.onclick = () => {
      const current =
        label === "Wire color"
          ? this.diagram.connections[this.selectedWire]?.[2] || this.newColor
          : this.diagram.parts.find((p) => p.id === this.selectedPart)?.attrs
              ?.tint || "#87918c";
      this.customColor(row, current, fn);
    };
    row.append(custom);
    this.menu.append(row);
  }
  customColor(row, value, fn) {
    this.colorPicker ||= new ColorPicker();
    this.colorPicker.open(row, value, fn);
    this.menu.hidden = true;
  }
  key(e) {
    if (e.target.closest("input,select,textarea,.cm-editor")) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.space = true;
      this.stage.classList.add("pan-ready");
    }
    if (e.key === "?" && this.selectedPart) this.onDocs?.(this.selectedPart);
    if (e.key === "Escape") {
      this.draft = null;
      this.wireMode = false;
      this.menu.hidden = true;
      this.render();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
    }
    if (e.key === "f" || e.key === "0") {
      e.preventDefault();
      this.fit();
    }
    if (e.key === "+" || e.key === "=") this.zoomAt(1.2);
    if (e.key === "-") this.zoomAt(1 / 1.2);
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.selectedBend > 0 ? this.removeBend() : this.deleteSelection();
    }
  }
  render() {
    if (!this.diagram) return;
    this.refreshPins();
    this.gridView();
    const z = this.camera.zoom;
    this.world.style.setProperty("--canvas-zoom", String(z));
    for (const part of this.diagram.parts) {
      const wrapper = this.elements.get(part.id)?.closest(".part");
      if (!wrapper) continue;
      const size = this.size(part);
      const position = (element, q) => {
        const point = partPoint(part, q, size);
        element.style.left = point.x - part.left + "px";
        element.style.top = point.y - part.top + "px";
      };
      position(wrapper.querySelector(".part-doc-help"), {
        x: size.w - 7 / z,
        y: 7 / z,
      });
      for (const handle of wrapper.querySelectorAll(".part-rotate")) {
        const corner = handle.dataset.rotateCorner,
          inset = 5 + 8 / z;
        position(handle, {
          x: corner.endsWith("w") ? -inset : size.w + inset,
          y: corner.startsWith("n") ? -inset : size.h + inset,
        });
      }
    }
    this.wires.replaceChildren();
    const connectedColors = terminalColors(
      this.diagram.connections,
      this.selectedWire,
    );
    const handles = el("g", { class: "wire-handles" });
    const defs = el("defs");
    for (const p of this.diagram.parts) {
      if (!p.attrs?.tint) continue;
      const c = color(p.attrs.tint),
        rgb = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255),
        filter = el("filter", {
          id: `part-tint-${p.id}`,
          "color-interpolation-filters": "sRGB",
        }),
        matrix = rgb.flatMap((v) => [
          0.2126 * (0.25 + 0.7 * v),
          0.7152 * (0.25 + 0.7 * v),
          0.0722 * (0.25 + 0.7 * v),
          0,
          0.08,
        ]);
      matrix.push(0, 0, 0, 1, 0);
      filter.append(
        el("feColorMatrix", { type: "matrix", values: matrix.join(" ") }),
      );
      defs.append(filter);
    }
    this.wires.append(defs);
    this.wires.classList.toggle(
      "wiring",
      this.wireMode || !!this.draft || this.drag?.kind === "endpoint",
    );
    for (let i = 0; i < this.diagram.connections.length; i++) {
      const c = this.diagram.connections[i],
        points = wirePoints(c, this.pins);
      if (points.length < 2) continue;
      const d = points.map((p, j) => `${j ? "L" : "M"}${p.x} ${p.y}`).join(" "),
        hit = el("path", {
          d,
          class: "wire-hit",
          "data-wire": i,
          tabindex: 0,
          role: "button",
          "aria-label": `Wire ${c[0]} to ${c[1]}`,
        });
      hit.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.selectWire(i);
      });
      this.wires.append(hit);
      const visible = el("path", {
        d,
        class: "wire-line" + (this.selectedWires.has(i) ? " selected" : ""),
        stroke: color(c[2]),
        "data-wire": i,
      });
      this.wires.append(visible);
      if (this.selectedWire === i) {
        for (const end of [0, 1]) {
          const p = end ? points.at(-1) : points[0];
          handles.append(
            el("circle", {
              cx: p.x,
              cy: p.y,
              r: 6 / z,
              class: "wire-end-hit",
              "data-wire": i,
              "data-end": end,
              role: "button",
              "aria-label": `Move ${end ? "end" : "start"} of wire ${i + 1}`,
            }),
            el("circle", {
              cx: p.x,
              cy: p.y,
              r: CONNECTION_DOT_RADIUS,
              class: "wire-end",
              style: `--wire-color:${color(c[2])}`,
            }),
          );
        }

        for (let j = 1; j < points.length - 1; j++) {
          const p = points[j];
          handles.append(
            el("circle", {
              cx: p.x,
              cy: p.y,
              r: 4.5 / z,
              class: "wire-bend" + (this.selectedBend === j ? " active" : ""),
              "data-wire": i,
              "data-bend": j,
              tabindex: 0,
              role: "button",
              "aria-label": `Bend ${j} on wire ${i + 1}`,
            }),
          );
        }
        points.slice(1).forEach((p, j) => {
          const a = points[j];
          if (Math.hypot(p.x - a.x, p.y - a.y) * z < 28) return;
          handles.append(
            el("circle", {
              cx: (p.x + a.x) / 2,
              cy: (p.y + a.y) / 2,
              r: 3 / z,
              class: "wire-midpoint",
              "data-wire": i,
              "data-midpoint": j,
              tabindex: 0,
              role: "button",
              "aria-label": `Add bend on wire ${i + 1} segment ${j + 1}`,
            }),
          );
        });
      }
    }
    for (const [id, p] of this.pins) {
      const connectedColor = connectedColors.get(id);
      const circle = el("circle", {
        cx: p.x,
        cy: p.y,
        r: connectedColor ? CONNECTION_DOT_RADIUS : 4 / z,
        class:
          "terminal" +
          (connectedColor ? " connected" : "") +
          (this.draft?.source === id ? " pending" : ""),
        style: connectedColor ? `--wire-color:${connectedColor}` : "",
        "data-pin": id,
        tabindex: this.wireMode || this.draft ? 0 : -1,
        role: "button",
        "aria-hidden": String(!this.wireMode && !this.draft),
        "aria-label": `Connect ${id}`,
      });
      const title = el("title");
      title.textContent = id;
      circle.append(title);
      circle.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (this.draft) {
            this.draft.free = Boolean(e.altKey);
            this.finish(id);
          } else {
            this.draft = {
              source: id,
              free: Boolean(e.altKey),
              points: [],
              cursor: copy(p),
            };
            this.render();
          }
        }
      });
      this.wires.append(circle);
    }
    if (this.drag?.kind === "box") {
      const { start: a, current: b } = this.drag;
      handles.append(
        el("rect", {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
          class: "selection-box",
        }),
      );
    }
    for (const p of this.diagram.parts)
      this.elements
        .get(p.id)
        ?.closest(".part")
        ?.classList.toggle("selected", this.selectedParts.has(p.id));
    this.handleSVG.replaceChildren(handles);
    if (this.draft) {
      const start = this.pins.get(this.draft.source);
      if (start) {
        const points = [start, ...this.draft.points],
          prev = points.at(-1),
          cursor = this.draft.cursor;
        if (
          this.orthogonal &&
          !this.draft.free &&
          prev.x !== cursor.x &&
          prev.y !== cursor.y
        )
          points.push({ x: cursor.x, y: prev.y });
        points.push(cursor);
        this.wires.append(
          el("path", {
            d: points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "),
            class: "wire-draft",
            stroke: this.newColor,
          }),
        );
      }
    }
    for (const g of this.guides) {
      const left = -this.camera.x / z,
        top = -this.camera.y / z;
      this.wires.append(
        el("line", {
          x1: g.axis === "x" ? g.value : left,
          y1: g.axis === "y" ? g.value : top,
          x2: g.axis === "x" ? g.value : left + this.stage.clientWidth / z,
          y2: g.axis === "y" ? g.value : top + this.stage.clientHeight / z,
          class: "snap-guide",
        }),
      );
    }
  }
}
