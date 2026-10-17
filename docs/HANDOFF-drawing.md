# Handoff: drawing on the circuit (Artist Model Studio editor)

State on 17 Oct 2026. Branch `ams-editor-integration`, one commit (`3ac9be3`) on top of `main` at `3af325d`, in the git worktree `~/dev/arduino/p5comp-ams`. Nothing is pushed.

## What it is

The Artist Model Studio drawing editor, embedded as an iframe through a small message protocol (`ams-editor-v1`). Two ways to use it:

- **✎ Draw** (a new button in the circuit's canvas tools): a transparent layer over the circuit canvas. The pointer draws instead of moving parts; the editor's own tools appear. Off, the drawing stays visible and the circuit is edited as before. Pan and zoom are shared: move either and the other follows.
- **The Draw tab** (pencil icon, next to Circuit and p5): the same drawing over the whole work area, with its own camera.

**▣ p5 image** saves a transparent PNG of the drawing as the project asset `drawing.png` (`loadImage('drawing.png')`); **SVG** downloads a vector file. The drawing is saved in the project (`workbench.drawing`) and restored when a project opens.

## Files (the whole integration)

- `sim/DrawingBoard.js` (new, ~200 lines): the layer, camera sync, persistence, export. Read its header comment first.
- `sim/Workbench.js`: imports it; creates it after the split divider; the Draw tab button; `mainView()` hides circuit and p5 for the Draw tab and calls `drawing.setView`; `snapshot()` and `restore()` carry `drawing`.
- `sim/workbench.css`: `.draw-layer`, `.draw-tools`, `.draw-layer.tab` (appended at the end).
- `package.json`: `npm run vendor:ams`. `.gitignore`: `public/vendor/ams-editor/`. `docs/drawing.md`: user-facing notes.

## To try it

The editor build is not committed (13 MB). It already sits, ignored, in the worktree's `public/vendor/ams-editor/`. To use it elsewhere:

```sh
npm run vendor:ams     # builds ~/dev/artistmodelstudio (branch embed-editor) and copies the build here
```

Easiest test, in the worktree (it has `node_modules` copied from the main checkout):

```sh
cd ~/dev/arduino/p5comp-ams && npx vite --host 127.0.0.1 --port 5199
# open http://127.0.0.1:5199/sim/
```

To take it into the main checkout instead: `git merge ams-editor-integration` (or `git cherry-pick 3ac9be3`) there, then `npm run vendor:ams`. It applied cleanly against `main` at `3af325d`; if `Workbench.js` has moved on, the edits are small and listed above.

## Checklist (what was verified, with synthetic events in the browser)

1. Click ✎ Draw: the layer lies exactly over the stage; the editor's tools appear; drawing works; circuit parts are not moved meanwhile.
2. Ctrl+scroll on the circuit: the drawing zooms with it (and the reverse).
3. Reload: the drawing is back (it is in the project JSON in `localStorage`).
4. ▣ p5 image: `drawing.png` appears in the project assets; `loadImage('drawing.png')` in a sketch.
5. Draw tab: the drawing over the whole area; back to Circuit: the layer returns over the stage.

Not verified: a real mouse or pen (only dispatched events), touch, saving to and opening a project file with a drawing, the p5comp test suite (`npm test`).

## Known gaps

- Projection windows mirror the circuit and p5, not the drawing.
- Marks live on one transparent board (2400 × 1600 at the origin); marks outside it are kept but are not in the PNG.
- The editor's undo and the circuit's undo are separate.
- A deployed build needs the vendored folder committed or copied in the build step.
- In Vite's dev server a script in `/public` cannot be `import()`ed, so `DrawingBoard` reads the client as text and imports it from a blob; a built site could import it directly.

## Where the other half lives

`~/dev/artistmodelstudio`, branch `embed-editor`: `docs/EMBEDDING.md` (plan, protocol, what was built), `src/embed/` (the bridge and the client `ams-editor.js`), `embed.html`, `vite.embed.config.js`, `scripts/sync-embed.sh`, `embed-demo.html` (a bare host page to try every call). If the editor needs a change, change it there and run `npm run vendor:ams` again; tell the agent working there what the protocol lacked.
