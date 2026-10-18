# Interface icon reference

p5comp uses quiet, neutral controls with one shared visual scale. Circuit components and teaching content keep their own appearance; interface controls use the active theme's text/quiet colors. Color communicates state or circuit meaning, rather than decorating navigation.

## Reference

- Source: `sim/uiIcons.js`. Reuse a named SVG instead of typing a Unicode symbol or drawing a second version.
- Every symbol uses a 24 × 24 viewBox, with its main geometry spanning approximately 20 units, centered at (12, 12). Narrow symbols retain their natural proportions; never stretch them to fill a square.
- Default SVG box: 18 × 18 CSS pixels. Stroke: 1.75 source units, round joins and caps. Stroke scales with icon size.
- Default hit target: 28 × 28 CSS pixels, centered with flex layout. Target size grows with the global Settings → Icon size preference. Matching button boxes alone is insufficient: glyphs must share geometry and ink scale.
- Wordmark tabs use `p5` (code) and `p5⋆` (render), at the shared icon size; keep their natural width. Project names, filenames, and menu descriptions are text labels and use text typography.
- Labels stay in accessible names and native hover titles. A menu row combines a standard icon with a text label. A stateful dropdown may combine two standard icons, e.g. communications + selected transport.
- Reuse the exact same play, stop, reset, upload, USB, and tidy symbol wherever that action appears. Disabled controls change opacity, never geometry.

When adding controls, use `icon(name)` and the `ui-icon-button` class. `initializeIconSystem()` also adapts legacy toolbar controls and dynamic glyph dropdowns. Preserve each button's title and accessible name. Avoid hardcoded per-toolbar SVG widths, font-size fixes, or Unicode lookalikes for existing icons.

Review top navigation, Arduino/p5 transport, canvas tools, inspector tabs, and dropdown states together in both themes after changing the reference.

The Arduino tab uses a custom thin infinity/plus/minus symbol on the same 24-unit grid and 1.75-unit stroke as other controls. It is an interface symbol rather than the full Arduino brand logo. The `p5` tab uses a compact text wordmark.

## Simulation transport

The main toolbar has one play/stop control. Click starts or stops; Shift-click while running pauses, and either a normal or Shift-click resumes a paused simulation. Option/Alt-click restarts from the beginning. The tooltip lists the modifiers, and the bottom status line distinguishes Running, Paused, and Stopped. Separate pause/reset buttons and the legacy Reference menu are hidden/removed from the unified workspace.

The Serial tab uses labelled native baud and line-ending selectors for familiar Arduino monitor operation. Line endings are No ending, LF, CR, or CR+LF and apply only to monitor sends. Baud changes reopen a connected USB port at that rate; the circuit simulator delivers decoded UART bytes and does not emulate a monitor baud mismatch.

Serial Latest and Stream follow use named SVGs (`serialLatest`, `serialFollow`) derived from ⥨ and ⟱. They share the 20-unit ink box and stroke of transport/navigation icons; Unicode font metrics do not determine their size.

## Simulation panel

Inputs and Outputs are separate compact sections. Input sliders set continuous
values; toggle and DIP buttons latch On/Off, while momentary buttons stay On only
while held. A small dot before a simulatable label toggles its detailed simulator; double-clicking the label does the same. Rows use separate dot, label, right-aligned value, and widget columns.
Checkbox state is shown by its fill, without a checkmark overlay.

Outputs show measured simulation values. Hold a preview glyph to visually test
an LED, RGB LED, servo, or relay; release to restore the measured state. This is
a presentation preview, not a pin override or hardware command.

Drag the top edge of the bottom tools panel to resize it. Height is saved with the project and shared by all tool tabs. Double-click the edge (or press Home while focused) to reset; Up/Down adjust by 20 pixels.
