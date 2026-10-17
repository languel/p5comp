# Drawing on the circuit (Poliplan)

The drawing editor is **Poliplan**, the lean embeddable build of the Artist Model Studio's editor, embedded (plan and protocol in `~/dev/artistmodelstudio/docs/EMBEDDING.md`). It runs in an iframe from `public/vendor/ams-editor/` and is wired in by `sim/DrawingBoard.js`.

## Use

- **✎** in the circuit's canvas tools switches a transparent layer on over the circuit. The pointer then draws (pen, brushes, shapes, colors, sculpting: the editor's tool strip appears across the top of the canvas, ; the studio's presentation menu, zoom and fit are left out because the circuit has its own view) instead of moving parts. Switched off, the drawing stays visible and the circuit is edited as before. The drawing and the circuit share one camera: pan or zoom either and the other follows.
- **The Draw tab** (pencil, next to Circuit and p5) shows the same drawing over the whole work area on a plain ground, with its own camera.
- **Right-click** in the drawing for **Save selection as PNG / SVG to assets**: the selected marks (the whole drawing when nothing is selected) become a project asset, `drawing.png`, `drawing-2.png`, … the sketch loads with `loadImage('drawing.png')`. A short message confirms and goes away by itself.
- The drawing is saved in the project (`workbench.drawing`, the editor's JSON) and in project files; opening a project replaces it.
- Right-click menus, Ctrl+right-click (colors), Shift+Space (radial tool menu) and the other shortcuts of the editor work while drawing; Cmd+K is its command palette.

- **Notes:** Opt+right-click a text note (or use the Note tool) for its font, size and style. Notes start in the sans font; the hand fonts are webfonts that p5comp does not load, so the system's script font would stand in.

## Install the editor

Two builds: Poliplan, the lean one (default, 780 KB: the canvas, tools, brushes, color pickers, exports, and the Boards, Layers (Outliner) and Properties panels, opened on demand with Cmd+B, the palette or the menu; no scenes, assets, recording, lessons, docs, assistant or code editor) and the chunky one with every studio panel: `AMS_FULL=1 npm run vendor:poliplan`.

The built editor is not committed here (13 MB). With the Artist Model Studio checked out at `~/dev/artistmodelstudio` (the studio's `main`; `AMS_DIR` to change):

```sh
npm run vendor:poliplan
```

It builds the editor there (`npm run build:embed`) and copies it to `public/vendor/ams-editor/` with a `VERSION` file. Without it the Draw button says so.

## Known gaps

- The projection windows mirror the circuit and p5 output, not the drawing.
- Marks live on one large transparent board (2400 × 1600 at the origin); marks outside it are kept but are not in the PNG.
- Undo in the editor and undo in the circuit are separate; the editor's follows its own history.
- Deployed builds (`PAGES_BASE`) need the vendored folder committed or copied in the build step.

- **Alt+Z** on the circuit switches the drawing layer and its toolbar on and off (in the Draw tab it is the editor's own zen). **Theme:** the editor follows p5comp's theme (`data-theme` on `<html>`) automatically.
