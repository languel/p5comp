# Record, edit and export a lesson

Open **Lesson timeline** in the bottom tools bar. Give the take a title and press **● Record page**. Build the circuit, edit Arduino and p5 code, switch views and run the simulator as usual. Press **■ Stop and save take** when finished. **CC** reveals the optional caption input; press Enter to add a caption while recording.

The recorder captures the workbench above the bottom drawer. The timeline and its controls are excluded. Page snapshots are sampled up to twice per second, including circuit SVGs, source editors, visible drawing canvases and the mirrored p5 output. Code, circuit, page settings, controls, drawing changes and serial/signals are also recorded as editable state. Recording preserves pauses until you explicitly edit them.

## Play and return to editing

Press **▶ Play page recording** or drag the **Timeline playhead**. A vertical line and time counter show your position. Playback displays the captured page in place, above the timeline; it does not open an empty AMS board. Choose ½–2× speed. Use **↩ Return to live page** or Escape to restore your project, editor undo history and circuit undo history. Playback stops the live runtimes and does not execute firmware uploads or hardware actions.

Older p5comp takes without page images reconstruct the code/circuit and available view state in the workbench. They cannot recover page details that were never recorded. **≡ Inspect recording** opens the detailed source/circuit/drawing inspector; its drawing panel appears only if drawing content exists. Imported AMS-only takes use that inspector.

## Edit sections and record another pass

- **✂ Split section at playhead** divides the selected time into independently movable sections. Each section stores its starting state, so moving it does not depend on the preceding section's code edits.
- Select a section to change its name, trim its in/out times, move it earlier/later, duplicate or delete it. Drag the section to reorder it; drag its right edge to change its playback duration. The remaining sections close up automatically.
- **Steps** creates before/after sections for code, circuit, drawing and view changes. It replaces waiting with short holds. Use timeline Undo to return to the timed recording.
- **●+ Overdub from playhead** restores the editable state at that point and starts a new recording pass. Make your changes, then Stop. The new pass replaces the remainder of the selected section, or its elapsed interval if no section is selected. A new take titled “· overdub” preserves the untouched beginning and end; the original take remains available.
- **↶ / ↷** undo and redo timeline edits. Space plays/pauses, S splits, and arrow keys move the playhead when the lanes have keyboard focus.

## Save and export

Page images live in IndexedDB, while small references stay in browser autosave. Save a project or export the take for a durable, portable copy before clearing browser storage.

- **↓ Export take JSON** includes the source/state clips and a deduplicated image table. **↑ Import take JSON** brings those images into the receiving browser. The take remains editable.
- Project JSON, ZIP and folder exports also include the image assets with `workbench.takes`. ZIP additionally includes standalone take files.
- **HTML ↓** creates one self-contained playable file. Open it from disk without p5comp or a network connection. It shows the recorded page with playback controls outside the image; the lesson track is absent from the captured page.
- **MP4 ↓** renders that same page at 15 fps and up to 1920 px wide, preserving its aspect ratio, then encodes H.264 using single-thread **FFmpeg WASM in a browser worker**. Progress and Cancel appear in the timeline. The bundled core loads on demand (about 32 MB); there is no server upload or native FFmpeg dependency.

For older host takes, HTML/MP4 export first reconstructs workbench snapshots from the available source, circuit and p5 output. Pure AMS takes keep the drawing presentation renderer. The HTML player embeds stable raw core/player sources so minified production builds work offline. `npm run vendor:ams-take` bundles the drawing renderer from the owning AMS sources (`AMS_DIR` overrides `~/dev/artistmodelstudio`). `@ffmpeg/core` is GPL-2.0-or-later; its source and license links are in the package and third-party documentation.

## Format

The version 1 `ams-take` format retains its AMS drawing baseline. `meta.p5comp.state` holds the initial host files, diagram, signals, controls and page settings; `meta.p5comp.project` holds runtime configuration/assets. `shared/takes/take.js` implements state diffs, composition flattening and seeking. `shared/takes/edit.js` implements section cuts, trims, steps and replacement passes.

| Clip kind | Content |
| --- | --- |
| `code` | File text diff or file deletion |
| `circuit` | Changed top-level diagram fields |
| `page` | View, inspector, settings and control changes |
| `state` | Complete host state anchor at a section boundary |
| `frame` | `page` JPEG or mirrored `p5` image, inline or referenced through `meta.frameAssets` |
| `comp` | Section containing clips, with its own playback rate |
| `draw` | AMS drawing diff/stroke timing from its existing recorder |
| `signal` | Named numeric value, sampled up to 20 Hz per name |
| `say`, `title`, `action` | Caption, title or recorded action label; actions never execute hardware during playback |

## Limits

Page capture is a sampled visual record, not a smooth desktop screen recording. MP4 holds these snapshots between samples; it does not invent missing animation frames. No microphone/audio track is recorded. DOM/SVG capture can differ slightly from browser rendering, and cross-origin/tainted media cannot always be captured. The p5 mirror samples up to 5 fps independently.

Sections can be rearranged and replaced, but this is not a polyphonic audio/video compositor. Code/circuit state and view settings restore for overdubbing; arbitrary running JavaScript memory and simulator CPU state do not. Simulated or USB hardware timing is not rerun. Recording belongs to the unified workbench, not the standalone mini IDE. Stop before changing projects; export long recordings regularly because browser storage and encoding memory are finite.

## AMS change required

`~/dev/artistmodelstudio/vite.embed.config.js`: remove `recorder` and `takePlayer` from the lean build's stub aliases. The handoff's take messages were present, but the lean embed returned a proxy function for `recorder.take`, causing `record-stop` to fail with a structured-clone error. Enabling the actual modules makes the existing bridge/client calls work. No bridge or client protocol fork is needed. The vendor VERSION records the source commit; browser checks exercise start/stop and drawing replay in the lean build.

## Included LED lesson and recording recipe

The captioned **LED from scratch** lesson is recorded through the real browser workbench in an isolated workspace, not assembled from the existing HelloLED example. Its baseline has no circuit parts and empty `sketch.ino`/`sketch.js`. Six circuit edits add and wire the Uno, 330 Ω resistor and LED. Eleven source edits build both programs. The final sketch is compiled by the browser AVR compiler and produces alternating actual simulator UART `0`/`1` lines. Twenty-eight p5 frames preserve the resulting circle states. The packaged presentation is about 67 seconds; preview startup waiting is cut and captions hold until the next caption. Edit details are retained in `meta.lesson.edit`.

- `public/lessons/led-from-scratch.ams-take.json`: editable take.
- `public/lessons/led-from-scratch.html`: self-contained playback, exported by the UI.
- `public/lessons/led-from-scratch.mp4`: H.264, 1280×720, 15 fps, exported by browser FFmpeg.
- `public/examples/led-from-scratch.json`: final project with the take, available in File → Examples → Getting started.
- `scripts/record-led-lesson.mjs`: repeatable browser authoring recipe (`recordLEDLesson(page)` with an owned ego-browser Page).
- `node scripts/package-led-lesson.mjs <recording-result.json>` packages the recipe's `{ project, take }` result and verifies the blank baseline, final sources/circuit, serial states and preview frames.

The recording uses the simulator and has not been uploaded to physical hardware.
