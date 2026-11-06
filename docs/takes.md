# Capture a lesson and play it back

Select the **Lesson timeline** tab alongside Simulation, Serial and Console in the bottom tools bar in the unified p5comp workbench (`/sim/`). Give the lesson a title and press **● Record lesson**. Edit Arduino or p5 code, draw, change the circuit, run or upload a sketch, and use serial hardware or the simulator as usual. Type a caption and press Enter to add it while recording. Press **■ Stop and save take** to save the lesson with the project.

The lanes show the recorded clip kinds. Click a clip or **▶ Review take** to review it in a separate, view-only window. Play/pause, seek, choose a source file, and change speed (½–2×). Captions appear above the code, recorded circuit schematic, AMS drawing replay, and p5 output. Action targets pulse as their clips pass. Playing starts an isolated p5 sketch preview; its recorded named sensor values and received serial lines drive the sketch without an Arduino. Restart preview explicitly if necessary. The preview's output callbacks have no connection to USB or the simulator.

Closing review returns to the project. Seeking reconstructs the recorded code and circuit; it never edits or restores project files. There is no automatic firmware upload, USB connection, or circuit simulation during review. Stop a recording before opening a different project. Reloading while recording prompts because that take has not yet been saved.

Try **↑ Import take JSON** with [`examples/takes/sensor-playback.ams-take.json`](../examples/takes/sensor-playback.ams-take.json) for a small synthetic sensor lesson: Play expands a circle from recorded `pot` values without hardware.

## Saved files

- Browser autosave and project JSON: `workbench.takes[filename]` holds complete take JSON. Save the project to a file for a durable copy.
- Project ZIP: also includes `takes/<name>.ams-take.json` as standalone files.
- **↓ Export take JSON** downloads the selected take; **↑ Import take JSON** opens a version 1 AMS take. Imported AMS-only drawings also play in the drawing preview.
- Each take includes the initial source files, circuit, p5 assets/settings and AMS drawing baseline. Prior takes and compiled firmware are excluded from this baseline to avoid recursive growth.

## Format and adapters

`shared/takes/take.js` has no DOM or AMS dependency. It exports `diffText`, `applyText`, `diffState`, `apply`, `describe`, `stateAt`, `flatten`, `compress`, `validateTake`, and `TakeRecorder`. `sim/TakeTimeline.js` supplies snapshot, UI, serial capture and preview rendering. The drawing recorder and renderer remain in the embedded Poliplan; they are not copied or forked.

Every file is `{ type: 'ams-take', version: 1, title, created, duration, baseline, tracks, clips, source: 'p5comp', meta }`. Times are milliseconds. `baseline` is an AMS drawing document so the same file can open in AMS. `meta.p5comp.state` contains initial `{ files, diagram, signals }`; `meta.p5comp.project` contains p5 runtime configuration and assets. Unknown kinds are ignored by playback.

| Kind | Payload and behaviour |
| --- | --- |
| `title` | `{ text }` lesson title card |
| `say` | `{ text }` captions; serial lines also have `meta.dir: 'rx' | 'tx'` |
| `action` | `{ name, label, ui: { kind: 'button', target } }` stable action target; review pulses its label, never executes hardware actions |
| `draw` | AMS document diffs and stroke timing, obtained through `recordStart/recordStop` |
| `code` | `{ file, diff: { from, delete, lines } }`, zero-based line range replacement; `{ file, removed: true }` deletes a file |
| `signal` | `{ name, value }`, finite named values sampled at most 20 Hz per name; unchanged values omitted; simulated circuit inputs use `control_<part id>` |
| `circuit` | `{ diff }`, changed top-level diagram fields (parts, connections, etc.); unchanged fields omitted |

One `performance.now()` clock records host clips and offsets the drawing recorder's start. At Stop, both are merged before gaps over 2 seconds are compressed. Clip start and end anchors share that mapping. Tracks/compositions and muted lanes are respected on import. The pure adapter tests cover seeking backwards, empty-file creation/deletion, text diffs, sampling, clock alignment, composition rates and malformed input.

## Limits

- This is a capture/review transport with clip lanes, not a full clip rearrangement or video export editor. Narration is text; microphone audio is not captured.
- Review shows a schematic of recorded circuit parts and named connections, not the live animated electronics view. Circuit runtime, firmware and hardware state are not rerun.
- Code is shown at its recorded edit times. A p5 Run cue restarts the preview from the current recorded code; a seek reconstructs code/signals and restarts the preview on release. Arbitrary p5 animation/random state is not frame-exact.
- The mock hardware path supports named numeric signals and newline serial text. Binary Firmata streams, incomplete lines, USB timing and device-specific protocols are not reproduced.
- Serial text is kept per line; long/high-bandwidth captures can be large. Stop and export before browser storage fills. No trimming or take deletion UI yet.
- Capture belongs to the unified workbench; the standalone mini IDE is unchanged.

## AMS change required

`~/dev/artistmodelstudio/vite.embed.config.js`: remove `recorder` and `takePlayer` from the lean build's stub aliases. The handoff's take messages were present, but the lean embed returned a proxy function for `recorder.take`, causing `record-stop` to fail with a structured-clone error. Enabling the actual modules makes the existing bridge/client calls work. No bridge or client protocol fork is needed. The vendor VERSION records the source commit; browser checks exercise start/stop and drawing replay in the lean build.
