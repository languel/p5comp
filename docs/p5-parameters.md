# Live p5 signals and controls

Simulation shows Arduino on the left and p5 on the right. One row represents a
signal connection, with a straight arrow showing its direction. Readings and
controls belong to their endpoint columns; the p5 heading aligns at the right edge.
Physical component controls and output tests stay in their signal row. Click or
hold the output glyph to preview an output; input glyphs open available sensor
simulators. Unconnected controls appear without an arrow.

The plot glyph above the arrows toggles ten-second live plots. Histories are
bounded, channels auto scale, and arrays such as RGB produce separate traces.
Resize the bottom drawer to show more rows.

## Minimal shared-name convention

Use the same signal names in Arduino and p5:

```js
// @param interval = 500 (50..2000 step:10)
// @send interval
// @receive led
let interval = 500;
let led = 0;
```

`@send` and `@receive` create paired endpoints and arrows automatically. These
comments describe the diagram; your ordinary serial code still sends and receives
the data. The Arduino endpoint mirrors the commanded or received p5 value; it
does not inspect firmware RAM. HelloLEDp5 demonstrates this minimal protocol.

## Editable parameters

`@param` binds the control directly to a writable top-level `let` or `var`:

```js
// @param motionGain = 1 (0..3 step:0.05)
let motionGain = 1;
// @param enabled = true (boolean)
let enabled = true;
```

Changes assign the actual running variable without restarting p5. Numeric writes
are bounded and snapped to the declared step. Values are saved with the project
and restored on restart; `const` values are read-only. Avoid overwriting editable
variables in `draw()`: use a separate derived variable for sensor mappings.

A custom preview slider should update the same variable in its input callback,
and reflect that variable in `draw()`. Field / feedback demonstrates this with
`hue`, so the preview and Simulation sliders stay synchronized.

## Explicit mappings

For different names or component mappings, use watches and links:

```js
// @watch in sensor.pot
// @watch out requestedRGB
// @link A0 -> sensor.pot
// @link requestedRGB -> rgbled
```

Component endpoints use IDs from the diagram. Simulation pairs these mappings
with existing component controls automatically. Internal derived-value links
remain available through the API without cluttering the communication diagram.

For a named circuit protocol endpoint rather than a physical component:

```js
// @terminal circuit in arduino.interval = interval
// @link interval -> arduino.interval
```

Names can reference top-level variables or object properties. Function-local
values must be promoted to sketch scope. Only annotated values are exposed;
unavailable values display a dash. Links describe authored relationships, not
inferred JavaScript dependencies. The `arduino.` prefix is omitted in the UI.

All annotations remain inert comments in external p5 editors. The `@param`
numeric/boolean syntax follows Underscores' convention, adapted to real p5
variables.

## Agent access

`p5comp_p5_parameters` reads the same values and links. Pass
`{name:"motionGain",value:1.5}` to set an editable variable. Writes use the same
validation as the controls and are captured by process recording.
