# Agent API and process recording

p5comp has one versioned semantic command surface shared by its browser API,
WebMCP tools, local HTTP relay and stdio MCP server. Tool schemas are defined in
`shared/automation/tools.js`. `p5comp_describe` returns discovery and limitations.

## Record a lesson

Open **Record / replay actions** (circle glyph beside Settings), then:

1. Give the recording a title and press **Record actions**.
2. Build/edit the circuit, change code, adjust inputs, and run/stop the simulation.
3. Add annotations at useful teaching moments, then **Stop recording**.
4. Choose a saved recording and **Load replay** to restore its starting project.
5. Use **Next step** for ordered explanation, or **Replay all**. Original timing
   is optional and off by default. **Cancel replay** interrupts timed waiting.
6. Export/import the portable `.p5comp-process.json` file for another browser.

A process contains its initial project and runtime state, ordered project changes,
simulation/serial commands, annotations, optional elapsed times and final project.
Changes retain human/agent provenance. It records source edits, placement,
connections, values, camera/layout and media/note properties, rather than raw
pointer coordinates. Continuous drags or typing may produce several change steps.
Recordings are saved in this browser's local storage when stopped. Export before
clearing browser storage. An in-progress recording is not recovered after reload.

This is **editable process recording, not an audiovisual recording**. Live camera,
shared windows, USB permissions, physical uploads, network responses, random p5
output and exact CPU timing cannot be reproduced by this format. Capture frames
and embedded assets can be saved as part of the project. Camera and USB acquisition
remain explicit human UI actions; replay never requests them. Global appearance
preferences and local sketch-library operations are available through API but are
not currently recorded as project changes. Selection and transient popups are not
part of the portable sequence. Replacing a project stops active capture streams.

## Browser API

```js
const api = window.p5comp; // window.webmcp is a compatibility alias
api.listTools();
await api.callTool("p5comp_part_put", {
  part: {
    id: "led1",
    type: "wokwi-led",
    left: 200,
    top: 100,
    attrs: { color: "red" },
    label: "Output",
  },
});
await api.callTool("p5comp_control_set", { id: "pot", value: 800 });
const project = await api.callTool("p5comp_project_get");
const unsubscribe = api.subscribe((event) => console.log(event));
```

Commands return `{ok, revision, result}`. Mutations are ordered. JSON patches and
part replacement optionally accept `expectedRevision`; a stale revision fails.
Use `requestId` in the third `callTool` argument to safely retry a mutation within
this document's bounded receipt cache. `p5comp_events` returns ordered diagnostics,
action and change events after a cursor; the last 2,000 events are retained.

## Coverage

| Area              | Tools                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| Discovery/state   | describe, state, catalog, events                                                     |
| Whole project     | project_get, project_open, project_patch                                             |
| Circuit           | part_put/remove, wire_put/remove, canvas                                             |
| Source files      | code_set; JSON patch for deleting/renaming files                                     |
| Simulation        | control_set, runtime, serial (simulated writes only)                                 |
| Scene             | media_put/remove; notes, images, video, inactive capture frames                      |
| Assets            | asset list/get/put/remove                                                            |
| Layout            | view; canvas camera, grid, routing, undo/redo, selection                             |
| Examples/sketches | examples, library list/get/save/remove                                               |
| Preferences       | settings; project backgrounds in workbench.settings                                  |
| Output            | export JSON/ZIP/SVG/PNG content; PDF initiates browser download                      |
| Lessons           | recording start/stop/list/get/import/remove/mark; replay load/step/play/cancel/state |

Names in this table have the `p5comp_` prefix. Source/diagram mutations validate
before applying. Project edits currently rebuild the scene and may restart a
running simulation; input/camera-only changes preserve the runtime. Catalog
entries advertise modeled versus unmodeled components. No arbitrary-eval tool
is provided. Running source still executes that source in the normal simulation
or p5 sandbox, including its usual network behavior.

## WebMCP

Tools register with `document.modelContext.registerTool` in supporting browsers,
with feature-detected legacy `navigator.modelContext` support. Unsupported
browsers still have the browser API. Registration uses the current
[WebMCP producer API](https://github.com/webmachinelearning/webmcp#readme).
Native discovery/calls were verified in the Codex in-app browser.

## MCP

Run `npm run dev` and open the workspace. Add a server entry to your agent's MCP
configuration (example in `mcp.example.json`):

```json
{
  "mcpServers": {
    "p5comp": {
      "command": "node",
      "args": ["/Users/liuboto/dev/arduino/p5comp/server/mcp.js"],
      "env": { "P5COMP_URL": "http://127.0.0.1:3001" }
    }
  }
}
```

Call `p5comp_sessions` first. Every other MCP call requires an explicit
`sessionId`. Check its URL/workspace before editing; opening multiple tabs is
supported. Reloads produce a new session. Re-list if it goes offline. Tools also
accept `requestId` for idempotent retries. MCP exposes the same schemas and command
results as WebMCP, with the extra session fields.

## Local HTTP

The server binds loopback. `GET /api/agent/config` provides the process-local
bearer token to local clients. Subsequent requests require
`Authorization: Bearer <token>`. Do not publish the token. Origin checks allow
only the configured local app origins; Host checks prevent DNS rebinding.

```
GET  /api/agent/tools
GET  /api/agent/sessions
POST /api/agent/sessions/<sessionId>/call
```

Call body:

```json
{ "name": "p5comp_state", "arguments": {}, "requestId": "my-read-1" }
```

Response: `{id, result: {ok, revision, result}}` or `{error}`. A timeout can have an
unknown outcome; inspect state or retry with the same requestId. Receipts last
for the document lifetime (most recent 100 requests), not across reloads. The
browser registers and polls for commands; a live browser is required. Static
GitHub Pages deployments have WebMCP/browser API but no local HTTP/MCP relay.
The relay intentionally does not offer unauthenticated arbitrary postMessage.

## Artist–Model Studio interoperability

The command registry, JSON project snapshots and `p5comp.process` version 1 are
transport independent. An AMS adapter can call this API or MCP and translate
between its take/clip format and ordered p5comp entries. The namespace avoids
colliding with `ams_*` tools. This establishes the seam; automatic AMS process
conversion and cross-app synchronized playback are not implemented yet.

## Verification

`npm test` covers patch atomicity/prototype guards, ordered human/agent recording,
step replay, revision/idempotency, cancellation, import restrictions, and relay
origin/auth/session isolation. For a live end-to-end check, open the disposable
`?workspace=agent-protocol-qa` tab, then run `node scripts/verify-agent.mjs`.
It deliberately never falls back to a user's other workspace. It creates a
five-step circuit/input/note process through the actual stdio MCP server, replays
it and compares the resulting circuit, controls and notes with the final snapshot.

## Poliplan drawing

The same `p5comp_drawing` tool is available through browser API, WebMCP, HTTP,
and stdio MCP. Install the editor first with `npm run vendor:poliplan`. Calls
fail explicitly when the vendored editor is unavailable.

```js
await api.callTool("p5comp_view", { main: "draw" });
const tools = await api.callTool("p5comp_drawing", { action: "tools" });
const drawing = await api.callTool("p5comp_drawing", { action: "get" });
// Use a name and arguments from the discovered native Poliplan tool schemas:
await api.callTool("p5comp_drawing", {
  action: "call", name: "ams_add", arguments: { /* discovered schema */ }
});
await api.callTool("p5comp_drawing", { action: "export", format: "svg" });
await api.callTool("p5comp_drawing", { action: "active", active: false });
```

`load` replaces the drawing using a `document` object; `get` returns its current
revision and document. `export` optionally accepts selected element `ids`, saves
a uniquely named PNG/SVG in project assets, and returns its name, MIME type, and
size. Native tools are discovered from the embedded editor; unknown names are
rejected. Tool calls refresh the persisted document immediately, so drawing
changes are captured as project changes in semantic recordings. Transient tool
selection and editor UI are not recorded. The Draw tab has an independent
camera; circuit overlay mode shares the circuit camera.

The generated editor bundle remains Git-ignored. The current Pages workflow
does not vendor it; deployment must supply that folder before building.
