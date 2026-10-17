# Handoff: drawing on the circuit (Artist Model Studio editor)

State on 17 Oct 2026. Branch `ams-editor-integration`, five commits on top of p5comp `main` at `3af325d` (history is linear, so a fast-forward merge works), also checked out as the git worktree `~/dev/arduino/p5comp-ams`. Pushed to `origin/ams-editor-integration`. The editor itself lives in `~/dev/artistmodelstudio`, branch `embed-editor` (pushed too).

## What it is

The Artist Model Studio drawing editor, embedded as an iframe through a small message protocol (`ams-editor-v1`).

- **✎** (a button in the circuit's canvas tools): a transparent layer over the circuit canvas. The pointer draws instead of moving parts; only the editor's tool strip shows, across the top. Switched off, the drawing stays visible and the circuit is edited as before. Pan and zoom are shared: move either and the other follows. The editor has no zoom, fit or frame of its own here (the circuit owns the view), and no presentation menu.
- **The Draw tab** (✎ in the top bar, next to Circuit and p5): the same drawing over the whole work area, with its own camera and the editor's own interface back (menu strip, zoom, panels, zen with Alt+Z). This is the editor's standalone mode; back on the circuit it is a bare layer again.
- **Right-click in the drawing → Save selection as PNG / SVG to assets** (the whole drawing when nothing is selected): adds `drawing.png`, `drawing-2.png`, … as project assets for `loadImage`. A short message confirms and fades. No separate toolbar.
- **Notes:** Opt+right-click a text note (or use the Note tool) for Font, Size and Style. Notes start in sans (the hand fonts are webfonts p5comp does not load, so the system's script font would stand in).
- The drawing is saved in the project (`workbench.drawing`, the editor's JSON) and restored when a project opens.

## Files (the whole integration)

- `sim/DrawingBoard.js` (new): the layer, camera sync, persistence, the right-click actions, the mode and UI requests (`applyUI`). Read its header comment first.
- `sim/Workbench.js`: imports it; creates it after the split divider (with `assetNames` for unique asset names); the Draw tab button; `mainView()` hides circuit and p5 for the Draw tab and calls `drawing.setView`; `snapshot()` and `restore()` carry `drawing`.
- `sim/workbench.css`: `.draw-layer`, `.draw-status`, `.draw-layer.tab` (appended at the end).
- `package.json`: `npm run vendor:ams`. `.gitignore`: `public/vendor/ams-editor/`. `docs/drawing.md`: user-facing notes.

## To try it

The editor build is not committed (13 MB). It already sits, ignored, in the worktree's `public/vendor/ams-editor/`. To get it elsewhere:

```sh
npm run vendor:ams              # the lean editor (canvas, tools, the panels an editor needs)
AMS_FULL=1 npm run vendor:ams   # the chunky build with every studio panel
```

Both build `~/dev/artistmodelstudio` (`AMS_DIR` to change; branch `embed-editor` must be checked out there) and copy the result into `public/vendor/ams-editor/` with a `VERSION` file.

Easiest test, in the worktree (it has `node_modules` copied from the main checkout; run `npm install` there if dependencies changed):

```sh
cd ~/dev/arduino/p5comp-ams && npx vite --host 127.0.0.1 --port 5199
# open http://127.0.0.1:5199/sim/
```

To take it into the main checkout: `git merge ams-editor-integration` (fast-forward) or `git cherry-pick 3ac9be3..554389a`, then `npm run vendor:ams`.

## Checklist (all verified with synthetic events in the browser)

1. Click ✎ in the canvas tools: the layer lies exactly over the stage; only the tool strip shows, across the top; drawing works; circuit parts are not moved meanwhile.
2. Ctrl+scroll on the circuit: the drawing zooms with it (and the reverse).
3. Reload: the drawing is back (it is in the project JSON in `localStorage`).
4. Right-click → Save selection as PNG to assets: `drawing.png` appears in the project assets; `loadImage('drawing.png')` in a sketch. A second one is `drawing-2.png`.
5. Draw tab: the drawing over the whole area with menu strip, zoom and panels; Alt+Z hides and shows them. Back to Circuit: the bare layer returns over the stage.
6. Opt+right-click a note: Font, Size, Style; new notes are sans.

Not verified: a real mouse or pen (only dispatched events), touch, saving to and opening a project file with a drawing, the p5comp test suite (`npm test`).

## Known gaps

- Projection windows mirror the circuit and p5, not the drawing.
- Marks live on one transparent board (2400 × 1600 at the origin); marks outside it are kept but are not in a whole-drawing PNG.
- The editor's undo and the circuit's undo are separate.
- A deployed build needs the vendored folder committed or copied in the build step.
- In Vite's dev server a script in `/public` cannot be `import()`ed, so `DrawingBoard` reads the client as text and imports it from a blob; a built site could import it directly.
- The lean editor's main script is still about 2 MB; more can be cut (lessons, walkthroughs, recorder, sources code).

## Where the other half lives

`~/dev/artistmodelstudio`, branch `embed-editor`: `docs/EMBEDDING.md` (plan, protocol, what was built, lean and chunky builds), `src/embed/` (the bridge and the client `ams-editor.js`), `embed.html`, `vite.embed.config.js`, `scripts/sync-embed.sh`, `embed-demo.html` (a bare host page to try every call). If the editor needs a change, change it there and run `npm run vendor:ams` again; tell the agent working there what the protocol lacked.
