# Handoff: integrating Poliplan, the drawing editor, into p5comp

State on 17 Oct 2026. The integration was merged into `main` (`e9fd570`) from the branch `ams-editor-integration`, which was then retired. Poliplan itself is built from the studio repo's `main`.

## What it is

**Poliplan** is the lean embeddable build of the Artist Model Studio drawing editor (780 KB; an iframe plus a small message protocol, `ams-editor-v1`, and a one-file client). This branch embeds it in p5comp.

- **✎** (a button in the circuit's canvas tools): a transparent layer over the circuit canvas. The pointer draws instead of moving parts; only the editor's one toolbar shows, across the top. Switched off, the drawing stays visible and the circuit is edited as before. Pan and zoom are shared: move either and the other follows. The editor has no zoom, fit or frame of its own here (the circuit owns the view), and no presentation menu.
- **The Draw tab** (✎ in the top bar, next to Circuit and p5): the same drawing over the whole work area, with its own camera and the editor's own interface back (one toolbar with its menu, optional zoom controls toggled in the menu, Layers and Properties in the left sidebar, zen with Alt+Z). This is the editor's standalone mode; back on the circuit it is a bare layer again.
- **Right-click in the drawing → Save selection as PNG / SVG to assets** (the whole drawing when nothing is selected): adds `drawing.png`, `drawing-2.png`, … as project assets for `loadImage`. A short message confirms and fades. No separate toolbar.
- **Notes:** Opt+right-click a text note (or use the Note tool) for Font, Size and Style. Notes start in sans (the hand fonts are webfonts p5comp does not load, so the system's script font would stand in).
- The drawing is saved in the project (`workbench.drawing`, the editor's JSON) and restored when a project opens.

## Files (the whole integration)

- `sim/DrawingBoard.js` (new): the layer, camera sync, persistence, the right-click actions, the mode and UI requests (`applyUI`). Read its header comment first.
- `sim/Workbench.js`: imports it; creates it after the split divider (with `assetNames` for unique asset names); the Draw tab button; `mainView()` hides circuit and p5 for the Draw tab and calls `drawing.setView`; `snapshot()` and `restore()` carry `drawing`.
- `sim/workbench.css`: `.draw-layer`, `.draw-status`, `.draw-layer.tab` (appended at the end).
- `package.json`: `npm run vendor:poliplan`. `.gitignore`: `public/vendor/ams-editor/`. `docs/drawing.md`: user-facing notes.

## To try it

The lean editor build is about 784 KB and is not committed. It is generated into
the ignored `public/vendor/ams-editor/` folder:

```sh
npm run vendor:poliplan              # the lean editor (canvas, tools, the panels an editor needs)
AMS_FULL=1 npm run vendor:poliplan   # the chunky build with every studio panel
```

Both build `~/dev/artistmodelstudio` (the studio's `main`; `AMS_DIR` to change) and copy the result into `public/vendor/ams-editor/` with a `VERSION` file.

To test from the main checkout after vendoring:

```sh
cd ~/dev/arduino/p5comp
npx vite --host 127.0.0.1 --port 5199
# open http://127.0.0.1:5199/sim/
```

The temporary integration worktrees and branches have been retired. Keep editor
changes in the studio repo and re-run `npm run vendor:poliplan` here.

## Also

- Alt+Z on the circuit switches the drawing layer and its toolbar on and off. The editor follows p5comp's theme (`data-theme`) through the client's `theme: 'host'` default.
- The editor's menu (≡, first in its toolbar) holds the view items and, in the Draw tab, a toggle for the zoom controls.

## Checklist (all verified with synthetic events in the browser)

1. Click ✎ in the canvas tools: the layer lies exactly over the stage; only the tool strip shows, across the top; drawing works; circuit parts are not moved meanwhile.
2. Ctrl+scroll on the circuit: the drawing zooms with it (and the reverse).
3. Reload: the drawing is back (it is in the project JSON in `localStorage`).
4. Right-click → Save selection as PNG to assets: `drawing.png` appears in the project assets; `loadImage('drawing.png')` in a sketch. A second one is `drawing-2.png`.
5. Draw tab: the drawing over the whole area with menu strip, zoom and panels; Alt+Z hides and shows them. Back to Circuit: the bare layer returns over the stage.
6. Opt+right-click a note: Font, Size, Style; new notes are sans.

The p5comp test suite and production build pass after integration. Not verified: a real mouse or pen (only dispatched events), touch, or saving to and opening a project file with a drawing.

## Known gaps

- Projection windows mirror the circuit and p5, not the drawing.
- Marks live on one transparent board (2400 × 1600 at the origin); marks outside it are kept but are not in a whole-drawing PNG.
- The editor's undo and the circuit's undo are separate.
- A deployed build needs the vendored folder committed or copied in the build step.
- In Vite's dev server a script in `/public` cannot be `import()`ed, so `DrawingBoard` reads the client as text and imports it from a blob; a built site could import it directly.
- The lean editor is 780 KB (one 700 KB script); about 70 KB more could go (p5 export code, studio-only tools).

## Naming

Poliplan is the product name; the code keeps its older names (`public/vendor/ams-editor/`, the `ams-editor.js` client, `ams-editor-v1`, `AMS_DIR`, `AMS_FULL`). Whether Poliplan becomes a repository of its own is undecided: until then it is built from the studio repo (`npm run vendor:poliplan` here; `npm run build:poliplan` there). The chunky build (`AMS_FULL=1`) is the studio's full panels in an iframe, not Poliplan.

## Where the other half lives

`~/dev/artistmodelstudio`, branch `main` (Poliplan is a build target there): `docs/EMBEDDING.md` (plan, protocol, what was built, lean and chunky builds), `src/embed/` (the bridge and the client `ams-editor.js`), `embed.html`, `vite.embed.config.js`, `scripts/sync-embed.sh`, `embed-demo.html` (a bare host page to try every call). If the editor needs a change, change it there and run `npm run vendor:poliplan` again; tell the agent working there what the protocol lacked.
