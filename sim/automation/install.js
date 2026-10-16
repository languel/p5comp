import { AgentController } from "../../shared/automation/Controller.js";
import { TOOLS } from "../../shared/automation/tools.js";
import { basePath } from "../../shared/basePath.js";
import { icon } from "../uiIcons.js";
export function installAgentSurface(adapter) {
  const controller = new AgentController(adapter, { storage: localStorage });
  const callTool = (name, args, meta) => controller.call(name, args, meta);
  const api = {
    version: "1.0",
    listTools: () => structuredClone(TOOLS),
    callTool,
    getProject: () => structuredClone(adapter.project()),
    getState: () => adapter.state(),
    subscribe: (fn) => controller.subscribe(fn),
    recording: controller,
  };
  window.p5comp = api;
  window.webmcp = api;
  const result = async (name, args) => {
    try {
      return {
        content: [
          { type: "text", text: JSON.stringify(await callTool(name, args)) },
        ],
      };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
  };
  const registration = new AbortController();
  try {
    const mc = document.modelContext || navigator.modelContext;
    const tools = TOOLS.map((t) => ({
      ...t,
      execute: (args) => result(t.name, args),
    }));
    if (mc?.registerTool)
      for (const t of tools)
        Promise.resolve(
          mc.registerTool(t, { signal: registration.signal }),
        ).catch((e) => console.warn("WebMCP registration:", e.message));
    else mc?.provideContext?.({ tools });
  } catch (e) {
    console.warn("WebMCP registration:", e.message);
  }
  controller.subscribe((e) =>
    document.dispatchEvent(
      new CustomEvent("p5comp:agent-event", { detail: e }),
    ),
  );
  const settings = document.getElementById("globalSettings");
  const group = document.createElement("section");
  group.className = "agent-settings";
  group.innerHTML =
    '<h4>Agents & process</h4><p>API: <code>window.p5comp</code> · WebMCP · local MCP/HTTP</p><label>Recording title <input id="processTitle" value="Class demo"></label><label>Saved recording <select id="processSaved"><option value="">Latest recording</option></select></label><label><input type="checkbox" id="processTimed"> Keep original timing</label><label>Step annotation <input id="processNote" placeholder="Explain this step…"></label><div><button id="processMark">Add annotation</button><button id="processCancel">Cancel replay</button><button id="processRecord">Record actions</button><button id="processStop">Stop recording</button><button id="processExport">Export recording</button><button id="processReplay">Load replay</button><button id="processStep">Next step</button><button id="processPlay">Replay all</button><button id="processImport">Import recording</button></div><output id="processStatus">Ready</output><output id="agentRelayStatus">Local relay: connecting…</output>';
  settings.append(group);
  let recent = null;
  const output = group.querySelector("#processStatus");
  const select = group.querySelector("#processSaved");
  const refreshSaved = () => {
    const selected = select.value;
    select.replaceChildren(new Option("Latest recording", ""));
    for (const t of controller.saved)
      select.add(
        new Option(t.title + " · " + t.entries.length + " steps", t.id),
      );
    select.value = selected;
  };
  refreshSaved();
  const chosen = () =>
    controller.saved.find((t) => t.id === select.value) ||
    recent ||
    controller.saved.at(-1);

  const run = async (name, args) => {
    try {
      const r = await callTool(name, args, { source: "human" });
      if (args.action === "stop") recent = r.result;
      output.textContent = controller.take
        ? "Recording · " + controller.take.entries.length + " actions"
        : controller.replayState()
          ? `Replay ${controller.replayState().index}/${controller.replayState().total}`
          : recent
            ? `Saved · ${recent.entries.length} actions`
            : "Ready";
      refreshSaved();
      return r;
    } catch (e) {
      output.textContent = e.message;
    }
  };
  group.querySelector("#processMark").onclick = () =>
    run("p5comp_recording", {
      action: "mark",
      note: group.querySelector("#processNote").value,
    });
  group.querySelector("#processCancel").onclick = () =>
    run("p5comp_replay", { action: "cancel" });
  group.querySelector("#processRecord").onclick = () =>
    run("p5comp_recording", {
      action: "start",
      title: group.querySelector("#processTitle").value,
    });
  group.querySelector("#processStop").onclick = () =>
    run("p5comp_recording", { action: "stop" });
  const download = (value) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = (value.title || "process") + ".p5comp-process.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  group.querySelector("#processExport").onclick = () => {
    const take = controller.take || chosen();
    if (take) download(take);
    else output.textContent = "No recording yet.";
  };
  group.querySelector("#processReplay").onclick = () =>
    run("p5comp_replay", {
      action: "load",
      recording: chosen(),
    });
  group.querySelector("#processStep").onclick = () =>
    run("p5comp_replay", { action: "step" });
  group.querySelector("#processPlay").onclick = () =>
    run("p5comp_replay", {
      action: "play",
      timed: group.querySelector("#processTimed").checked,
    });
  group.querySelector("#processImport").onclick = () => {
    const f = document.createElement("input");
    f.type = "file";
    f.accept = ".json";
    f.onchange = async () => {
      try {
        const recording = JSON.parse(await f.files[0].text());
        await run("p5comp_recording", { action: "import", recording });
        recent = recording;
      } catch (e) {
        output.textContent = e.message;
      }
    };
    f.click();
  };
  controller.subscribe((e) => {
    if (e.type === "recording.stopped") {
      recent = controller.saved.find((t) => t.id === e.data.id);
      refreshSaved();
    }
    const playback = controller.replayState();
    output.textContent = controller.take
      ? "Recording · " + controller.take.entries.length + " actions"
      : playback
        ? `Replay ${playback.index}/${playback.total}`
        : recent
          ? `Saved · ${recent.entries.length} actions`
          : "Ready";
    if (e.type === "replay.step" && e.data.entry.kind === "mark")
      output.textContent +=
        " · " + (e.data.entry.title || e.data.entry.note || "Annotation");
  });
  const badge = document.createElement("button");
  badge.id = "agentProcess";
  badge.className = "ui-icon-button";
  badge.append(icon("record"));
  badge.title = "Record / replay actions · agent API";
  badge.setAttribute("aria-label", badge.title);
  badge.onclick = () => {
    callTool(
      "p5comp_view",
      { inspector: "settings" },
      { source: "human" },
    ).then(() => group.scrollIntoView({ block: "nearest" }));
  };
  document.getElementById("settingsPanelToggle").before(badge);
  controller.subscribe((e) => {
    badge.setAttribute("aria-pressed", String(!!controller.take));
  });
  const cleanup = new AbortController();
  const relay = async () => {
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) {
      group.querySelector("#agentRelayStatus").textContent =
        "WebMCP ready · local relay unavailable on hosted pages";
      return;
    }
    let session, token;
    while (!cleanup.signal.aborted) {
      try {
        if (!token) {
          const r = await fetch(basePath("api/agent/config"), {
            signal: cleanup.signal,
          });
          if (!r.ok) throw Error("Local relay unavailable");
          token = (await r.json()).token;
        }
        const request = async (path, body) => {
          const r = await fetch(basePath("api/agent" + path), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify(body),
            signal: cleanup.signal,
          });
          if (!r.ok) {
            if (r.status === 404) {
              session = null;
            }
            if (r.status === 401) token = null;
            throw Error("Relay " + r.status);
          }
          return r.json();
        };
        if (!session) {
          session = (
            await request("/register", {
              title: document.title,
              url: location.href,
              workspace: adapter.workspace,
            })
          ).id;
          api.sessionId = session;
          group.querySelector("#agentRelayStatus").textContent =
            "Local relay · " + session;
        }
        const { command } = await request("/sessions/" + session + "/poll", {});
        if (command) {
          const targetSession = session;
          const handle = async () => {
            let response;
            try {
              response = {
                id: command.id,
                result: await callTool(command.name, command.args, {
                  source: "agent:http",
                  requestId: command.requestId,
                }),
              };
            } catch (e) {
              response = { id: command.id, error: e.message };
            }
            await request("/sessions/" + targetSession + "/result", response);
          };
          handle().catch((e) => console.warn("Agent response:", e.message));
        }
      } catch (e) {
        if (cleanup.signal.aborted) break;
        group.querySelector("#agentRelayStatus").textContent =
          "Local relay offline · WebMCP / browser API ready";
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };
  relay();
  window.addEventListener("pagehide", () => cleanup.abort(), { once: true });
  api.dispose = () => {
    cleanup.abort();
    registration.abort();
    for (const t of TOOLS) navigator.modelContext?.unregisterTool?.(t.name);
  };
  return controller;
}
