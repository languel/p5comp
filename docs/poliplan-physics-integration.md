# Poliplan + Physics Integration Log (Merge Plan for `artistmodelstudio`)

This document tracks all physics, mechanical-engineering, and Poliplan-bridge features prototyped locally inside `p5comp`, so once validated here they can be cleanly merged upstream into `~/dev/artistmodelstudio` (`src/physics/` and `src/embed/`).

## Goal

Unify **Draw (Poliplan)** and **Physics** into a single creative & mechanical layer with **no conversion step**:
- Drawings *are* the objects — every Poliplan mark (point, line, smooth curve, plane, brushed shape) simply carries optional physics properties (`play.phys`: body type, material, `[A][B][C][D]` collision mask) and constraints (`play.hinge`, `play.weld`, `play.spring`, `play.slider`, `play.curve`) directly on the mark.
- Mechanical primitives (`Gear`, `Link`, `Box`, `Circle`, `Ramp`) and constraints (`Hinge`, `Weld`, `Spring`, `Slider`, `Curve Track`) act as **Physics Brushes** inside Poliplan's existing customizable toolbar (**`☰ → Toolbar → ☑ Physics`**, alongside `Selection`, `Drawing`, `Score`, and `Canvas`), reusing Poliplan's single unified Selection, Lasso, Eraser, Undo, and Layers system.
- Host apps like `p5comp` stream live actuator states (servo horn-tip pins, continuous FS90R servos, DC/gear motors, steppers) into Poliplan over the `ams-editor-v1` bridge.

---

## Implemented Locally in `p5comp` (Ready to Port Upstream)

### 1. Deterministic Rapier2D Extensions (`sim/physics/core.js`, `sim/physics/model.js`)
- **Non-exclusive Collision Matrix (`[A][B][C][D]` bitmask)**:
  - Field: `collisionMask` (4-bit integer: `A = 1`, `B = 2`, `C = 4`, `D = 8`; `0` = pass-through linkage).
  - Rapier2D mapping: `cd.setCollisionGroups((mask << 16) | mask)`.
  - Visual z-order follows highest active layer (`A` bottom → `D` → pass-through top).
  - *Upstream target*: `artistmodelstudio/src/physics/model.js` (`play.phys.collisionMask`), `core.js`, `properties.js` (4 toggle pills).
- **Prismatic Slider Joint (`kind: "slider"`)**:
  - Data: `{ id, kind: "slider", a, b, anchor: [x, y], axis: [ax, ay], limits?: [minPx, maxPx] }`.
  - Uses `R.JointData.prismatic(a1, a2, axisLocal)` with optional linear limits.
  - *Upstream target*: `play.slider` mark kind in `artistmodelstudio/src/physics/model.js` & `core.js`.
- **General Curve Track Constraint (`kind: "curve"`)**:
  - Data: `{ id, kind: "curve", b: bodyId, anchor: [x, y], pts: [[x, y], ...], closed?: boolean, friction?: number }`.
  - Solved every 60 Hz step via `projectPointToPolyline(ax, ay, pts, closed)`: cancels normal velocity, applies Baumgarte position correction back onto `Q(s)`, leaves tangential velocity free with optional `friction` and open-curve end-stops.
  - *Upstream target*: `play.curve` property on any open/closed Poliplan line mark in `artistmodelstudio/src/physics/model.js` & `core.js`.
- **Meshing Spur Gear Compound Colliders (`shape: "gear"`)**:
  - Parameterized by `teeth` and `module` (matching `~/dev/mechanisms`), emitting a root disk + convex-hull involute teeth colliders.
- **Auto-Pinned Link Bars (`shape: "link"`)**:
  - Capsule bar with exact end bores at `±length/2`, defaulting to pass-through (`collisionMask: 0`).
  - When drawn with snapped endpoints, automatically creates hinge joints connecting to the snapped bodies or actuators.
- **Kinematic Actuator Pins (`mount: "horn-tip"` and `mount: "shaft"`)**:
  - Servo horn-tip joints create a `RigidBodyDesc.kinematicPositionBased()` pin positioned at the exact outermost horn hole (`SERVO_HORN_TIP_RADIUS = 46.051`) and moved via `setNextKinematicTranslation` from live `state.angle` (0° phase drift).
  - Continuous-rotation servos (`FS90R`, 1500 µs stop, 1000–2000 µs speed/dir) and DC/gear/stepper motors couple via `updateActuators(partStates)`.

### 2. Interaction Patterns Validated in `sim/physics/PhysicsLayer.js`
- **Geometric Magnetic Snapping** (`collectSnapPoints`, `snapPhysicsPoint`):
  - Snaps to servo horn tips, actuator shafts, gear/circle/box centers, link end bores, and existing joint pins (`Alt` bypasses; magnet toggle in toolbar).
- **Multi-Selection**:
  - Box marquee select (drag empty space), freehand Lasso select (`L`), `Shift+click` toggle, `⌘/Ctrl+A` select all, group move (carrying internal & grounded joints), group delete, and bulk inspector.
- **Undo / Redo & Pause / Rewind Sync**:
  - 60-step undo/redo stack (`⌘/Ctrl+Z`, `⌘/Ctrl+Shift+Z`).
  - `Cmd+.` / Stop pauses physics in place without snapping poses; Rewind (`↺`) rewinds both physics and Arduino actuators back to `t = 0`.

### 3. Local Poliplan ↔ Physics Live Bridge (`sim/physics/poliplanBridge.js`, `sim/DrawingBoard.js`)
- Added four physics actions directly into Poliplan's right-click context menu (`ACTIONS` in `DrawingBoard.js`):
  - **`Physics: attach dynamic body`** (`phys-dynamic`)
  - **`Physics: attach static ground / ramp`** (`phys-static`)
  - **`Physics: attach curve track constraint`** (`phys-curve`)
  - **`Physics: remove physics`** (`phys-detach`)
- Linked bodies and curve constraints carry `sourceMarkId`; `DrawingBoard` notifies `PhysicsLayer.syncFromPoliplan(doc)` on document edits so reshaping, moving, or erasing a Poliplan mark live-updates the physics world.
- **Unified Selection → Physics Inspector**: Selecting any physics-attached Poliplan mark with Poliplan's own Select tool (`editor.on("selection")`) automatically opens the Physics Properties inspector (`[A][B][C][D]` layers, body type, material, density, friction, bounce, pen trail) without switching tools.
- **Non-obstructive linked rendering**: Linked Poliplan marks render as a subtle dashed collider halo at rest (`t = 0`) or when static so the original Poliplan artwork remains the visual object, and animate cleanly in the mark's own color when dynamic bodies move (`t > 0`).
- **Global Top-Bar Transport**: Moved Rewind (`↺`) and the `0.00 s` simulation timer next to the top-bar Play (`#run`) button so Arduino, p5, and Physics share one global timeline & rewind control.

---

## Next Steps for Upstream Merge into `~/dev/artistmodelstudio`

1. **Add `Physics` as Physics Brushes inside Poliplan's existing `Toolbar` menu** (`☰ → Toolbar → ☑ Physics`), reusing Poliplan's ONE unified Selection / Lasso / Eraser / Undo / Layers system (no duplicate select tools):
   - **Physics Object Brushes** (submenu alongside `Points` / `Lines` / `Planes` / `Brushes`): Box, Circle, Link (auto-pinned on snap), Spur Gear, Ramp, and Mechanism stamps (`crank-slider`, `four-bar`, `scotch-yoke`, `gear-pair`, `rack-pinion`, `cam-follower`, `ratchet-pawl`).
   - **Physics Constraint Brushes** (submenu): Hinge, Weld, Spring, Slider, Curve Track.
2. **Port `collisionMask` (`[A][B][C][D]` toggles), `slider`, `curve`, `gear`, `link`, and `snapPhysicsPoint`** into `artistmodelstudio/src/physics/{model,core,properties,toolbar}.js`.
3. **Extend `ams-editor-v1` bridge** (`artistmodelstudio/src/embed/bridge.js` & `client.js`) with two messages:
   - Host → Editor: `physics-actuators` (`{ actuators: [{ id, x, y, hornTip, angle, rpm, powered }] }`)
   - Host → Editor: `physics-transport` (`{ action: "play" | "pause" | "rewind" }`)
4. **Re-vendor** into `p5comp` via `npm run vendor:poliplan` and retire the local overlay in `PhysicsLayer.js` once Poliplan natively owns both drawing and physics brushes.
