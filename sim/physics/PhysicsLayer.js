/**
 * Interactive Second Layer for p5comp: Electronics Layer + Actuators/Physics Sim Layer.
 *
 * Mounts into the circuit stage's #world (sharing pan/zoom pixel-for-pixel with every actuator)
 * and provides:
 * - Layer switcher in .canvas-tools (Electronics | Physics, shortcut P)
 * - Algodoo-inspired floating toolbar (Play/Pause/Step/Reset, Box/Circle/Link/Gear/Ramp,
 *   Hinge/Weld/Spring/Slider, Mechanisms presets, Poliplan import, Gravity/Floor/Debug)
 * - Direct actuator shaft hub visualization & magnetic snapping for hinges
 * - Live spring-grabbing of dynamic bodies while running
 * - Real-time coupling with Arduino simulation states (servos, DC/gear motors, steppers)
 */

import "./physics.css";
import { loadRapier, createPhysicsCore, DT } from "./core.js";
import {
  createEmptyPhysicsScene,
  normalizePhysicsScene,
  nextPhysicsId,
  gearGeometry,
  collidersForBody,
  bodyLocalToWorld,
  bodiesAtPoint,
  selectInBox,
  selectInLasso,
  snapPhysicsPoint,
  connectedAssembly,
  movePivotPreservingLinks,
  directHandlesForBody,
  applyDirectHandleDrag,
  selectionBounds,
  applyTransformScale,
  applyTransformRotate,
  poliplanDocToPhysicsBodies,
  MATERIAL_PRESETS,
  MATERIAL_DEFAULTS,
  BODY_TYPES,
  COLLISION_LAYERS,
  resolvedCollisionMask,
  layerZOrder,
} from "./model.js";
import { listActuators } from "./actuators.js";
import { MECHANISM_PRESETS } from "./mechanisms.js";
import {
  attachPoliplanBodies,
  attachPoliplanCurveConstraint,
  detachPoliplanMarks,
  syncLinkedPoliplanMarks,
} from "./poliplanBridge.js";
import {
  PHYSICS_BODY_TOOLS,
  PHYSICS_JOINT_TOOLS,
  PHYSICS_TOOL_LABELS,
  resolvePhysicsShortcut,
} from "../toolbarShortcuts.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};

const iconSvg = (d) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = {
  physics: iconSvg('<circle cx="12" cy="12" r="1.8" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>'),
  play: iconSvg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  pause: iconSvg('<path d="M8 5v14M16 5v14" stroke-width="2.4"/>'),
  step: iconSvg('<path d="M6 5l9 7-9 7z" fill="currentColor"/><path d="M18 5v14" stroke-width="2.2"/>'),
  reset: iconSvg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  undo: iconSvg('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a5 5 0 1 1 0 10h-2"/>'),
  redo: iconSvg('<path d="M15 7l5 5-5 5"/><path d="M20 12H10a5 5 0 1 0 0 10h2"/>'),
  select: iconSvg('<path d="M5 4l6.5 16 2.5-6 6-2.5z"/>'),
  lasso: iconSvg('<path d="M7 15c-3-1.5-4-4.5-2.5-7.5S10 3.5 14 4.5s6 4 5 7-4 4.5-8 4c-1.5-.2-3-.1-4 1.5s.5 3.5 2.5 3" stroke-dasharray="2.5 2"/><circle cx="7.5" cy="15.5" r="1.5" fill="currentColor"/>'),
  box: iconSvg('<rect x="4" y="6" width="16" height="12" rx="1.5"/>'),
  circle: iconSvg('<circle cx="12" cy="12" r="7.5"/>'),
  link: iconSvg('<rect x="3.5" y="8.5" width="17" height="7" rx="3.5"/><circle cx="7.5" cy="12" r="1.4" fill="currentColor"/><circle cx="16.5" cy="12" r="1.4" fill="currentColor"/>'),
  gear: iconSvg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  ramp: iconSvg('<path d="M4 18L20 9" stroke-width="2.6"/>'),
  hinge: iconSvg('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>'),
  weld: iconSvg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  spring: iconSvg('<path d="M3 12h3l2-5 3 10 3-10 3 10 2-5h2"/>'),
  slider: iconSvg('<path d="M3 12h18"/><rect x="8.5" y="7.5" width="7" height="9" rx="1.5" fill="currentColor" fill-opacity="0.25"/>'),
  debug: iconSvg('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="2.5 2.5"/><circle cx="12" cy="12" r="2"/>'),
  snap: iconSvg('<path d="M6 4v7a6 6 0 0 0 12 0V4"/><path d="M6 8h3M15 8h3"/>'),
  eye: iconSvg('<path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>'),
  draw: iconSvg('<path d="M16.5 3.5l4 4L8 20H4v-4L16.5 3.5z"/>'),
  mech: iconSvg('<circle cx="8.5" cy="15.5" r="4"/><circle cx="16.5" cy="8.5" r="3"/><path d="M8.5 9.5v2M8.5 19.5v2M2.5 15.5h2M12.5 15.5h2M16.5 3.5v2M16.5 11.5v2M19.5 8.5h2"/>'),
  settings: iconSvg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>'),
  help: iconSvg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7"/><circle cx="12" cy="16.8" r="0.8" fill="currentColor"/>'),
};

const MAX_TRAIL = 500;
const SNAP_ACTUATOR_DIST = 22;

export class PhysicsLayer {
  constructor({
    workspace,
    stage,
    world,
    tools,
    canvas,
    drawing,
    getDiagram,
    getPartElements,
    getSelectedPart,
    getDrawingDoc,
    propertiesHost,
    onPropertiesState,
    onRewindActuators,
    onTimeChange,
    persist,
  }) {
    Object.assign(this, {
      workspace,
      stage,
      world,
      tools,
      canvas,
      drawing,
      getDiagram,
      getPartElements,
      getSelectedPart,
      getDrawingDoc,
      propertiesHost,
      onPropertiesState,
      onRewindActuators,
      onTimeChange,
      persist,
    });

    this.scene = createEmptyPhysicsScene();
    this.active = false; // true = Physics layer is active for editing; false = Electronics layer active
    this.visible = true; // visible even while editing Electronics
    this.tool = "select";
    this.selectedBodies = new Set();
    this.selectedJoints = new Set();
    this.snapEnabled = true;
    this.preserveConnections = true;
    this.directEdit = false;
    this.hoverSnap = null;
    this.debug = false;

    this.rapier = null;
    this.core = null;
    this.running = false;
    this.arduinoRunning = false;
    this.poses = new Map();
    this.trails = new Map(); // bodyId -> [[x,y], ...]
    this.blips = []; // { x, y, at, k }
    this.latestActuatorStates = {};
    this.simTime = 0;
    this.raf = 0;
    this.lastRaf = 0;
    this.accum = 0;
    this.drag = null;
    this.undoStack = [];
    this.redoStack = [];

    // 1. Pointer capture layer inside #stage (only active in Physics mode).
    this.capture = el("div", { class: "phys-overlay-capture" });
    stage.append(this.capture);

    // 2. World-space SVG overlay inside #world (shares exact pan/zoom with CircuitCanvas).
    this.svg = svgEl("svg", {
      class: "physics-layer-svg",
      "aria-label": "Physics and mechanisms layer",
    });
    this.gFloor = svgEl("g", { class: "phys-floor" });
    this.gTrails = svgEl("g", { class: "phys-trails" });
    this.gBodies = svgEl("g", { class: "phys-bodies" });
    this.gJoints = svgEl("g", { class: "phys-joints" });
    this.gHandles = svgEl("g", { class: "phys-handles" });
    this.gActuators = svgEl("g", { class: "phys-actuators" });
    this.gDebug = svgEl("g", { class: "phys-debug" });
    this.gDraft = svgEl("g", { class: "phys-draft" });
    this.gSnap = svgEl("g", { class: "phys-snap" });
    this.gBlips = svgEl("g", { class: "phys-blips" });
    this.svg.append(
      this.gFloor,
      this.gTrails,
      this.gBodies,
      this.gJoints,
      this.gHandles,
      this.gActuators,
      this.gDebug,
      this.gDraft,
      this.gSnap,
      this.gBlips,
    );
    world.append(this.svg);

    // 3. Share the single unified Draw & Physics button (#drawLayer) in .canvas-tools.
    this.toggleBtn = drawing?.toggle || document.getElementById("drawLayer");

    // 4. Floating Toolbar, Inspector, Quick Guide, and Toast.
    // Toolbar mounts inside #stage (or workspace overlay) at z-index 25 so it sits cleanly below Poliplan's toolbar.
    this.toolbar = el("div", { class: "phys-toolbar", hidden: true });
    this.inspector = el("div", {
      class: propertiesHost ? "phys-inspector docked" : "phys-inspector",
      hidden: true,
    });
    this.guide = this.buildGuide();
    this.toastEl = el("div", { class: "phys-toast", role: "status" });
    for (const ui of [this.toolbar, this.inspector, this.guide]) {
      for (const ev of ["pointerdown", "mousedown", "click", "dblclick", "contextmenu", "wheel"]) {
        ui.addEventListener(ev, (e) => e.stopPropagation());
      }
    }
    // Mount floating toolbar in workspace so it sits above .draw-layer (z-index: 6)!
    (workspace || stage).append(this.toolbar);
    if (propertiesHost) {
      propertiesHost.append(this.inspector);
      stage.append(this.guide, this.toastEl);
    } else {
      stage.append(this.inspector, this.guide, this.toastEl);
    }
    this.syncToolbarBounds = () => {
      if (!workspace || this.toolbar.hidden) return;
      const ws = workspace.getBoundingClientRect();
      const r = stage.getBoundingClientRect();
      const centerX = r.left - ws.left + r.width / 2;
      const topY = r.top - ws.top;
      if (this.drawing?.active && r.width >= 760) {
        // Sit inline on the exact same top: 10px row right next to Poliplan's centered island.
        const islandW = this.toolbar.offsetWidth || 140;
        const idealLeft = centerX + 244;
        const maxLeft = r.right - ws.left - islandW - 10;
        this.toolbar.style.left = `${Math.min(idealLeft, maxLeft)}px`;
        this.toolbar.style.top = `${topY + 10}px`;
        this.toolbar.style.transform = "none";
      } else {
        this.toolbar.style.left = `${centerX}px`;
        this.toolbar.style.top = `${topY + (this.drawing?.active ? 54 : 10)}px`;
        this.toolbar.style.transform = "translateX(-50%)";
      }
    };
    if (workspace) {
      new ResizeObserver(() => this.syncToolbarBounds()).observe(stage);
      new ResizeObserver(() => this.syncToolbarBounds()).observe(workspace);
    }

    this.buildToolbar();
    this.bindEvents();
    this.render();
  }

  // ---- persistence ---------------------------------------------------------------------------

  snapshot() {
    if (!this.scene.bodies.length && !this.scene.joints.length) return undefined;
    return structuredClone(this.scene);
  }

  clearSelection() {
    this.selectedBodies.clear();
    this.selectedJoints.clear();
  }

  selectSingle(kind, id) {
    this.clearSelection();
    if (kind === "body" && id) this.selectedBodies.add(id);
    else if (kind === "joint" && id) this.selectedJoints.add(id);
  }

  selectionCount() {
    return this.selectedBodies.size + this.selectedJoints.size;
  }

  get selected() {
    if (this.selectedBodies.size === 1 && this.selectedJoints.size === 0) {
      return { kind: "body", id: [...this.selectedBodies][0] };
    }
    if (this.selectedJoints.size === 1 && this.selectedBodies.size === 0) {
      return { kind: "joint", id: [...this.selectedJoints][0] };
    }
    return null;
  }

  set selected(val) {
    if (!val) this.clearSelection();
    else this.selectSingle(val.kind, val.id);
  }

  load(data) {
    this.stopLoop();
    this.freeCore();
    this.clearSelection();
    this.trails.clear();
    this.blips = [];
    this.poses.clear();
    this.simTime = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.scene = data ? normalizePhysicsScene(data) : createEmptyPhysicsScene();
    this.updateToolbarState();
    this.renderInspector();
    this.render();
  }

  pushUndo(snapshot = structuredClone(this.scene)) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.updateToolbarState();
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(structuredClone(this.scene));
    this.scene = this.undoStack.pop();
    this.selected = null;
    this.persistChange();
    this.renderInspector();
    this.updateToolbarState();
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(structuredClone(this.scene));
    this.scene = this.redoStack.pop();
    this.selected = null;
    this.persistChange();
    this.renderInspector();
    this.updateToolbarState();
    return true;
  }

  hasContent() {
    return this.scene.bodies.length > 0 || this.scene.joints.length > 0;
  }

  // ---- unified Draw + Physics layer switching ------------------------------------------------

  /** Called when the single Draw & Physics button (#drawLayer / D) toggles. */
  onDrawToggle(on) {
    if (on) {
      this.active = false;
      this.stage.classList.remove("physics-layer-active");
      this.stage.classList.add("draw-physics-open");
      this.toolbar.hidden = true;
      this.svg.classList.remove("hidden-layer");
      this.updateToolbarState();
      this.render();
    } else {
      this.stage.classList.remove("draw-physics-open");
      this.drawing?.setTool("select");
      this.setActive(false, { closeToolbar: true });
    }
  }

  /** Called when Poliplan's active tool changes (including 'direct' and 'host:phys-*' brushes). */
  onPoliplanTool(toolId) {
    this.directEdit = toolId === "direct";
    if (typeof toolId === "string" && toolId.startsWith("host:phys-stamp:")) {
      this.tool = "stamp";
      this.stampPresetId = toolId.slice("host:phys-stamp:".length);
      this.activeStampPresetId = this.stampPresetId;
      this.stampPreview = null;
      this.active = true;
      this.stage.classList.add("draw-physics-open");
      this.stage.classList.remove("physics-layer-active");
      this.svg.classList.remove("hidden-layer");
      const preset = MECHANISM_PRESETS.find((m) => m.id === this.stampPresetId);
      if (preset) this.toast(`Click to place ${preset.name} (snaps to servos, motors & pins · Shift+click for multiple)`);
      this.render();
      return;
    }
    this.stampPresetId = null;
    this.stampPreview = null;
    if (typeof toolId === "string" && toolId.startsWith("host:phys-")) {
      const next = toolId.slice("host:phys-".length);
      this.tool = next;
      if (["box", "circle", "link", "gear", "ramp"].includes(next)) this.activeBodyTool = next;
      if (["hinge", "weld", "spring", "slider"].includes(next)) this.activeJointTool = next;
      this.active = true;
      this.stage.classList.add("draw-physics-open");
      this.stage.classList.remove("physics-layer-active");
      this.svg.classList.remove("hidden-layer");
      this.renderDraft();
      this.render();
      return;
    }
    if (this.active) {
      this.active = false;
      this.tool = "select";
      this.drag = null;
      this.renderDraft();
      this.renderSnapIndicator(null);
      this.stage.classList.remove("physics-layer-active");
    }
    this.render();
  }

  /** Receive forwarded pointer events from Poliplan's canvas while a host:phys-* brush is active. */
  handleHostPointer(type, init) {
    if (!this.active) return false;
    const ev = {
      ...init,
      type,
      preventDefault() {},
      stopPropagation() {},
    };
    if (type === "pointerdown") this._onDown?.(ev);
    else if (type === "pointermove") this._onMove?.(ev);
    else if (type === "pointerup" || type === "pointercancel") this._onUp?.(ev);
    return true;
  }

  setActive(on, { closeToolbar = false } = {}) {
    this.active = Boolean(on);
    this.toolbar.hidden = true;
    if (this.active) {
      if (this.drawing && !this.drawing.active) {
        this.drawing.setActive(true, { silent: true });
      }
      this.stage.classList.add("draw-physics-open");
    } else if (closeToolbar) {
      this.stage.classList.remove("draw-physics-open");
    }
    this.stage.classList.remove("physics-layer-active");
    this.svg.classList.toggle("hidden-layer", !this.visible && !this.active && !this.drawing?.active);
    if (!this.active) {
      if (closeToolbar || !this.drawing?.active) {
        this.inspector.hidden = true;
        this.onPropertiesState?.(false);
      }
      this.guide.hidden = true;
    } else {
      this.renderInspector();
    }
    this.updateToolbarState();
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
    if (PHYSICS_BODY_TOOLS.includes(tool)) this.activeBodyTool = tool;
    if (PHYSICS_JOINT_TOOLS.includes(tool)) this.activeJointTool = tool;
    if (tool === "select") {
      this.drawing?.setTool("select");
      this.setActive(false, { closeToolbar: false });
      return;
    }
    if (!this.active) this.setActive(true);
    this.drawing?.setTool(`host:phys-${tool}`);
    this.updateToolbarState();
  }

  cycleBodyTool() {
    const cur = this.activeBodyTool || "link";
    const idx = PHYSICS_BODY_TOOLS.indexOf(cur);
    const next = PHYSICS_BODY_TOOLS[(idx + 1) % PHYSICS_BODY_TOOLS.length];
    this.setTool(next);
    this.toast(`Physics Brush: ${PHYSICS_TOOL_LABELS[next] || next}`, 1600);
    return next;
  }

  cycleJointTool() {
    const cur = this.activeJointTool || "hinge";
    const idx = PHYSICS_JOINT_TOOLS.indexOf(cur);
    const next = PHYSICS_JOINT_TOOLS[(idx + 1) % PHYSICS_JOINT_TOOLS.length];
    this.setTool(next);
    this.toast(`Constraint: ${PHYSICS_TOOL_LABELS[next] || next}`, 1600);
    return next;
  }

  setStampTool(presetId) {
    const preset = MECHANISM_PRESETS.find((m) => m.id === presetId) || MECHANISM_PRESETS[0];
    if (!preset) return null;
    this.activeStampPresetId = preset.id;
    this.stampPresetId = preset.id;
    this.stampPreview = null;
    this.tool = "stamp";
    if (!this.active) this.setActive(true);
    this.drawing?.setTool(`host:phys-stamp:${preset.id}`);
    this.updateToolbarState();
    this.toast(`Mechanism: ${preset.name} (click to place · Shift+= to cycle)`, 2000);
    return preset.id;
  }

  cycleStampTool() {
    if (!MECHANISM_PRESETS.length) return null;
    const cur = this.activeStampPresetId || this.stampPresetId || MECHANISM_PRESETS[0].id;
    const idx = MECHANISM_PRESETS.findIndex((m) => m.id === cur);
    const next = MECHANISM_PRESETS[(idx + 1) % MECHANISM_PRESETS.length];
    return this.setStampTool(next.id);
  }

  handleShortcutKey(e) {
    if (!this.drawing?.active || e.repeat) return false;
    const action = resolvePhysicsShortcut(e, {
      activeBodyTool: this.activeBodyTool || "link",
      activeJointTool: this.activeJointTool || "hinge",
      activeStampPresetId: this.activeStampPresetId || this.stampPresetId || MECHANISM_PRESETS[0]?.id,
      inStampMode: Boolean(this.active && this.tool === "stamp"),
      presetIds: MECHANISM_PRESETS.map((m) => m.id),
    });
    if (!action) return false;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    if (action.kind === "body") {
      this.setTool(action.tool);
      if (action.cycled) this.toast(`Physics Brush: ${PHYSICS_TOOL_LABELS[action.tool] || action.tool}`, 1600);
      return true;
    }
    if (action.kind === "joint") {
      this.setTool(action.tool);
      if (action.cycled) this.toast(`Constraint: ${PHYSICS_TOOL_LABELS[action.tool] || action.tool}`, 1600);
      return true;
    }
    if (action.kind === "stamp" && action.presetId) {
      this.setStampTool(action.presetId);
      return true;
    }
    if (action.kind === "guide") {
      if (this.guide) this.guide.hidden = !this.guide.hidden;
      return true;
    }
    return false;
  }

  toast(msg, ms = 2400) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), ms);
  }

  // ---- actuators & coordinates ---------------------------------------------------------------

  actuators() {
    const parts = this.getDiagram?.()?.parts || [];
    const els = this.getPartElements?.() || null;
    return listActuators(parts, els);
  }

  actuatorMap() {
    return new Map(this.actuators().map((a) => [a.id, a]));
  }

  /**
   * If an actuator was moved on the Electronics layer, translate any joint coupled to it
   * along with its connected bodies and joints so the mechanism stays anchored to the shaft.
   */
  syncActuatorPositions() {
    if (!this.hasContent()) return false;
    const pivots = this.actuatorMap();
    let moved = false;
    for (const j of this.scene.joints) {
      if (!j.actuatorId || j.kind !== "hinge" || !Array.isArray(j.anchor)) continue;
      const pivot = pivots.get(j.actuatorId);
      if (!pivot) continue;
      const targetPt =
        j.mount === "horn-tip" && pivot.hornTip ? pivot.hornTip : pivot;
      const dx = targetPt.x - j.anchor[0];
      const dy = targetPt.y - j.anchor[1];
      if (Math.hypot(dx, dy) < 0.5) continue;

      // Collect the connected component of bodies & joints attached to this actuator hinge.
      const bodyIds = new Set();
      const jointIds = new Set([j.id]);
      if (j.a) bodyIds.add(j.a);
      if (j.b) bodyIds.add(j.b);
      let grew = true;
      while (grew) {
        grew = false;
        for (const other of this.scene.joints) {
          if (jointIds.has(other.id)) continue;
          if ((other.a && bodyIds.has(other.a)) || (other.b && bodyIds.has(other.b))) {
            // Do not drag a separate actuator's own hinge.
            if (other.actuatorId && other.actuatorId !== j.actuatorId) continue;
            jointIds.add(other.id);
            if (other.a && !bodyIds.has(other.a)) { bodyIds.add(other.a); grew = true; }
            if (other.b && !bodyIds.has(other.b)) { bodyIds.add(other.b); grew = true; }
          }
        }
      }

      for (const b of this.scene.bodies) {
        if (!bodyIds.has(b.id)) continue;
        b.x += dx;
        b.y += dy;
      }
      for (const other of this.scene.joints) {
        if (!jointIds.has(other.id)) continue;
        if (Array.isArray(other.anchor)) {
          other.anchor = [other.anchor[0] + dx, other.anchor[1] + dy];
        }
        if (Array.isArray(other.pa)) {
          other.pa = [other.pa[0] + dx, other.pa[1] + dy];
        }
        if (Array.isArray(other.pb)) {
          other.pb = [other.pb[0] + dx, other.pb[1] + dy];
        }
      }
      moved = true;
    }
    if (moved) {
      this.rebuildCore();
      this.persist?.();
    }
    return moved;
  }

  worldPoint(e) {
    const r = this.stage.getBoundingClientRect();
    const cam = this.canvas.camera;
    return {
      x: (e.clientX - r.left - cam.x) / cam.zoom,
      y: (e.clientY - r.top - cam.y) / cam.zoom,
    };
  }

  resolveSnap(pt, e, opts = {}) {
    if (!this.snapEnabled || e?.altKey) return null;
    const maxDist = Math.max(10, 16 / (this.canvas.camera.zoom || 1));
    return snapPhysicsPoint(pt, this.scene, this.actuators(), this.poses, {
      maxDist,
      ...opts,
    });
  }

  renderSnapIndicator(snap) {
    this.hoverSnap = snap || null;
    this.gSnap.replaceChildren();
    if (!snap || !this.active) return;
    const color = snap.actuator ? "#d99b26" : "#00c896";
    this.gSnap.append(
      svgEl("circle", {
        cx: snap.x,
        cy: snap.y,
        r: 9,
        fill: "none",
        stroke: color,
        "stroke-width": 1.8,
      }),
      svgEl("path", {
        d: `M${snap.x - 13} ${snap.y}H${snap.x + 13}M${snap.x} ${snap.y - 13}V${snap.y + 13}`,
        stroke: color,
        "stroke-width": 1.1,
        "stroke-opacity": 0.85,
      }),
    );
    if (snap.label) {
      const txt = svgEl("text", {
        x: snap.x + 12,
        y: snap.y - 10,
        "font-size": 10,
        "font-family": "system-ui, sans-serif",
        fill: color,
      });
      txt.textContent = snap.label;
      this.gSnap.append(txt);
    }
  }

  nearestActuator(wx, wy, maxDist = SNAP_ACTUATOR_DIST) {
    let best = null;
    let bestD = maxDist;
    for (const a of this.actuators()) {
      if (a.hornTip) {
        const dt = Math.hypot(a.hornTip.x - wx, a.hornTip.y - wy);
        if (dt <= bestD) {
          best = { actuator: a, mount: "horn-tip", x: a.hornTip.x, y: a.hornTip.y };
          bestD = dt;
        }
      }
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d <= bestD) {
        best = { actuator: a, mount: "shaft", x: a.x, y: a.y };
        bestD = d;
      }
    }
    return best;
  }

  // ---- simulation engine lifecycle -----------------------------------------------------------

  async ensureCore() {
    if (this.core) return this.core;
    if (!this.rapier) this.rapier = await loadRapier();
    this.core = createPhysicsCore(this.rapier, this.scene, this.actuatorMap());
    this.poses = this.core.poses();
    this.simTime = this.core.t;
    return this.core;
  }

  freeCore() {
    if (this.core) {
      this.core.free();
      this.core = null;
    }
  }

  rebuildCore() {
    const wasRunning = this.running;
    this.freeCore();
    this.poses.clear();
    this.trails.clear();
    this.simTime = 0;
    if (wasRunning || this.arduinoRunning) {
      this.ensureCore().then(() => {
        if (this.latestActuatorStates) this.core?.updateActuators(this.latestActuatorStates);
        this.render();
      });
    } else {
      this.render();
    }
  }

  /** Called by main.js when the Arduino simulation starts. */
  onArduinoStart() {
    this.arduinoRunning = true;
    this.latestActuatorStates = {};
    if (!this.hasContent()) return;
    this.reset(false);
    this.play();
  }

  /** Called by main.js when the Arduino simulation pauses or resumes. */
  onArduinoPause(paused) {
    if (!this.hasContent()) return;
    if (paused) this.pause();
    else if (this.arduinoRunning) this.play();
  }

  /** Called by main.js when the Arduino simulation stops (e.g. Cmd+.): pause physics in place without snapping poses. */
  onArduinoStop() {
    this.arduinoRunning = false;
    if (!this.hasContent()) return;
    this.pause();
  }

  /** Called by main.js when a full reset is requested. */
  onArduinoReset() {
    this.arduinoRunning = false;
    this.latestActuatorStates = {};
    if (!this.hasContent()) return;
    this.reset(true, { rewindActuators: false });
  }

  /** Called by main.js on every worker state tick with live actuator states. */
  setActuatorStates(partStates = {}) {
    this.latestActuatorStates = partStates;
    if (this.core) this.core.updateActuators(partStates);
  }

  async play() {
    if (!this.hasContent()) {
      this.toast("Add a mechanism or body first");
      return;
    }
    await this.ensureCore();
    if (this.latestActuatorStates) this.core.updateActuators(this.latestActuatorStates);
    this.running = true;
    this.lastRaf = performance.now();
    this.accum = 0;
    this.updateToolbarState();
    this.startLoop();
  }

  pause() {
    this.running = false;
    this.stopLoop();
    this.updateToolbarState();
  }

  async stepOnce() {
    if (!this.hasContent()) return;
    await this.ensureCore();
    if (this.latestActuatorStates) this.core.updateActuators(this.latestActuatorStates);
    const f = this.core.step();
    this.consumeFrame(f);
    this.updateToolbarState();
    this.render();
  }

  reset(stop = true, { rewindActuators = false } = {}) {
    if (stop) {
      this.running = false;
      this.stopLoop();
    }
    this.latestActuatorStates = {};
    if (rewindActuators) {
      this.arduinoRunning = false;
      this.onRewindActuators?.();
    }
    this.trails.clear();
    this.blips = [];
    if (this.core) {
      this.core.free();
      this.core = null;
    }
    this.poses.clear();
    this.simTime = 0;
    this.updateToolbarState();
    this.render();
  }

  startLoop() {
    if (this.raf) return;
    const tick = (now) => {
      this.raf = 0;
      if (!this.running || !this.core) return;
      const dt = Math.min(0.08, Math.max(0, (now - this.lastRaf) / 1000));
      this.lastRaf = now;
      const speed = this.scene.world?.speed ?? 1;
      this.accum += dt * speed;
      let steps = 0;
      let lastFrame = null;
      while (this.accum >= DT && steps < 4) {
        if (this.latestActuatorStates) this.core.updateActuators(this.latestActuatorStates);
        lastFrame = this.core.step();
        this.accum -= DT;
        steps++;
      }
      if (lastFrame) this.consumeFrame(lastFrame);
      this.updateTimeReadout();
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  consumeFrame(f) {
    this.poses = f.poses;
    this.simTime = f.t;
    for (const b of this.scene.bodies) {
      if (!b.trace) continue;
      const p = this.poses.get(b.id);
      if (!p) continue;
      let pts = this.trails.get(b.id);
      if (!pts) {
        pts = [];
        this.trails.set(b.id, pts);
      }
      const last = pts.at(-1);
      if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) >= 1.2) {
        pts.push([p.x, p.y]);
        if (pts.length > MAX_TRAIL) pts.shift();
      }
    }
    const now = performance.now();
    for (const ev of f.events || []) {
      if (ev.type === "collide" && ev.speed > 45) {
        this.blips.push({ x: ev.x, y: ev.y, at: now, k: Math.min(1, ev.speed / 450) });
      }
    }
    if (this.blips.length > 32) this.blips.splice(0, this.blips.length - 32);
  }

  // ---- toolbar & inspector UI ----------------------------------------------------------------

  buildToolbar() {
    this.activeBodyTool = "link";
    this.activeJointTool = "hinge";
    this.toolbar.hidden = true;
    this.updateToolbarState();
  }

  /** Declarative Physics toolbar section injected natively into Poliplan's ONE toolbar (☰ → Toolbar → ☑ Physics). */
  poliplanToolbarConfig() {
    const gy = Number(this.scene.world?.gravity?.[1] ?? 9.8);
    const GRAVITIES = [
      ["9.8", "Gravity: Earth (9.8)"],
      ["0", "Gravity: Zero g (0)"],
      ["1.6", "Gravity: Moon (1.6)"],
      ["20", "Gravity: Heavy (20)"],
      ["-9.8", "Gravity: Up (−9.8)"],
    ];
    return {
      physics: [
        {
          id: "phys-bodies",
          label: "Physics Brush",
          kbd: "M",
          items: [
            { heading: "Physics Brushes" },
            { id: "box", label: "Box", icon: ICONS.box, tool: "host:phys-box", hint: "Drag to create a rigid rectangle" },
            { id: "circle", label: "Circle", icon: ICONS.circle, tool: "host:phys-circle", hint: "Drag to create a wheel or ball" },
            { id: "link", label: "Link bar", icon: ICONS.link, tool: "host:phys-link", hint: "Drag to create an auto-pinned linkage bar" },
            { id: "gear", label: "Spur gear", icon: ICONS.gear, tool: "host:phys-gear", hint: "Drag radius to create a meshing gear" },
            { id: "ramp", label: "Ramp / wall", icon: ICONS.ramp, tool: "host:phys-ramp", hint: "Drag to create a static ramp or rail" },
          ],
        },
        {
          id: "phys-joints",
          label: "Constraint",
          kbd: "J",
          items: [
            { heading: "Constraints" },
            { id: "hinge", label: "Hinge", icon: ICONS.hinge, tool: "host:phys-hinge", hint: "Pin bodies, servo horn tips, or motor shafts" },
            { id: "weld", label: "Weld", icon: ICONS.weld, tool: "host:phys-weld", hint: "Rigidly lock overlapping bodies" },
            { id: "spring", label: "Spring", icon: ICONS.spring, tool: "host:phys-spring", hint: "Drag an elastic spring-damper" },
            { id: "slider", label: "Slider rail", icon: ICONS.slider, tool: "host:phys-slider", hint: "Drag a linear prismatic rail on a body" },
          ],
        },
        {
          id: "phys-mech",
          label: "Mechanisms",
          kbd: "+",
          icon: ICONS.mech,
          hint: "Mechanism building blocks — pick one, then click anywhere to place (snaps to servos, motors & pins)",
          items: [
            { heading: "Mechanism Building Blocks" },
            ...MECHANISM_PRESETS.map((preset) => ({
              id: preset.id,
              label: preset.name,
              icon: ICONS.gear,
              hint: preset.tagline || preset.name,
              tool: `host:phys-stamp:${preset.id}`,
            })),
          ],
        },
        {
          id: "phys-settings",
          label: "Physics Settings",
          icon: ICONS.settings,
          active: this.running,
          hint: "Physics simulation, gravity, floor, snap & debug settings",
          items: [
            { heading: "Physics Simulation" },
            {
              label: this.running ? "Pause physics" : "Test physics only",
              icon: this.running ? ICONS.pause : ICONS.play,
              action: "phys-sim:play",
            },
            { label: "Step 1/60 s", icon: ICONS.step, action: "phys-sim:step" },
            "-",
            { label: "Undo physics", icon: ICONS.undo, keys: "⌘Z", disabled: !this.undoStack.length, action: "phys-sim:undo" },
            { label: "Redo physics", icon: ICONS.redo, keys: "⌘⇧Z", disabled: !this.redoStack.length, action: "phys-sim:redo" },
            "-",
            { label: "Keep connections when moving", checked: this.preserveConnections, action: "phys-toggle:preserve" },
            { label: "Floor boundary", checked: Boolean(this.scene.world?.floor), action: "phys-toggle:floor" },
            { label: "Magnetic snap (Alt bypass)", checked: this.snapEnabled, action: "phys-toggle:snap" },
            { label: "Visible in Electronics", checked: this.visible, action: "phys-toggle:visible" },
            { label: "Debug colliders", checked: this.debug, action: "phys-toggle:debug" },
            "-",
            ...GRAVITIES.map(([val, label]) => ({
              label,
              checked: Math.abs(gy - Number(val)) < 0.05,
              action: `phys-gravity:${val}`,
            })),
            "-",
            { label: "Physics quick guide", icon: ICONS.help, keys: "?", action: "phys-sim:guide" },
          ],
        },
      ],
    };
  }

  buildGuide() {
    const closeBtn = el("button", {
      type: "button",
      "aria-label": "Close guide",
      onclick: () => {
        this.guide.hidden = true;
      },
    }, "×");
    return el(
      "div",
      { class: "phys-guide", hidden: true },
      el("header", {}, el("span", {}, "Physics & Mechanisms Guide"), closeBtn),
      el(
        "ul",
        {},
        el("li", {}, el("strong", {}, "Physics Brushes (M): "), "Click again or right-click in Poliplan's toolbar to pick Box, Circle, Link (auto-pinned), Spur Gear, or Ramp."),
        el("li", {}, el("strong", {}, "Constraints (J): "), "Pick Hinge, Weld, Spring, or Slider. Snap a Link or Hinge to a teal ", el("strong", {}, "servo tip"), " or gold motor shaft."),
        el("li", {}, el("strong", {}, "Drawings are objects: "), "Right-click any Poliplan mark to attach dynamic/static physics or a curve track constraint. Select or box-select with Poliplan's V tool."),
        el("li", {}, el("strong", {}, "Transport: "), "Use Play, Rewind (↺), and the timer in the top bar to run or rewind Arduino, p5, and Physics together."),
        el("li", {}, el("strong", {}, "Toggle section: "), "Use Poliplan's ", el("strong", {}, "☰ → Toolbar → Physics"), " just like Score."),
      ),
    );
  }

  updateToolbarState() {
    this.toggleBtn?.classList.toggle("has-physics", this.hasContent());
    this.drawing?.setHostToolbar(this.poliplanToolbarConfig());
    this.updateTimeReadout();
  }

  updateTimeReadout() {
    this.onTimeChange?.(this.simTime);
  }

  renderInspector() {
    this.inspector.replaceChildren();
    const total = this.selectionCount();
    if ((!this.active && !this.drawing?.active) || total === 0) {
      this.inspector.hidden = true;
      this.onPropertiesState?.(false);
      return;
    }
    if (total > 1) {
      const selBodies = this.scene.bodies.filter((b) => this.selectedBodies.has(b.id));
      const parts = [];
      if (selBodies.length) parts.push(`${selBodies.length} ${selBodies.length === 1 ? "body" : "bodies"}`);
      if (this.selectedJoints.size) parts.push(`${this.selectedJoints.size} ${this.selectedJoints.size === 1 ? "joint" : "joints"}`);
      const title = `Selected · ${parts.join(", ")}`;
      this.inspector.hidden = false;
      const selJointsList = this.scene.joints.filter((j) => this.selectedJoints.has(j.id));
      this.onPropertiesState?.(true, title, { bodies: selBodies, joints: selJointsList });
      const updateAll = (patch) => {
        if (!selBodies.length) return;
        this.pushUndo();
        for (const b of selBodies) {
          Object.assign(b, patch);
          if (patch.color && b.sourceMarkId) {
            this.drawing?.updateMarkStyle(
              b.sourceMarkId,
              b.shape === "chain" ? { color: patch.color } : { fill: patch.color },
            );
          }
        }
        this.persistChange();
        this.renderInspector();
      };
      this.inspector.append(el("header", {}, el("span", {}, `Selected · ${parts.join(", ")}`)));
      if (selBodies.length) {
        this.inspector.append(
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Body type"),
            el(
              "select",
              { onchange: (e) => e.target.value && updateAll({ type: e.target.value }) },
              el("option", { value: "" }, "Set all…"),
              ...BODY_TYPES.map((t) => el("option", { value: t }, t)),
            ),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Material"),
            el(
              "select",
              {
                onchange: (e) => {
                  const preset = MATERIAL_PRESETS[e.target.value];
                  if (preset) {
                    updateAll({
                      density: preset.density,
                      friction: preset.friction,
                      bounce: preset.bounce,
                      color: preset.color,
                    });
                  }
                },
              },
              el("option", { value: "" }, "Preset…"),
              ...Object.entries(MATERIAL_PRESETS).map(([k, p]) => el("option", { value: k }, p.label)),
            ),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", { title: "Collision matrix: bodies sharing any active layer collide" }, "Layers"),
            el(
              "div",
              { class: "phys-layer-toggles" },
              ...COLLISION_LAYERS.map((l) => {
                const countOn = selBodies.filter((x) => (resolvedCollisionMask(x) & l.bit) !== 0).length;
                const state = countOn === selBodies.length ? "true" : countOn === 0 ? "false" : "mixed";
                return el(
                  "button",
                  {
                    type: "button",
                    "aria-pressed": state,
                    title: `Toggle collision layer ${l.label}`,
                    onclick: () => {
                      const turnOn = countOn < selBodies.length;
                      this.pushUndo();
                      for (const x of selBodies) {
                        const m = resolvedCollisionMask(x);
                        x.collisionMask = turnOn ? m | l.bit : m & ~l.bit;
                        delete x.collisionLayer;
                      }
                      this.persistChange();
                      this.renderInspector();
                    },
                  },
                  l.label,
                );
              }),
            ),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Color"),
            el("input", {
              type: "color",
              value: selBodies[0].color || "#4e8da6",
              onchange: (e) => updateAll({ color: e.target.value }),
            }),
          ),
        );
      }
      this.inspector.append(
        el(
          "button",
          {
            type: "button",
            class: "phys-danger",
            onclick: () => this.deleteSelected(),
          },
          `Delete selected (${total})`,
        ),
      );
      return;
    }
    if (this.selected?.kind === "body") {
      const b = this.scene.bodies.find((x) => x.id === this.selected.id);
      if (!b) {
        this.inspector.hidden = true;
        this.onPropertiesState?.(false);
        return;
      }
      this.inspector.hidden = false;
      this.onPropertiesState?.(true, `${b.label || b.shape} (${b.id})`, b);
      const update = (patch) => {
        this.pushUndo();
        Object.assign(b, patch);
        if (patch.color && b.sourceMarkId) {
          this.drawing?.updateMarkStyle(
            b.sourceMarkId,
            b.shape === "chain" ? { color: patch.color } : { fill: patch.color },
          );
        }
        this.persistChange();
        this.renderInspector();
      };
      this.inspector.append(
        el("header", {}, el("span", {}, `${b.label || b.shape} (${b.id})`)),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Body type"),
          el(
            "select",
            {
              onchange: (e) => update({ type: e.target.value }),
            },
            ...BODY_TYPES.map((t) =>
              el("option", { value: t, selected: b.type === t }, t),
            ),
          ),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", { title: "Collision matrix: bodies sharing any active layer collide (all off = pass-through)" }, "Layers"),
          el(
            "div",
            { class: "phys-layer-toggles" },
            ...COLLISION_LAYERS.map((l) => {
              const mask = resolvedCollisionMask(b);
              const on = (mask & l.bit) !== 0;
              return el(
                "button",
                {
                  type: "button",
                  "aria-pressed": String(on),
                  title: `Toggle collision layer ${l.label}`,
                  onclick: () => {
                    const nextMask = on ? mask & ~l.bit : mask | l.bit;
                    delete b.collisionLayer;
                    update({ collisionMask: nextMask });
                  },
                },
                l.label,
              );
            }),
          ),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Material"),
          el(
            "select",
            {
              onchange: (e) => {
                const preset = MATERIAL_PRESETS[e.target.value];
                if (preset) {
                  update({
                    density: preset.density,
                    friction: preset.friction,
                    bounce: preset.bounce,
                    color: preset.color,
                  });
                }
              },
            },
            el("option", { value: "" }, "Preset…"),
            ...Object.entries(MATERIAL_PRESETS).map(([k, p]) =>
              el("option", { value: k }, p.label),
            ),
          ),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Color"),
          el("input", {
            type: "color",
            value: b.color || "#4e8da6",
            oninput: (e) => {
              b.color = e.target.value;
              this.render();
            },
            onchange: (e) => update({ color: e.target.value }),
          }),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Density"),
          el("input", {
            type: "number",
            step: "0.1",
            min: "0.05",
            max: "50",
            value: b.density ?? MATERIAL_DEFAULTS.density,
            onchange: (e) => update({ density: Math.max(0.05, Number(e.target.value) || 1) }),
          }),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Friction"),
          el("input", {
            type: "number",
            step: "0.05",
            min: "0",
            max: "5",
            value: b.friction ?? MATERIAL_DEFAULTS.friction,
            onchange: (e) => update({ friction: Math.max(0, Number(e.target.value) || 0) }),
          }),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Bounce"),
          el("input", {
            type: "number",
            step: "0.05",
            min: "0",
            max: "1.5",
            value: b.bounce ?? MATERIAL_DEFAULTS.bounce,
            onchange: (e) => update({ bounce: Math.max(0, Number(e.target.value) || 0) }),
          }),
        ),
        el(
          "div",
          { class: "phys-row" },
          el("label", {}, "Pen trail"),
          el("input", {
            type: "checkbox",
            checked: Boolean(b.trace),
            onchange: (e) => update({ trace: e.target.checked }),
          }),
        ),
        el(
          "button",
          {
            type: "button",
            class: "phys-danger",
            onclick: () => this.deleteSelected(),
          },
          "Delete body",
        ),
      );
      return;
    }

    if (this.selected.kind === "joint") {
      const j = this.scene.joints.find((x) => x.id === this.selected.id);
      if (!j) {
        this.inspector.hidden = true;
        this.onPropertiesState?.(false);
        return;
      }
      this.inspector.hidden = false;
      this.onPropertiesState?.(true, `${j.kind[0].toUpperCase() + j.kind.slice(1)} (${j.id})`, j);
      const update = (patch) => {
        this.pushUndo();
        Object.assign(j, patch);
        this.persistChange();
        this.renderInspector();
      };
      this.inspector.append(
        el("header", {}, el("span", {}, `${j.kind[0].toUpperCase() + j.kind.slice(1)} (${j.id})`)),
      );
      if (j.kind === "hinge") {
        const acts = this.actuators();
        this.inspector.append(
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Actuator"),
            el(
              "select",
              {
                onchange: (e) => {
                  const id = e.target.value || null;
                  if (id) {
                    const p = acts.find((a) => a.id === id);
                    update({
                      actuatorId: id,
                      motor: null,
                      ...(p ? { anchor: [p.x, p.y] } : {}),
                    });
                  } else {
                    update({ actuatorId: null });
                  }
                },
              },
              el("option", { value: "", selected: !j.actuatorId }, "None (free / manual)"),
              ...acts.map((a) =>
                el("option", { value: a.id, selected: j.actuatorId === a.id }, a.label),
              ),
            ),
          ),
        );
        if (j.actuatorId) {
          this.inspector.append(
            el(
              "div",
              { class: "phys-row" },
              el("label", {}, "Mount offset (°)"),
              el("input", {
                type: "number",
                step: "15",
                min: "-180",
                max: "180",
                value: j.offsetDeg ?? 0,
                onchange: (e) =>
                  update({ offsetDeg: Number(e.target.value) || 0 }),
              }),
            ),
          );
        }
        if (!j.actuatorId) {
          const hasMotor = Boolean(j.motor && j.motor.on !== false);
          this.inspector.append(
            el(
              "div",
              { class: "phys-row" },
              el("label", {}, "Built-in motor"),
              el("input", {
                type: "checkbox",
                checked: hasMotor,
                onchange: (e) =>
                  update({
                    motor: e.target.checked
                      ? { on: true, speed: j.motor?.speed ?? 90, torque: j.motor?.torque ?? 220 }
                      : null,
                  }),
              }),
            ),
          );
          if (hasMotor) {
            this.inspector.append(
              el(
                "div",
                { class: "phys-row" },
                el("label", {}, "Speed (°/s)"),
                el("input", {
                  type: "number",
                  step: "15",
                  min: "-720",
                  max: "720",
                  value: j.motor.speed ?? 90,
                  onchange: (e) =>
                    update({ motor: { ...j.motor, speed: Number(e.target.value) || 0 } }),
                }),
              ),
              el(
                "div",
                { class: "phys-row" },
                el("label", {}, "Torque"),
                el("input", {
                  type: "number",
                  step: "20",
                  min: "5",
                  max: "2000",
                  value: j.motor.torque ?? 220,
                  onchange: (e) =>
                    update({ motor: { ...j.motor, torque: Math.max(5, Number(e.target.value) || 180) } }),
                }),
              ),
            );
          }
        }
      } else if (j.kind === "spring") {
        const autoLen = j.pa && j.pb ? Math.round(Math.hypot(j.pb[0] - j.pa[0], j.pb[1] - j.pa[1])) : 60;
        this.inspector.append(
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Stiffness"),
            el("input", {
              type: "number",
              step: "5",
              min: "1",
              max: "500",
              value: j.stiffness ?? 40,
              onchange: (e) => update({ stiffness: Math.max(1, Number(e.target.value) || 40) }),
            }),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Damping"),
            el("input", {
              type: "number",
              step: "0.2",
              min: "0",
              max: "50",
              value: j.damping ?? 2,
              onchange: (e) => update({ damping: Math.max(0, Number(e.target.value) || 0) }),
            }),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Color"),
            el("input", {
              type: "color",
              value: j.color || "#3b7a6c",
              onchange: (e) => update({ color: e.target.value }),
            }),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Rest length"),
            el("input", {
              type: "number",
              step: "5",
              min: "5",
              max: "600",
              value: Math.round(j.restLength ?? autoLen),
              onchange: (e) => update({ restLength: Math.max(5, Number(e.target.value) || autoLen) }),
            }),
          ),
        );
      } else if (j.kind === "slider") {
        const [minL, maxL] = Array.isArray(j.limits) ? j.limits : [-80, 80];
        this.inspector.append(
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Min travel"),
            el("input", {
              type: "number",
              step: "10",
              value: Math.round(minL),
              onchange: (e) => update({ limits: [Number(e.target.value) || 0, maxL] }),
            }),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Max travel"),
            el("input", {
              type: "number",
              step: "10",
              value: Math.round(maxL),
              onchange: (e) => update({ limits: [minL, Number(e.target.value) || 0] }),
            }),
          ),
        );
      } else if (j.kind === "curve") {
        this.inspector.append(
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Track friction"),
            el("input", {
              type: "number",
              step: "0.01",
              min: "0",
              max: "0.5",
              value: j.friction ?? 0.03,
              onchange: (e) => update({ friction: Math.max(0, Math.min(0.5, Number(e.target.value) || 0)) }),
            }),
          ),
          el(
            "div",
            { class: "phys-row" },
            el("label", {}, "Closed loop"),
            el("input", {
              type: "checkbox",
              checked: Boolean(j.closed),
              onchange: (e) => update({ closed: e.target.checked }),
            }),
          ),
        );
      }
      this.inspector.append(
        el(
          "button",
          {
            type: "button",
            class: "phys-danger",
            onclick: () => this.deleteSelected(),
          },
          "Delete joint",
        ),
      );
    }
  }

  deleteSelected() {
    if (this.selectionCount() === 0) return;
    this.pushUndo();
    const deadBodies = new Set(this.selectedBodies);
    const deadJoints = new Set(this.selectedJoints);
    if (deadBodies.size) {
      this.scene.bodies = this.scene.bodies.filter((b) => !deadBodies.has(b.id));
    }
    this.scene.joints = this.scene.joints.filter(
      (j) => !deadJoints.has(j.id) && !deadBodies.has(j.a) && !deadBodies.has(j.b),
    );
    this.clearSelection();
    this.persistChange();
    this.renderInspector();
  }

  persistChange() {
    this.rebuildCore();
    this.persist?.();
  }

  // ---- mechanism presets & Poliplan import ---------------------------------------------------

  /** Build a mechanism preset positioned at world point `pt` (coupling to snapped actuator or body when present). */
  buildStampAt(presetId, pt, snap = null) {
    const preset = MECHANISM_PRESETS.find((m) => m.id === presetId);
    if (!preset) return null;
    const act = snap?.actuator || null;
    const origin = act ? [act.x, act.y] : [pt.x, pt.y];
    const built = preset.build({
      origin,
      actuatorId: act?.id || null,
      actuatorType: act?.type || null,
      hornTip: act?.hornTip ? [act.hornTip.x, act.hornTip.y] : null,
      existingBodies: this.scene.bodies,
      existingJoints: this.scene.joints,
    });
    // If snapped directly to an existing link bore or joint pin (not an actuator), attach the primary drive hinge to that body.
    if (!act && snap?.bodyId) {
      const primary = built.joints.find((j) => j.kind === "hinge" && !j.a && !j.actuatorId);
      if (primary) {
        primary.a = snap.bodyId;
        delete primary.motor;
      }
    }
    return { preset, ...built, actuator: act };
  }

  /** Drop the active mechanism stamp at `(pt.x, pt.y)`. */
  placeMechanismStamp(presetId, pt, snap = null, keepArmed = false) {
    const res = this.buildStampAt(presetId, pt, snap);
    if (!res) return;
    this.pushUndo();
    this.scene.bodies.push(...res.bodies);
    this.scene.joints.push(...res.joints);
    this.selectedBodies = new Set(res.bodies.map((b) => b.id));
    this.selectedJoints.clear();
    this.persistChange();
    this.renderInspector();
    this.toast(
      res.actuator
        ? `${res.preset.name} snapped to ${res.actuator.label}`
        : snap?.bodyId
          ? `${res.preset.name} connected to ${snap.bodyId}`
          : `${res.preset.name} placed`,
    );
    if (!keepArmed) {
      this.stampPresetId = null;
      this.stampPreview = null;
      this.renderDraft();
      this.renderSnapIndicator(null);
      this.drawing?.setTool("select");
      this.setActive(false, { closeToolbar: false });
    }
  }

  addMechanismPreset(presetId) {
    const preset = MECHANISM_PRESETS.find((m) => m.id === presetId);
    if (!preset) return;
    const acts = this.actuators();
    const selPart = this.getSelectedPart?.();
    const targetActuator =
      (selPart && acts.find((a) => a.id === selPart.id)) || acts[0] || null;
    let origin;
    if (targetActuator) {
      origin = [targetActuator.x, targetActuator.y];
    } else {
      const r = this.stage.getBoundingClientRect();
      const cam = this.canvas.camera;
      origin = [
        (r.width * 0.45 - cam.x) / cam.zoom,
        (r.height * 0.48 - cam.y) / cam.zoom,
      ];
    }
    const { bodies, joints } = preset.build({
      origin,
      actuatorId: targetActuator?.id || null,
      actuatorType: targetActuator?.type || null,
      hornTip: targetActuator?.hornTip
        ? [targetActuator.hornTip.x, targetActuator.hornTip.y]
        : null,
      existingBodies: this.scene.bodies,
      existingJoints: this.scene.joints,
    });
    this.pushUndo();
    this.scene.bodies.push(...bodies);
    this.scene.joints.push(...joints);
    this.selected = bodies[0] ? { kind: "body", id: bodies[0].id } : null;
    this.persistChange();
    this.renderInspector();
    this.toast(
      targetActuator
        ? `${preset.name} attached to ${targetActuator.label}`
        : `${preset.name} added (built-in motor; add a servo or DC motor to couple it)`,
    );
  }

  importFromPoliplan() {
    const doc = this.getDrawingDoc?.();
    const created = poliplanDocToPhysicsBodies(doc, this.scene.bodies);
    if (!created.length) {
      this.toast("No Poliplan drawing marks found — draw shapes in Draw mode first");
      return;
    }
    this.pushUndo();
    this.scene.bodies.push(...created);
    this.selected = { kind: "body", id: created[0].id };
    this.persistChange();
    this.renderInspector();
    this.toast(`Imported ${created.length} physical ${created.length === 1 ? "body" : "bodies"} from Poliplan`);
  }

  /** Handle right-click Physics actions directly from Poliplan's context menu. */
  handlePoliplanAction(kind, doc, ids = []) {
    this.visible = true;
    this.svg.classList.remove("hidden-layer");
    if (kind === "phys-dynamic" || kind === "phys-static") {
      this.pushUndo();
      const type = kind === "phys-static" ? "static" : "dynamic";
      const { bodies, replaced } = attachPoliplanBodies(this.scene, doc, ids, { type });
      const n = bodies.length + replaced;
      if (!n) return "Select a Poliplan shape or stroke first.";
      this.clearSelection();
      const idSet = new Set(ids || []);
      for (const b of this.scene.bodies) {
        if (b.sourceMarkId && (!idSet.size || idSet.has(b.sourceMarkId))) {
          this.selectedBodies.add(b.id);
        }
      }
      this.persistChange();
      this.updateToolbarState();
      this.renderInspector();
      return `${n} Poliplan mark${n === 1 ? "" : "s"} attached as ${type} physics (live-synced).`;
    }
    if (kind === "phys-curve") {
      this.pushUndo();
      const res = attachPoliplanCurveConstraint(this.scene, doc, ids);
      if (!res) return "Select an open or closed curve in Poliplan first.";
      this.selectSingle("joint", res.joint.id);
      this.persistChange();
      this.updateToolbarState();
      this.renderInspector();
      return res.createdCarriage
        ? `Curve track attached with a carriage pin (live-synced with Poliplan).`
        : `Body ${res.body.id} constrained to the Poliplan curve (live-synced).`;
    }
    if (kind === "phys-detach") {
      this.pushUndo();
      const { removedBodies, removedJoints } = detachPoliplanMarks(this.scene, ids);
      const total = removedBodies + removedJoints;
      if (!total) return "No physics attached to the selected Poliplan mark(s).";
      this.clearSelection();
      this.persistChange();
      this.updateToolbarState();
      this.renderInspector();
      return `Removed physics from ${total} Poliplan mark${total === 1 ? "" : "s"}.`;
    }
    if (kind.startsWith("phys-preset:")) {
      this.addMechanismPreset(kind.slice("phys-preset:".length));
      return "";
    }
    if (kind === "phys-sim:play") {
      this.running ? this.pause() : this.play();
      return "";
    }
    if (kind === "phys-sim:step") {
      this.stepOnce();
      return "";
    }
    if (kind === "phys-sim:undo") {
      this.undo();
      return "";
    }
    if (kind === "phys-sim:redo") {
      this.redo();
      return "";
    }
    if (kind === "phys-sim:guide") {
      this.guide.hidden = !this.guide.hidden;
      return "";
    }
    if (kind === "phys-toggle:preserve") {
      this.preserveConnections = !this.preserveConnections;
      this.updateToolbarState();
      return "";
    }
    if (kind === "phys-toggle:floor") {
      this.pushUndo();
      this.scene.world.floor = !this.scene.world.floor;
      this.persistChange();
      this.updateToolbarState();
      return "";
    }
    if (kind === "phys-toggle:snap") {
      this.snapEnabled = !this.snapEnabled;
      if (!this.snapEnabled) this.renderSnapIndicator(null);
      this.updateToolbarState();
      return "";
    }
    if (kind === "phys-toggle:visible") {
      this.visible = !this.visible;
      this.updateToolbarState();
      return "";
    }
    if (kind === "phys-toggle:debug") {
      this.debug = !this.debug;
      this.render();
      this.updateToolbarState();
      return "";
    }
    if (kind.startsWith("phys-gravity:")) {
      this.pushUndo();
      this.scene.world.gravity = [0, Number(kind.slice("phys-gravity:".length))];
      this.persistChange();
      this.updateToolbarState();
      return "";
    }
    return "";
  }

  /**
   * When selecting marks in Poliplan with its unified Select tool, automatically
   * open the Physics Properties inspector for any mark that has physics attached.
   */
  onPoliplanSelection(ids = []) {
    if (this.active || !this.drawing?.active) return;
    const idSet = new Set(ids || []);
    const recentBox = performance.now() - (this._lastBoxSelectAt || 0) < 350;
    if (recentBox) {
      if (idSet.size) {
        for (const b of this.scene.bodies) {
          if (b.sourceMarkId && idSet.has(b.sourceMarkId)) this.selectedBodies.add(b.id);
        }
        for (const j of this.scene.joints) {
          if (j.sourceMarkId && idSet.has(j.sourceMarkId)) this.selectedJoints.add(j.id);
        }
        this.renderInspector();
        this.render();
      }
      return;
    }
    this.selectedBodies.clear();
    this.selectedJoints.clear();
    if (idSet.size) {
      for (const b of this.scene.bodies) {
        if (b.sourceMarkId && idSet.has(b.sourceMarkId)) this.selectedBodies.add(b.id);
      }
      for (const j of this.scene.joints) {
        if (j.sourceMarkId && idSet.has(j.sourceMarkId)) this.selectedJoints.add(j.id);
      }
    }
    this.renderInspector();
    this.render();
  }

  /** Live-sync any bodies or curve constraints linked to Poliplan marks via sourceMarkId. */
  syncFromPoliplan(doc) {
    if (!this.hasContent()) return;
    if (syncLinkedPoliplanMarks(this.scene, doc)) {
      this.persistChange();
      this.renderInspector();
    }
  }

  // ---- pointer & keyboard interaction --------------------------------------------------------

  bindEvents() {
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.defaultPrevented) return;
        if (e.target?.closest?.("input,textarea,select,[contenteditable],.cm-editor")) return;
        const mod = e.ctrlKey || e.metaKey;
        if (this.active && mod && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === "z") {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.shiftKey) this.redo();
            else this.undo();
            return;
          }
          if (k === "y") {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.redo();
            return;
          }
          if (k === "a") {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.selectedBodies = new Set(this.scene.bodies.map((b) => b.id));
            this.selectedJoints = new Set(this.scene.joints.map((j) => j.id));
            this.renderInspector();
            this.render();
            return;
          }
        }
        if (mod || e.altKey) return;
        if (this.drawing?.active && !e.repeat) {
          if (this.handleShortcutKey(e)) return;
          // Pressing any Poliplan tool shortcut (V/H/0/1/2/B/S) or Escape disarms an active Physics brush.
          if (
            this.active &&
            (["KeyV", "KeyH", "Digit0", "Digit1", "Digit2", "KeyB", "KeyS"].includes(e.code) || e.key === "Escape")
          ) {
            this.setActive(false, { closeToolbar: false });
            if (e.key === "Escape") {
              this.clearSelection();
              this.renderInspector();
              this.render();
            }
            return;
          }
          if (
            (e.key === "Delete" || e.key === "Backspace") &&
            this.selectionCount() > 0 &&
            !(this.drawing.drawingSelection?.length)
          ) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.deleteSelected();
            return;
          }
        }
        if (!this.active) return;
        if (e.key === "Escape") {
          this.setActive(false, { closeToolbar: false });
          this.clearSelection();
          this.renderInspector();
          this.render();
        } else if ((e.key === "Delete" || e.key === "Backspace") && this.selectionCount() > 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.deleteSelected();
        }
      },
      true,
    );

    const onDown = (e) => {
      if (!this.active) {
        // Unified Select (V) & Direct Edit (Shift+V): Poliplan forwards clicks on Physics bodies, joints & handles here!
        if (this.drawing?.active && e.button === 0 && !this.canvas.space) {
          e.preventDefault();
          e.stopPropagation();
          this.handleSelectDown(this.worldPoint(e), e.shiftKey, e.altKey);
        }
        return;
      }
      if (e.button === 1 || this.canvas.space) return; // let CircuitCanvas pan
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const rawPt = this.worldPoint(e);
      if (this.tool === "stamp" && this.stampPresetId) {
        const snap = this.resolveSnap(rawPt, e);
        const pt = snap ? { x: snap.x, y: snap.y } : rawPt;
        this.placeMechanismStamp(this.stampPresetId, pt, snap, Boolean(e.shiftKey));
        return;
      }
      const snap = ["hinge", "weld", "spring", "slider", "link", "gear", "circle"].includes(this.tool)
        ? this.resolveSnap(rawPt, e)
        : null;
      const pt = snap ? { x: snap.x, y: snap.y } : rawPt;
      if (this.tool === "select") {
        this.handleSelectDown(rawPt, e.shiftKey);
      } else if (this.tool === "lasso") {
        this.drag = {
          kind: "lasso-select",
          additive: e.shiftKey,
          pts: [[rawPt.x, rawPt.y]],
          start: rawPt,
          cur: rawPt,
        };
        this.renderDraft();
      } else if (this.tool === "hinge" || this.tool === "weld") {
        this.placePointJoint(this.tool, pt, snap);
      } else {
        this.drag = { tool: this.tool, start: pt, cur: pt, startSnap: snap, endSnap: null };
        this.renderDraft();
      }
    };

    const onMove = (e) => {
      const rawPt = this.worldPoint(e);
      if (!this.drag) {
        if (this.active && this.tool === "stamp" && this.stampPresetId) {
          const snap = this.resolveSnap(rawPt, e);
          this.renderSnapIndicator(snap);
          const pt = snap ? { x: snap.x, y: snap.y } : rawPt;
          this.stampPreview = this.buildStampAt(this.stampPresetId, pt, snap);
          this.renderDraft();
          return;
        }
        if (this.active && ["hinge", "weld", "spring", "slider", "link", "gear", "circle"].includes(this.tool)) {
          this.renderSnapIndicator(this.resolveSnap(rawPt, e));
        } else if (this.hoverSnap) {
          this.renderSnapIndicator(null);
        }
        return;
      }
      if (this.drag.kind === "grab") {
        this.drag.cur = rawPt;
        this.core?.grabMove(rawPt.x, rawPt.y);
      } else if (this.drag.kind === "box-select") {
        this.drag.cur = rawPt;
        this.renderDraft();
      } else if (this.drag.kind === "lasso-select") {
        this.drag.cur = rawPt;
        const last = this.drag.pts.at(-1);
        if (!last || Math.hypot(rawPt.x - last[0], rawPt.y - last[1]) >= 4) {
          this.drag.pts.push([rawPt.x, rawPt.y]);
        }
        this.renderDraft();
      } else if (this.drag.kind === "move-body") {
        this.drag.cur = rawPt;
        const dx = rawPt.x - this.drag.start.x;
        const dy = rawPt.y - this.drag.start.y;
        for (const mb of this.drag.movedBodies || []) {
          mb.body.x = mb.origX + dx;
          mb.body.y = mb.origY + dy;
        }
        for (const mj of this.drag.movedJoints || []) {
          if (mj.prop === "anchor") mj.joint.anchor = [mj.orig[0] + dx, mj.orig[1] + dy];
          else mj.joint[mj.prop] = [mj.orig[0] + dx, mj.orig[1] + dy];
        }
        this.render();
      } else if (this.drag.kind === "transform-scale") {
        this.drag.cur = rawPt;
        const dist = Math.max(4, Math.hypot(rawPt.x - this.drag.cx, rawPt.y - this.drag.cy));
        const scale = dist / this.drag.startDist;
        applyTransformScale(
          this.drag.origBodies,
          this.drag.origJoints,
          this.drag.bodies,
          this.drag.joints,
          this.drag.cx,
          this.drag.cy,
          scale,
        );
        this.render();
        this.renderInspector();
      } else if (this.drag.kind === "transform-rotate") {
        this.drag.cur = rawPt;
        let delta = Math.atan2(rawPt.y - this.drag.cy, rawPt.x - this.drag.cx) - this.drag.startAngle;
        if (e.shiftKey) {
          const step = Math.PI / 12; // 15° snap
          delta = Math.round(delta / step) * step;
        }
        applyTransformRotate(
          this.drag.origBodies,
          this.drag.origJoints,
          this.drag.bodies,
          this.drag.joints,
          this.drag.cx,
          this.drag.cy,
          delta,
        );
        this.render();
        this.renderInspector();
      } else if (this.drag.kind === "direct-handle") {
        const { body, handle } = this.drag;
        const canSnap = handle.kind === "linkEnd" || handle.kind === "vertex";
        const snap = canSnap ? this.resolveSnap(rawPt, e, { ignoreBodyId: body.id }) : null;
        this.renderSnapIndicator(snap);
        const nx = snap ? snap.x : rawPt.x;
        const ny = snap ? snap.y : rawPt.y;
        this.drag.cur = { x: nx, y: ny };
        applyDirectHandleDrag(this.scene, body, handle, nx, ny, {
          carryJoints: this.preserveConnections && !e.altKey,
        });
        this.render();
        this.renderInspector();
      } else if (this.drag.kind === "move-joint") {
        const j = this.drag.joint;
        const snap = this.resolveSnap(rawPt, e, { ignoreJointId: j.id });
        this.renderSnapIndicator(snap);
        const nx = snap ? snap.x : rawPt.x;
        const ny = snap ? snap.y : rawPt.y;
        this.drag.cur = { x: nx, y: ny };
        if (this.drag.end === "pa") j.pa = [nx, ny];
        else if (this.drag.end === "pb") j.pb = [nx, ny];
        else if (this.drag.preserveLinks) movePivotPreservingLinks(this.scene, j, nx, ny);
        else j.anchor = [nx, ny];
        this.drag.snap = snap;
        this.render();
      } else {
        const snap = ["link", "spring", "slider"].includes(this.drag.tool)
          ? this.resolveSnap(rawPt, e)
          : null;
        this.renderSnapIndicator(snap);
        this.drag.endSnap = snap;
        this.drag.cur = snap ? { x: snap.x, y: snap.y } : rawPt;
        this.renderDraft();
      }
    };

    const onUp = () => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      this.gDraft.replaceChildren();
      if (d.kind === "grab") {
        this.core?.grabEnd();
      } else if (d.kind === "box-select") {
        const dist = Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y);
        if (dist >= 5) {
          const hit = selectInBox(
            this.scene,
            { x0: d.start.x, y0: d.start.y, x1: d.cur.x, y1: d.cur.y },
            this.poses,
          );
          if (!d.additive) this.clearSelection();
          for (const id of hit.bodyIds) this.selectedBodies.add(id);
          for (const id of hit.jointIds) this.selectedJoints.add(id);
        } else if (!d.additive) {
          this.clearSelection();
        }
        this.renderInspector();
        this.render();
      } else if (d.kind === "lasso-select") {
        if (d.pts.length >= 3) {
          const hit = selectInLasso(this.scene, d.pts, this.poses);
          if (!d.additive) this.clearSelection();
          for (const id of hit.bodyIds) this.selectedBodies.add(id);
          for (const id of hit.jointIds) this.selectedJoints.add(id);
        } else if (!d.additive) {
          this.clearSelection();
        }
        this.setTool("select");
        this.renderInspector();
        this.render();
      } else if (d.kind === "transform-scale" || d.kind === "transform-rotate") {
        if (Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y) >= 1) {
          this.pushUndo(d.beforeSnap);
          this.persistChange();
        }
        this.renderInspector();
        this.render();
      } else if (d.kind === "direct-handle") {
        this.renderSnapIndicator(null);
        if (Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y) >= 1) {
          this.pushUndo(d.beforeSnap);
          this.persistChange();
        }
        this.renderInspector();
        this.render();
      } else if (d.kind === "move-body") {
        if (Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y) >= 1) {
          this.pushUndo(d.beforeSnap);
        }
        this.persistChange();
      } else if (d.kind === "move-joint") {
        const j = d.joint;
        const p = d.end === "pa" ? j.pa : d.end === "pb" ? j.pb : j.anchor;
        if (j.kind === "hinge" || j.kind === "weld") {
          const actSnap =
            j.kind === "hinge" && d.snap?.actuator
              ? d.snap
              : j.kind === "hinge"
                ? this.nearestActuator(p[0], p[1], 16)
                : null;
          const hits = bodiesAtPoint(this.scene.bodies, p[0], p[1], null, 8);
          if (actSnap) {
            j.actuatorId = actSnap.actuator.id;
            j.mount = actSnap.mount;
            j.a = null;
            if (hits[0]) j.b = hits[0].id;
            this.toast(`Coupled to ${actSnap.actuator.label}${actSnap.mount === "horn-tip" ? " horn tip" : ""}`);
          } else {
            if (j.actuatorId) {
              delete j.actuatorId;
              delete j.mount;
            }
            if (hits.length >= 2) {
              j.a = hits[0].id;
              j.b = hits[1].id;
            } else if (hits.length === 1) {
              j.a = null;
              j.b = hits[0].id;
            }
          }
        }
        this.pushUndo(d.beforeSnap);
        this.persistChange();
        this.renderInspector();
      } else if (d.tool) {
        this.finishShapeTool(d);
      }
    };

    const stopCircuitMenu = (e) => {
      if (!this.active) return;
      e.preventDefault();
      e.stopPropagation();
    };
    this.stage.addEventListener("p5comp:selection-box", (e) => {
      if (!this.drawing?.active && !this.active) return;
      const { x, y, w, h, additive } = e.detail || {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this._lastBoxSelectAt = performance.now();
      if (!additive) this.clearSelection();
      if (w >= 4 || h >= 4) {
        const hits = selectInBox(
          this.scene,
          { x0: x, y0: y, x1: x + w, y1: y + h },
          this.poses,
        );
        for (const id of hits.bodyIds) this.selectedBodies.add(id);
        for (const id of hits.jointIds) this.selectedJoints.add(id);
      }
      this.renderInspector();
      this.render();
    });

    this._onDown = onDown;
    this._onMove = onMove;
    this._onUp = onUp;

    this.capture.addEventListener("pointerdown", onDown);
    this.svg.addEventListener("pointerdown", onDown);
    this.capture.addEventListener("dblclick", stopCircuitMenu);
    this.svg.addEventListener("dblclick", stopCircuitMenu);
    this.capture.addEventListener("contextmenu", stopCircuitMenu);
    this.svg.addEventListener("contextmenu", stopCircuitMenu);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /** Return `{ bodies, joints }` eligible for Poliplan-style transform box (scale/rotate) in V mode. */
  transformSelectionInfo() {
    if (this.running || this.directEdit || !this.drawing?.active || !this.selectedBodies.size) return null;
    const bodies = this.scene.bodies.filter((b) => this.selectedBodies.has(b.id) && !b.sourceMarkId);
    if (!bodies.length) return null;
    const bSet = new Set(bodies.map((b) => b.id));
    const joints = this.scene.joints.filter(
      (j) => !j.actuatorId && ((j.a && bSet.has(j.a)) || (j.b && bSet.has(j.b)) || this.selectedJoints.has(j.id)),
    );
    const bounds = selectionBounds(this.scene, bSet, joints.map((j) => j.id));
    if (!bounds) return null;
    const pad = 6;
    const x0 = bounds.minX - pad;
    const y0 = bounds.minY - pad;
    const x1 = bounds.maxX + pad;
    const y1 = bounds.maxY + pad;
    return {
      bodies,
      joints,
      bounds,
      corners: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      rotHandle: [bounds.cx, y0 - 20],
      box: { x0, y0, x1, y1 },
    };
  }

  handleSelectDown(pt, shiftKey = false, altKey = false) {
    // 0a. In V mode, check Poliplan-style transform box handles (4 scale corners + top rotate knob)!
    const xform = !shiftKey ? this.transformSelectionInfo() : null;
    if (xform) {
      const { bodies, joints, bounds, corners, rotHandle } = xform;
      if (Math.hypot(rotHandle[0] - pt.x, rotHandle[1] - pt.y) <= 10) {
        this.drag = {
          kind: "transform-rotate",
          cx: bounds.cx,
          cy: bounds.cy,
          startAngle: Math.atan2(pt.y - bounds.cy, pt.x - bounds.cx),
          bodies,
          origBodies: structuredClone(bodies),
          joints,
          origJoints: structuredClone(joints),
          beforeSnap: structuredClone(this.scene),
          start: pt,
          cur: pt,
        };
        return;
      }
      for (const [cx, cy] of corners) {
        if (Math.hypot(cx - pt.x, cy - pt.y) <= 10) {
          this.drag = {
            kind: "transform-scale",
            cx: bounds.cx,
            cy: bounds.cy,
            startDist: Math.max(8, Math.hypot(pt.x - bounds.cx, pt.y - bounds.cy)),
            bodies,
            origBodies: structuredClone(bodies),
            joints,
            origJoints: structuredClone(joints),
            beforeSnap: structuredClone(this.scene),
            start: pt,
            cur: pt,
          };
          return;
        }
      }
    }

    // 0b. In Direct Edit (Shift+V), check body resize/endpoint handles first!
    if (this.directEdit && !this.running) {
      const ordered = [
        ...this.scene.bodies.filter((b) => this.selectedBodies.has(b.id)),
        ...this.scene.bodies.filter((b) => !this.selectedBodies.has(b.id)),
      ];
      for (const b of ordered) {
        for (const h of directHandlesForBody(b)) {
          if (Math.hypot(h.x - pt.x, h.y - pt.y) <= 11) {
            this.selectSingle("body", b.id);
            this.renderInspector();
            this.render();
            this.drag = {
              kind: "direct-handle",
              body: b,
              handle: h,
              beforeSnap: structuredClone(this.scene),
              start: pt,
              cur: pt,
            };
            return;
          }
        }
      }
    }

    // Check joints first (small pins on top of bodies) and allow dragging them when paused.
    for (let i = this.scene.joints.length - 1; i >= 0; i--) {
      const j = this.scene.joints[i];
      if (j.kind === "spring") {
        for (const end of ["pa", "pb"]) {
          const p = j[end];
          if (p && Math.hypot(p[0] - pt.x, p[1] - pt.y) <= 11) {
            if (shiftKey) {
              if (this.selectedJoints.has(j.id)) this.selectedJoints.delete(j.id);
              else this.selectedJoints.add(j.id);
            } else {
              this.selectSingle("joint", j.id);
            }
            this.renderInspector();
            this.render();
            if (!this.running && !shiftKey) {
              this.drag = {
                kind: "move-joint",
                joint: j,
                end,
                beforeSnap: structuredClone(this.scene),
                start: pt,
                cur: pt,
              };
            }
            return;
          }
        }
        // Also allow clicking anywhere along the spring coil segment to select it!
        if (j.pa && j.pb) {
          const dx = j.pb[0] - j.pa[0];
          const dy = j.pb[1] - j.pa[1];
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((pt.x - j.pa[0]) * dx + (pt.y - j.pa[1]) * dy) / len2));
          const dist = Math.hypot(pt.x - (j.pa[0] + dx * t), pt.y - (j.pa[1] + dy * t));
          if (dist <= 10) {
            if (shiftKey) {
              if (this.selectedJoints.has(j.id)) this.selectedJoints.delete(j.id);
              else this.selectedJoints.add(j.id);
            } else {
              this.selectSingle("joint", j.id);
            }
            this.renderInspector();
            this.render();
            return;
          }
        }
      } else if (j.anchor && Math.hypot(j.anchor[0] - pt.x, j.anchor[1] - pt.y) <= 12) {
        if (shiftKey) {
          if (this.selectedJoints.has(j.id)) this.selectedJoints.delete(j.id);
          else this.selectedJoints.add(j.id);
        } else {
          this.selectSingle("joint", j.id);
        }
        this.renderInspector();
        this.render();
        if (!this.running && !shiftKey) {
          // In normal V mode, dragging a pivot preserves connected link bars; in Shift+V Direct Edit (or Alt), repositions just the pivot!
          this.drag = {
            kind: "move-joint",
            joint: j,
            end: "anchor",
            preserveLinks: !this.directEdit && this.preserveConnections && !altKey,
            beforeSnap: structuredClone(this.scene),
            start: pt,
            cur: pt,
          };
        }
        return;
      }
    }

    const hits = bodiesAtPoint(this.scene.bodies, pt.x, pt.y, this.poses, 6);
    if (hits.length) {
      const b = hits[0];
      if (shiftKey) {
        if (this.selectedBodies.has(b.id)) this.selectedBodies.delete(b.id);
        else this.selectedBodies.add(b.id);
        this.renderInspector();
        this.render();
        return;
      }
      if (!this.selectedBodies.has(b.id)) {
        this.selectSingle("body", b.id);
      }
      this.renderInspector();
      this.render();
      if (this.running && this.core && b.type === "dynamic") {
        this.core.grabStart(b.id, pt.x, pt.y);
        this.drag = { kind: "grab", start: pt, cur: pt };
      } else if (!this.running) {
        // Connection-preserving drag (default in V mode): carry the connected mechanical assembly intact!
        // Hold Alt (or use Shift+V Direct Edit) to move just the selected body.
        const preserve = !this.directEdit && this.preserveConnections && !altKey;
        const asm = preserve
          ? connectedAssembly(this.scene, this.selectedBodies)
          : { bodyIds: new Set(this.selectedBodies), jointIds: new Set(this.selectedJoints) };
        const bodySet = asm.bodyIds;
        const movedBodies = this.scene.bodies
          .filter((x) => bodySet.has(x.id))
          .map((x) => ({ body: x, origX: x.x, origY: x.y }));
        const movedJoints = [];
        for (const j of this.scene.joints) {
          if (j.actuatorId) continue;
          if (j.kind === "spring") {
            if (j.a && bodySet.has(j.a) && Array.isArray(j.pa)) movedJoints.push({ joint: j, prop: "pa", orig: [...j.pa] });
            if (j.b && bodySet.has(j.b) && Array.isArray(j.pb)) movedJoints.push({ joint: j, prop: "pb", orig: [...j.pb] });
          } else if (Array.isArray(j.anchor)) {
            const aIn = !j.a || bodySet.has(j.a);
            const bIn = !j.b || bodySet.has(j.b);
            if ((aIn && bIn && (j.a || j.b)) || asm.jointIds.has(j.id)) {
              movedJoints.push({ joint: j, prop: "anchor", orig: [...j.anchor] });
            }
          }
        }
        this.drag = {
          kind: "move-body",
          movedBodies,
          movedJoints,
          beforeSnap: structuredClone(this.scene),
          start: pt,
          cur: pt,
        };
      }
      return;
    }

    // Dragging on empty space starts a box (marquee) selection!
    this.drag = {
      kind: "box-select",
      additive: shiftKey,
      start: pt,
      cur: pt,
    };
    this.renderDraft();
  }

  placePointJoint(kind, pt, preSnap = null) {
    const actSnap =
      kind === "hinge" && preSnap?.actuator
        ? preSnap
        : kind === "hinge"
          ? this.nearestActuator(pt.x, pt.y)
          : null;
    const ax = actSnap ? actSnap.x : pt.x;
    const ay = actSnap ? actSnap.y : pt.y;
    const hits = bodiesAtPoint(this.scene.bodies, ax, ay, this.poses, 8);
    if (!hits.length) {
      this.toast(`Click on a body${kind === "hinge" ? " (or an actuator shaft/horn tip over a body)" : ""} to place a ${kind}`);
      return;
    }
    const a = hits[0].id;
    const b = actSnap ? null : hits[1]?.id || null;
    if (kind === "weld" && !b) {
      this.toast("Weld needs two overlapping bodies");
      return;
    }
    const joint = {
      id: nextPhysicsId("j", this.scene.joints),
      kind,
      a: b ? a : null,
      b: b ? b : a,
      anchor: [ax, ay],
      ...(actSnap ? { actuatorId: actSnap.actuator.id, mount: actSnap.mount } : {}),
    };
    this.pushUndo();
    this.scene.joints.push(joint);
    this.selected = { kind: "joint", id: joint.id };
    this.persistChange();
    this.renderInspector();
    this.toast(
      actSnap
        ? `Hinge coupled to ${actSnap.actuator.label}${actSnap.mount === "horn-tip" ? " horn tip" : ""}`
        : preSnap?.label
          ? `${kind[0].toUpperCase() + kind.slice(1)} snapped to ${preSnap.label}`
          : `${kind[0].toUpperCase() + kind.slice(1)} placed`,
    );
  }

  finishShapeTool(d) {
    const { start, cur, tool } = d;
    const dx = cur.x - start.x;
    const dy = cur.y - start.y;
    const dist = Math.hypot(dx, dy);

    if (tool === "spring") {
      if (dist < 10) return;
      const hitsA = bodiesAtPoint(this.scene.bodies, start.x, start.y, this.poses, 8);
      const hitsB = bodiesAtPoint(this.scene.bodies, cur.x, cur.y, this.poses, 8);
      const a = hitsA[0]?.id || null;
      const b = hitsB.find((x) => x.id !== a)?.id || null;
      if (!a && !b) {
        this.toast("Connect at least one end of the spring to a body");
        return;
      }
      const joint = {
        id: nextPhysicsId("j", this.scene.joints),
        kind: "spring",
        a,
        b,
        pa: [start.x, start.y],
        pb: [cur.x, cur.y],
        rest: Math.round(dist),
        stiffness: 40,
        damping: 2.0,
      };
      this.pushUndo();
      this.scene.joints.push(joint);
      this.selected = { kind: "joint", id: joint.id };
      this.persistChange();
      this.renderInspector();
      return;
    }

    if (tool === "slider") {
      const hits = bodiesAtPoint(this.scene.bodies, start.x, start.y, this.poses, 8);
      if (!hits.length) {
        this.toast("Start dragging a slider rail on a body");
        return;
      }
      const axis = dist >= 8 ? [dx / dist, dy / dist] : [1, 0];
      const joint = {
        id: nextPhysicsId("j", this.scene.joints),
        kind: "slider",
        a: null,
        b: hits[0].id,
        anchor: [start.x, start.y],
        axis,
        limits: [-140, 140],
      };
      this.pushUndo();
      this.scene.joints.push(joint);
      this.selected = { kind: "joint", id: joint.id };
      this.persistChange();
      this.renderInspector();
      return;
    }

    if (dist < 8) return;
    const id = nextPhysicsId("b", this.scene.bodies);
    let body = null;
    if (tool === "box") {
      body = {
        id,
        label: "Box",
        type: "dynamic",
        shape: "box",
        x: (start.x + cur.x) / 2,
        y: (start.y + cur.y) / 2,
        angle: 0,
        w: Math.max(12, Math.abs(dx)),
        h: Math.max(12, Math.abs(dy)),
        color: "#4e8da6",
        ...MATERIAL_DEFAULTS,
      };
    } else if (tool === "circle") {
      body = {
        id,
        label: "Wheel",
        type: "dynamic",
        shape: "circle",
        x: start.x,
        y: start.y,
        angle: 0,
        r: Math.max(8, dist),
        color: "#c45b4a",
        ...MATERIAL_DEFAULTS,
        bounce: 0.6,
      };
    } else if (tool === "link") {
      body = {
        id,
        label: "Link",
        type: "dynamic",
        shape: "link",
        collisionLayer: "linkage",
        x: (start.x + cur.x) / 2,
        y: (start.y + cur.y) / 2,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        length: Math.max(18, dist),
        width: 14,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
      };
    } else if (tool === "gear") {
      const mod = 6;
      const teeth = Math.max(8, Math.min(36, Math.round((dist * 2) / mod)));
      body = {
        id,
        label: `Gear (${teeth}T)`,
        type: "dynamic",
        shape: "gear",
        x: start.x,
        y: start.y,
        angle: 0,
        teeth,
        module: mod,
        color: "#d97742",
        ...MATERIAL_DEFAULTS,
        friction: 0.15,
        bounce: 0.05,
      };
    } else if (tool === "ramp") {
      const mx = (start.x + cur.x) / 2;
      const my = (start.y + cur.y) / 2;
      body = {
        id,
        label: "Ramp",
        type: "static",
        shape: "chain",
        x: mx,
        y: my,
        angle: 0,
        pts: [
          [start.x - mx, start.y - my],
          [cur.x - mx, cur.y - my],
        ],
        thickness: 8,
        color: "#6c7b88",
        ...MATERIAL_DEFAULTS,
      };
    }

    if (body) {
      this.pushUndo();
      this.scene.bodies.push(body);
      const autoJoints = [];
      // When drawing a Link bar whose ends snap to joints, bores, centers, or actuators,
      // automatically create hinge pins so the linkage holds together immediately on Play!
      if (tool === "link") {
        for (const [endPt, snap] of [
          [start, d.startSnap],
          [cur, d.endSnap],
        ]) {
          if (!snap) continue;
          if (snap.actuator) {
            autoJoints.push({
              id: nextPhysicsId("j", [...this.scene.joints, ...autoJoints]),
              kind: "hinge",
              a: null,
              b: body.id,
              anchor: [snap.x, snap.y],
              actuatorId: snap.actuator.id,
              mount: snap.mount,
            });
          } else {
            // Find the target body at this snap point (prefer explicit snap.bodyId or existing joint's body).
            let targetId = snap.bodyId || null;
            if (!targetId && snap.jointId) {
              const existingJ = this.scene.joints.find((j) => j.id === snap.jointId);
              targetId = existingJ?.b || existingJ?.a || null;
            }
            if (!targetId) {
              const under = bodiesAtPoint(this.scene.bodies, endPt.x, endPt.y, this.poses, 10)
                .find((x) => x.id !== body.id);
              targetId = under?.id || null;
            }
            if (targetId && targetId !== body.id) {
              autoJoints.push({
                id: nextPhysicsId("j", [...this.scene.joints, ...autoJoints]),
                kind: "hinge",
                a: targetId,
                b: body.id,
                anchor: [snap.x, snap.y],
              });
            }
          }
        }
        if (autoJoints.length) {
          this.scene.joints.push(...autoJoints);
          this.toast(
            `Link created with ${autoJoints.length} auto-pinned hinge${autoJoints.length === 1 ? "" : "s"}`,
          );
        }
      }
      this.selected = { kind: "body", id: body.id };
      this.persistChange();
      this.renderInspector();
    }
  }

  // ---- SVG rendering -------------------------------------------------------------------------

  poseOf(body) {
    return (
      this.poses.get(body.id) || {
        x: body.x,
        y: body.y,
        a: ((body.angle || 0) * Math.PI) / 180,
      }
    );
  }

  renderDraft() {
    this.gDraft.replaceChildren();
    if (!this.drag && this.tool === "stamp" && this.stampPreview) {
      const { bodies, joints } = this.stampPreview;
      const gGhost = svgEl("g", { opacity: "0.55", "pointer-events": "none" });
      for (const b of bodies || []) {
        const g = svgEl("g", {
          transform: `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${(b.angle || 0).toFixed(1)})`,
        });
        const fill = b.color || "#4e8da6";
        const stroke = "#3b7a6c";
        if (b.shape === "circle") {
          g.append(svgEl("circle", { cx: 0, cy: 0, r: b.r || 16, fill, "fill-opacity": 0.35, stroke, "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
        } else if (b.shape === "box") {
          const w = b.w || 40;
          const h = b.h || 24;
          g.append(svgEl("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 3, fill, "fill-opacity": 0.35, stroke, "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
        } else if (b.shape === "link") {
          const len = b.length || 80;
          const w = b.width || 12;
          const r = w / 2;
          g.append(svgEl("rect", { x: -len / 2 - r, y: -r, width: len + w, height: w, rx: r, fill, "fill-opacity": 0.35, stroke, "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
        } else if (b.shape === "gear") {
          const geo = gearGeometry(b.teeth, b.module);
          const ptsStr = geo.outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          g.append(svgEl("polygon", { points: ptsStr, fill, "fill-opacity": 0.35, stroke, "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
        } else if (b.shape === "chain" && b.pts?.length >= 2) {
          const d = b.pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
          g.append(svgEl("path", { d, fill: "none", stroke, "stroke-width": b.thickness || 8, "stroke-dasharray": "5 3", "stroke-linecap": "round" }));
        } else if (b.shape === "polygon" && b.pts?.length >= 3) {
          const ptsStr = b.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          g.append(svgEl("polygon", { points: ptsStr, fill, "fill-opacity": 0.35, stroke, "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
        }
        gGhost.append(g);
      }
      for (const j of joints || []) {
        if (j.kind === "curve" && j.pts?.length >= 2) {
          const d = j.pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
          gGhost.append(svgEl("path", { d, fill: "none", stroke: "#3b7a6c", "stroke-width": 2.5, "stroke-dasharray": "5 3" }));
        } else if (j.anchor) {
          gGhost.append(svgEl("circle", { cx: j.anchor[0], cy: j.anchor[1], r: 4.5, fill: "#fff", stroke: "#3b7a6c", "stroke-width": 1.6 }));
        }
      }
      this.gDraft.append(gGhost);
      return;
    }
    if (!this.drag) return;
    if (this.drag.kind === "box-select") {
      const { start, cur } = this.drag;
      this.gDraft.append(
        svgEl("rect", {
          x: Math.min(start.x, cur.x),
          y: Math.min(start.y, cur.y),
          width: Math.abs(cur.x - start.x),
          height: Math.abs(cur.y - start.y),
          fill: "rgba(59, 122, 108, 0.14)",
          stroke: "#3b7a6c",
          "stroke-dasharray": "4 3",
          "stroke-width": 1.4,
        }),
      );
      return;
    }
    if (this.drag.kind === "lasso-select" && this.drag.pts?.length >= 2) {
      const d =
        this.drag.pts
          .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
          .join("") + "Z";
      this.gDraft.append(
        svgEl("path", {
          d,
          fill: "rgba(59, 122, 108, 0.14)",
          stroke: "#3b7a6c",
          "stroke-dasharray": "4 3",
          "stroke-width": 1.4,
          "stroke-linejoin": "round",
        }),
      );
      return;
    }
    if (!this.drag.tool) return;
    const { start, cur, tool } = this.drag;
    const stroke = "#3b7a6c";
    if (tool === "box") {
      this.gDraft.append(
        svgEl("rect", {
          x: Math.min(start.x, cur.x),
          y: Math.min(start.y, cur.y),
          width: Math.abs(cur.x - start.x),
          height: Math.abs(cur.y - start.y),
          fill: "rgba(59,122,108,0.16)",
          stroke,
          "stroke-dasharray": "4 3",
          "stroke-width": 1.5,
        }),
      );
    } else if (tool === "circle" || tool === "gear") {
      const r = Math.hypot(cur.x - start.x, cur.y - start.y);
      this.gDraft.append(
        svgEl("circle", {
          cx: start.x,
          cy: start.y,
          r,
          fill: "rgba(217,119,66,0.16)",
          stroke: tool === "gear" ? "#d97742" : stroke,
          "stroke-dasharray": "4 3",
          "stroke-width": 1.5,
        }),
      );
    } else {
      this.gDraft.append(
        svgEl("line", {
          x1: start.x,
          y1: start.y,
          x2: cur.x,
          y2: cur.y,
          stroke,
          "stroke-width": tool === "link" ? 12 : tool === "ramp" ? 8 : 2,
          "stroke-opacity": tool === "link" || tool === "ramp" ? 0.35 : 0.9,
          "stroke-linecap": "round",
          "stroke-dasharray": tool === "spring" || tool === "slider" ? "5 3" : "",
        }),
      );
    }
  }

  render() {
    // Floor
    this.gFloor.replaceChildren();
    if (this.scene.world?.floor) {
      const fy = this.scene.world.floorY ?? 560;
      this.gFloor.append(
        svgEl("line", {
          x1: -2000,
          y1: fy,
          x2: 4000,
          y2: fy,
          stroke: "#6c7b88",
          "stroke-width": 2,
          "stroke-dasharray": "8 6",
          "stroke-opacity": 0.6,
        }),
      );
    }

    // Coupler / pen trails
    this.gTrails.replaceChildren();
    for (const [id, pts] of this.trails) {
      if (pts.length < 2) continue;
      const b = this.scene.bodies.find((x) => x.id === id);
      const d = pts
        .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
        .join("");
      this.gTrails.append(
        svgEl("path", {
          d,
          fill: "none",
          stroke: b?.color || "#4e8da6",
          "stroke-width": 2,
          "stroke-opacity": 0.6,
          "stroke-linecap": "round",
        }),
      );
    }

    // Push live physics poses back into Poliplan so attached marks themselves move & rotate (zero ghost!)
    let hasLinked = false;
    const markPoses = {};
    for (const b of this.scene.bodies) {
      if (!b.sourceMarkId) continue;
      hasLinked = true;
      if (this.simTime > 0 && b.type === "dynamic") {
        const p = this.poseOf(b);
        const restRad = ((b.angle || 0) * Math.PI) / 180;
        markPoses[b.sourceMarkId] = {
          ox: b.x,
          oy: b.y,
          x: p.x,
          y: p.y,
          a: p.a - restRad,
        };
      }
    }
    const poseCount = Object.keys(markPoses).length;
    if (poseCount > 0) {
      this._hadPoliplanPoses = true;
      this.drawing?.setHostPoses(markPoses);
    } else if (this._hadPoliplanPoses) {
      this._hadPoliplanPoses = false;
      this.drawing?.setHostPoses({});
    }

    // Bodies (drawn in layer order A -> B -> C -> D -> pass-through so upper turning layers render on top)
    this.gBodies.replaceChildren();
    const byId = new Map();
    const orderedBodies = [...this.scene.bodies].sort((a, b) => layerZOrder(a) - layerZOrder(b));
    for (const b of orderedBodies) {
      byId.set(b.id, b);
      const pose = this.poseOf(b);
      const deg = (pose.a * 180) / Math.PI;
      const sel = this.selectedBodies.has(b.id);
      const linkedMark = Boolean(b.sourceMarkId);
      // Poliplan renders the actual moving mark via setHostPoses — only draw a subtle outline when selected!
      if (linkedMark && !sel) continue;
      const g = svgEl("g", {
        class: `phys-body${sel ? " selected" : ""}`,
        transform: `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${deg.toFixed(2)})`,
      });
      const fill = b.color || "#4e8da6";
      const fillOpacity = linkedMark
        ? 0.08
        : b.type === "sensor"
          ? 0.2
          : b.type === "static"
            ? 0.78
            : 0.86;
      const stroke = sel
        ? "#3b7a6c"
        : "rgba(20, 26, 28, 0.55)";
      const strokeW = sel ? 2 : 1.3;
      const dash = linkedMark ? "4 3" : null;
      const linkedAtRest = linkedMark;

      if (b.shape === "circle") {
        const r = b.r || 18;
        g.append(
          svgEl("circle", { cx: 0, cy: 0, r, fill, "fill-opacity": fillOpacity, stroke, "stroke-width": strokeW }),
          // Radius spoke so rotation is immediately visible (classic Algodoo touch!).
          svgEl("line", { x1: 0, y1: 0, x2: r - 2, y2: 0, stroke: "rgba(255,255,255,0.7)", "stroke-width": 1.6 }),
        );
      } else if (b.shape === "box") {
        const w = b.w || 40;
        const h = b.h || 24;
        g.append(
          svgEl("rect", {
            x: -w / 2,
            y: -h / 2,
            width: w,
            height: h,
            rx: 3,
            fill,
            "fill-opacity": fillOpacity,
            stroke,
            "stroke-width": strokeW,
          }),
        );
      } else if (b.shape === "link") {
        const len = b.length || 80;
        const w = b.width || 14;
        const r = w / 2;
        g.append(
          svgEl("rect", {
            x: -len / 2 - r,
            y: -r,
            width: len + w,
            height: w,
            rx: r,
            fill,
            "fill-opacity": fillOpacity,
            stroke,
            "stroke-width": strokeW,
          }),
          svgEl("circle", { cx: -len / 2, cy: 0, r: 2.8, fill: "#fff", stroke, "stroke-width": 1 }),
          svgEl("circle", { cx: len / 2, cy: 0, r: 2.8, fill: "#fff", stroke, "stroke-width": 1 }),
        );
      } else if (b.shape === "gear") {
        const geo = gearGeometry(b.teeth, b.module);
        const ptsStr = geo.outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        g.append(
          svgEl("polygon", {
            points: ptsStr,
            fill,
            "fill-opacity": fillOpacity,
            stroke,
            "stroke-width": strokeW,
            "stroke-linejoin": "round",
          }),
          svgEl("circle", {
            cx: 0,
            cy: 0,
            r: geo.pitchR,
            fill: "none",
            stroke: "rgba(255,255,255,0.35)",
            "stroke-dasharray": "3 3",
            "stroke-width": 1,
          }),
          svgEl("circle", { cx: 0, cy: 0, r: Math.max(4, geo.rootR * 0.25), fill: "#fff", stroke, "stroke-width": 1 }),
        );
      } else if (b.shape === "polygon" && b.pts?.length >= 3) {
        const ptsStr = b.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        g.append(
          svgEl("polygon", {
            points: ptsStr,
            fill,
            "fill-opacity": fillOpacity,
            stroke,
            "stroke-width": strokeW,
            ...(dash ? { "stroke-dasharray": dash } : {}),
            "stroke-linejoin": "round",
          }),
        );
      } else if (b.shape === "chain" && b.pts?.length >= 2) {
        const d = b.pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
        g.append(
          svgEl("path", {
            d,
            fill: "none",
            stroke: linkedAtRest ? stroke : fill,
            "stroke-width": linkedAtRest ? Math.max(3, (b.thickness || 8) * 0.45) : b.thickness || 8,
            "stroke-opacity": linkedAtRest ? 0.65 : 1,
            ...(dash ? { "stroke-dasharray": dash } : {}),
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          }),
        );
      }
      this.gBodies.append(g);
    }

    // Joints
    this.gJoints.replaceChildren();
    const restPose = (b) => ({ x: b.x, y: b.y, a: ((b.angle || 0) * Math.PI) / 180 });
    const livePointOn = (bodyId, worldRestPt) => {
      if (!bodyId || !byId.has(bodyId)) return worldRestPt;
      const b = byId.get(bodyId);
      const rp = restPose(b);
      const dx = worldRestPt[0] - rp.x;
      const dy = worldRestPt[1] - rp.y;
      const cs = Math.cos(-rp.a);
      const sn = Math.sin(-rp.a);
      const lx = dx * cs - dy * sn;
      const ly = dx * sn + dy * cs;
      return bodyLocalToWorld(this.poseOf(b), lx, ly);
    };

    for (const j of this.scene.joints) {
      const sel = this.selectedJoints.has(j.id);
      const g = svgEl("g", { class: "phys-joint" });
      if (j.kind === "spring") {
        const p1 = livePointOn(j.a, j.pa);
        const p2 = livePointOn(j.b, j.pb);
        const col = j.color || "#3b7a6c";
        g.append(
          svgEl("path", {
            d: springPath(p1, p2),
            fill: "none",
            stroke: sel ? col : j.color || "#3a454a",
            "stroke-width": sel ? 2.5 : 1.8,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          }),
          svgEl("circle", { cx: p1[0], cy: p1[1], r: 3, fill: col }),
          svgEl("circle", { cx: p2[0], cy: p2[1], r: 3, fill: col }),
        );
      } else if (j.kind === "slider") {
        const p = livePointOn(j.a, j.anchor);
        const ax = j.axis || [1, 0];
        const minL = j.limits?.[0] ?? -80;
        const maxL = j.limits?.[1] ?? 80;
        g.append(
          svgEl("line", {
            x1: p[0] + ax[0] * minL,
            y1: p[1] + ax[1] * minL,
            x2: p[0] + ax[0] * maxL,
            y2: p[1] + ax[1] * maxL,
            stroke: sel ? "#3b7a6c" : "#6c7b88",
            "stroke-width": 3,
            "stroke-dasharray": "5 4",
            "stroke-linecap": "round",
          }),
        );
      } else if (j.kind === "curve" && Array.isArray(j.pts) && j.pts.length >= 2) {
        const d =
          j.pts
            .map((pt, idx) => `${idx ? "L" : "M"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)
            .join("") + (j.closed ? "Z" : "");
        g.append(
          svgEl("path", {
            d,
            fill: "none",
            stroke: sel ? "#00c896" : "#7c6ee6",
            "stroke-width": sel ? 3.5 : 2.6,
            "stroke-dasharray": "6 4",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          }),
          svgEl("circle", { cx: j.pts[0][0], cy: j.pts[0][1], r: 3.5, fill: "#7c6ee6" }),
          svgEl("circle", { cx: j.pts.at(-1)[0], cy: j.pts.at(-1)[1], r: 3.5, fill: "#7c6ee6" }),
        );
      } else if (j.kind === "weld") {
        const p = livePointOn(j.a || j.b, j.anchor);
        g.append(
          svgEl("path", {
            d: `M${p[0] - 4} ${p[1] - 4}L${p[0] + 4} ${p[1] + 4}M${p[0] + 4} ${p[1] - 4}L${p[0] - 4} ${p[1] + 4}`,
            stroke: sel ? "#3b7a6c" : "#222",
            "stroke-width": 2,
          }),
        );
      } else {
        // Hinge (or actuator-coupled motor hinge)
        const p = livePointOn(j.a || j.b, j.anchor);
        const coupled = Boolean(j.actuatorId);
        const motorized = Boolean(j.motor && j.motor.on !== false);
        g.append(
          svgEl("circle", {
            cx: p[0],
            cy: p[1],
            r: coupled ? 7.5 : 5,
            fill: coupled ? "#e6b84c" : motorized ? "#d97742" : "#fff",
            stroke: sel ? "#1b4d42" : "#263238",
            "stroke-width": sel ? 2.4 : 1.5,
          }),
          svgEl("circle", { cx: p[0], cy: p[1], r: 2, fill: "#263238" }),
        );
      }
      this.gJoints.append(g);
    }

    // Direct-Edit (Shift+V) construction handles OR Poliplan-style Transform Box (V: scale corners + top rotate handle)
    this.gHandles.replaceChildren();
    if (this.directEdit && !this.running && this.drawing?.active) {
      const targetBodies = this.selectedBodies.size
        ? this.scene.bodies.filter((b) => this.selectedBodies.has(b.id))
        : this.scene.bodies;
      for (const b of targetBodies) {
        const isSel = this.selectedBodies.has(b.id);
        for (const h of directHandlesForBody(b)) {
          const g = svgEl("g", { class: "phys-handle" });
          if (h.kind === "boxCorner" || h.kind === "vertex") {
            g.append(
              svgEl("rect", {
                x: h.x - 4.5,
                y: h.y - 4.5,
                width: 9,
                height: 9,
                rx: 1.5,
                fill: "#fff",
                stroke: "#3b7a6c",
                "stroke-width": isSel ? 2 : 1.4,
              }),
            );
          } else {
            g.append(
              svgEl("circle", {
                cx: h.x,
                cy: h.y,
                r: isSel ? 5.5 : 4.5,
                fill: "#fff",
                stroke: "#3b7a6c",
                "stroke-width": isSel ? 2 : 1.5,
              }),
            );
          }
          if (isSel && h.label && (h.kind === "gearRadius" || h.kind === "circleRadius")) {
            const lbl = svgEl("text", {
              x: h.x + 9,
              y: h.y + 3,
              "font-size": 10,
              "font-family": "ui-monospace, monospace",
              fill: "#3b7a6c",
            });
            lbl.textContent = h.label;
            g.append(lbl);
          }
          this.gHandles.append(g);
        }
      }
    } else {
      const xform = this.transformSelectionInfo();
      if (xform) {
        const { box, corners, rotHandle, bounds } = xform;
        // Poliplan-style dashed outer selection frame + subtle solid inner frame
        this.gHandles.append(
          svgEl("rect", {
            x: box.x0 - 3,
            y: box.y0 - 3,
            width: box.x1 - box.x0 + 6,
            height: box.y1 - box.y0 + 6,
            fill: "none",
            stroke: "rgba(255, 255, 255, 0.55)",
            "stroke-width": 1.2,
            "stroke-dasharray": "4 3",
            "pointer-events": "none",
          }),
          svgEl("rect", {
            x: box.x0,
            y: box.y0,
            width: box.x1 - box.x0,
            height: box.y1 - box.y0,
            fill: "none",
            stroke: "rgba(255, 255, 255, 0.35)",
            "stroke-width": 1,
            "pointer-events": "none",
          }),
          svgEl("line", {
            x1: bounds.cx,
            y1: box.y0,
            x2: rotHandle[0],
            y2: rotHandle[1],
            stroke: "rgba(255, 255, 255, 0.55)",
            "stroke-width": 1.2,
            "pointer-events": "none",
          }),
        );
        // 4 corner scale handles (matching Poliplan's dark-fill white-stroke squares)
        for (const [cx, cy] of corners) {
          const g = svgEl("g", { class: "phys-handle", style: "cursor:nwse-resize" });
          g.append(
            svgEl("rect", {
              x: cx - 4.5,
              y: cy - 4.5,
              width: 9,
              height: 9,
              fill: "#1f2224",
              stroke: "#e8ecea",
              "stroke-width": 1.4,
            }),
          );
          this.gHandles.append(g);
        }
        // Top rotation handle
        const gRot = svgEl("g", { class: "phys-handle", style: "cursor:grab" });
        gRot.append(
          svgEl("circle", {
            cx: rotHandle[0],
            cy: rotHandle[1],
            r: 5,
            fill: "#1f2224",
            stroke: "#e8ecea",
            "stroke-width": 1.5,
          }),
        );
        this.gHandles.append(gRot);
      }
    }

        // Actuator shaft snap hubs (plus servo horn-tip mounting hole!)
    this.gActuators.replaceChildren();
    if (this.active) {
      for (const a of this.actuators()) {
        const g = svgEl("g", { class: "phys-actuator-hub" });
        g.append(
          svgEl("circle", {
            cx: a.x,
            cy: a.y,
            r: 12,
            fill: "rgba(230, 184, 76, 0.16)",
            stroke: "#d99b26",
            "stroke-width": 1.4,
            "stroke-dasharray": "3 2",
          }),
          svgEl("circle", { cx: a.x, cy: a.y, r: 2.5, fill: "#d99b26" }),
        );
        if (a.hornTip) {
          g.append(
            svgEl("circle", {
              cx: a.hornTip.x,
              cy: a.hornTip.y,
              r: 9,
              fill: "rgba(59, 122, 108, 0.22)",
              stroke: "#3b7a6c",
              "stroke-width": 1.6,
              "stroke-dasharray": "2.5 2",
            }),
            svgEl("circle", { cx: a.hornTip.x, cy: a.hornTip.y, r: 2.8, fill: "#3b7a6c" }),
          );
          const tipLbl = svgEl("text", {
            x: a.hornTip.x,
            y: a.hornTip.y - 12,
            "text-anchor": "middle",
            "font-size": 9.5,
            "font-family": "system-ui, sans-serif",
            fill: "#3b7a6c",
          });
          tipLbl.textContent = `${a.id} tip`;
          g.append(tipLbl);
        } else {
          const lbl = svgEl("text", {
            x: a.x,
            y: a.y - 15,
            "text-anchor": "middle",
            "font-size": 10,
            "font-family": "system-ui, sans-serif",
            fill: "#b87b14",
          });
          lbl.textContent = a.id;
          g.append(lbl);
        }
        this.gActuators.append(g);
      }
    }

    // Debug collider overlay
    this.gDebug.replaceChildren();
    if (this.debug) {
      for (const b of this.scene.bodies) {
        const pose = this.poseOf(b);
        const deg = (pose.a * 180) / Math.PI;
        const g = svgEl("g", {
          transform: `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${deg.toFixed(2)})`,
        });
        for (const s of collidersForBody(b)) {
          if (s.kind === "ball") {
            g.append(svgEl("circle", { cx: s.at[0], cy: s.at[1], r: s.r, fill: "none", stroke: "#00c896", "stroke-width": 1 }));
          } else if (s.kind === "cuboid") {
            g.append(svgEl("rect", { x: -s.hx, y: -s.hy, width: s.hx * 2, height: s.hy * 2, fill: "none", stroke: "#00c896", "stroke-width": 1 }));
          } else if (s.kind === "hull") {
            g.append(svgEl("polygon", { points: s.pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#00c896", "stroke-width": 1 }));
          } else if (s.kind === "capsule") {
            g.append(svgEl("line", { x1: s.a[0], y1: s.a[1], x2: s.b[0], y2: s.b[1], stroke: "#00c896", "stroke-width": s.r * 2, "stroke-opacity": 0.25, "stroke-linecap": "round" }));
          }
        }
        this.gDebug.append(g);
      }
    }

    // Contact blips
    this.gBlips.replaceChildren();
    const now = performance.now();
    this.blips = this.blips.filter((b) => now - b.at < 450);
    for (const bl of this.blips) {
      const age = (now - bl.at) / 450;
      this.gBlips.append(
        svgEl("circle", {
          cx: bl.x,
          cy: bl.y,
          r: 4 + age * 14 * (0.5 + bl.k),
          fill: "none",
          stroke: "#e6b84c",
          "stroke-width": 1.6,
          "stroke-opacity": (1 - age).toFixed(2),
        }),
      );
    }
  }
}

function springPath(p1, p2, coils = 8, amp = 6) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const pts = [`M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`];
  const lead = Math.min(12, len * 0.15);
  const span = Math.max(0, len - lead * 2);
  pts.push(`L${(p1[0] + ux * lead).toFixed(1)} ${(p1[1] + uy * lead).toFixed(1)}`);
  for (let i = 0; i < coils; i++) {
    const t = lead + ((i + 0.5) / coils) * span;
    const s = i % 2 === 0 ? amp : -amp;
    pts.push(`L${(p1[0] + ux * t + nx * s).toFixed(1)} ${(p1[1] + uy * t + ny * s).toFixed(1)}`);
  }
  pts.push(`L${(p2[0] - ux * lead).toFixed(1)} ${(p2[1] - uy * lead).toFixed(1)}`);
  pts.push(`L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`);
  return pts.join("");
}
