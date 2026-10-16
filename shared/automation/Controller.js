import Ajv from "ajv";
import { TOOLS, PROTOCOL_VERSION } from "./tools.js";
import { diff, applyPatch } from "./patch.js";
const ajv = new Ajv({ strict: false, allErrors: true });
const validators = new Map(
  TOOLS.map((t) => [t.name, ajv.compile(t.inputSchema)]),
);
export class AgentController {
  constructor(adapter, { storage, now = () => performance.now() } = {}) {
    this.adapter = adapter;
    this.storage = storage;
    this.now = now;
    this.revision = 0;
    this.last = structuredClone(adapter.project());
    this.events = [];
    this.sequence = 0;
    this.listeners = new Set();
    this.source = "human";
    this.replaying = false;
    this.saved = [];
    this.queue = Promise.resolve();
    this.receipts = new Map();
    try {
      this.saved = JSON.parse(storage?.getItem("p5comp.recordings.v1") || "[]");
    } catch {}
  }
  emit(type, data) {
    const e = {
      sequence: ++this.sequence,
      type,
      time: this.now(),
      source: this.replaying ? "replay" : this.source,
      data: structuredClone(data),
    };
    this.events.push(e);
    if (this.events.length > 2000) this.events.shift();
    for (const fn of this.listeners) fn(e);
    return e;
  }
  observe(label) {
    const next = structuredClone(this.adapter.project()),
      patches = diff(this.last, next);
    if (!patches.length) return;
    this.revision++;
    this.last = next;
    this.emit("project.changed", {
      revision: this.revision,
      label: label || describe(patches),
      patches,
    });
    if (this.take && !this.replaying)
      this.take.entries.push({
        kind: "change",
        at: this.now() - this.started,
        source: this.source,
        label: label || describe(patches),
        patches,
      });
  }
  action(name, args) {
    this.emit("action", { name, args });
    if (this.take && !this.replaying)
      this.take.entries.push({
        kind: "command",
        at: this.now() - this.started,
        source: this.source,
        name,
        args: structuredClone(args),
      });
  }
  save() {
    this.storage?.setItem("p5comp.recordings.v1", JSON.stringify(this.saved));
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  call(name, args = {}, meta = {}) {
    if (meta.requestId && this.receipts.has(meta.requestId))
      return this.receipts.get(meta.requestId);
    const execute = async () => {
      const validate = validators.get(name);
      if (!validate) throw Error("Unknown tool: " + name);
      if (!validate(args))
        throw Error("Invalid arguments: " + ajv.errorsText(validate.errors));
      if (
        args.expectedRevision != null &&
        args.expectedRevision !== this.revision
      )
        throw Error(
          `Revision conflict: expected ${args.expectedRevision}, current ${this.revision}`,
        );
      const previous = this.source;
      this.source = meta.source || "agent";
      try {
        const result = await this.execute(name, args);
        this.observe(name);
        return { ok: true, revision: this.revision, result: result ?? null };
      } catch (e) {
        this.emit("command.error", { name, message: e.message });
        throw e;
      } finally {
        this.source = previous;
      }
    };
    const interrupt =
      (name === "p5comp_replay" && ["cancel", "state"].includes(args.action)) ||
      ["p5comp_state", "p5comp_events"].includes(name);
    const task = interrupt ? execute() : this.queue.then(execute);
    if (!interrupt) this.queue = task.catch(() => {});
    if (meta.requestId) {
      this.receipts.set(meta.requestId, task);
      if (this.receipts.size > 100)
        this.receipts.delete(this.receipts.keys().next().value);
    }
    return task;
  }
  async execute(name, a) {
    const op = name.replace(/^p5comp_/, "");
    if (op === "describe")
      return {
        application: "p5comp",
        protocolVersion: PROTOCOL_VERSION,
        tools: TOOLS,
        recording: {
          format: "p5comp.process",
          version: 1,
          ordered: true,
          timing: "optional",
          limitations: [
            "CPU timing and external media/hardware are not deterministic",
            "Browser/device acquisition is human initiated; replay never requests devices",
            "Recordings may contain source code and embedded assets",
          ],
        },
      };
    if (op === "state")
      return {
        ...this.adapter.state(),
        revision: this.revision,
        recording: this.take?.id || null,
        replay: this.replayState(),
      };
    if (op === "project_get") return structuredClone(this.adapter.project());
    if (op === "project_open")
      return this.adapter.applyProject(structuredClone(a.project), {
        replace: true,
      });
    if (op === "project_patch")
      return this.adapter.applyProject(
        applyPatch(this.adapter.project(), a.patches),
      );
    if (op === "events")
      return {
        events: this.events.filter((e) => e.sequence > (a.since || 0)),
        cursor: this.sequence,
        oldest: this.events[0]?.sequence || 0,
      };
    if (op === "recording") return this.recording(a);
    if (op === "replay") return this.replay(a);
    return this.adapter.command(op, a);
  }
  recording(a) {
    if (a.action === "start") {
      if (this.take) throw Error("Already recording.");
      this.observe();
      this.started = this.now();
      this.take = {
        format: "p5comp.process",
        version: 1,
        id: crypto.randomUUID(),
        title: a.title || "Untitled process",
        createdAt: new Date().toISOString(),
        baseline: structuredClone(this.adapter.project()),
        runtimeBaseline: (({ running, paused, p5Running }) => ({
          running: !!running,
          paused: !!paused,
          p5Running: !!p5Running,
        }))(this.adapter.state()),
        entries: [],
      };
      this.emit("recording.started", { id: this.take.id });
      return this.take;
    }
    if (a.action === "stop") {
      if (!this.take) throw Error("No active recording.");
      this.observe();
      const take = this.take;
      take.duration = this.now() - this.started;
      take.final = structuredClone(this.adapter.project());
      this.take = null;
      this.saved.push(take);
      this.save();
      this.emit("recording.stopped", { id: take.id });
      return take;
    }
    if (a.action === "mark") {
      if (!this.take) throw Error("Start recording first.");
      this.take.entries.push({
        kind: "mark",
        at: this.now() - this.started,
        note: a.note || "",
        title: a.title || "",
      });
      return this.take.entries.at(-1);
    }
    if (a.action === "list")
      return this.saved.map(({ id, title, createdAt, duration, entries }) => ({
        id,
        title,
        createdAt,
        duration,
        steps: entries.length,
      }));
    if (a.action === "get")
      return structuredClone(
        this.take?.id === a.id
          ? this.take
          : this.saved.find((t) => t.id === a.id) || this.take || null,
      );
    if (a.action === "import") {
      validateTake(a.recording);
      const take = { ...structuredClone(a.recording), id: crypto.randomUUID() };
      this.saved.push(take);
      this.save();
      return { id: take.id };
    }
    if (a.action === "remove") {
      this.saved = this.saved.filter((t) => t.id !== a.id);
      this.save();
      return { removed: a.id };
    }
  }
  replayState() {
    return this.playback
      ? {
          id: this.playback.take.id,
          index: this.playback.index,
          total: this.playback.take.entries.length,
          playing: this.playback.playing,
        }
      : null;
  }
  async replay(a) {
    if (a.action === "state") return this.replayState();
    if (a.action === "cancel") {
      if (this.playback) {
        this.playback.cancelled = true;
        this.playback.wake?.();
      }
      return this.replayState();
    }
    if (a.action === "load") {
      if (this.take) throw Error("Stop recording before replay.");
      const take = a.recording || this.saved.find((t) => t.id === a.id);
      validateTake(take);
      this.replaying = true;
      try {
        await this.adapter.applyProject(structuredClone(take.baseline), {
          replace: true,
        });
        if (take.runtimeBaseline?.running)
          await this.adapter.command("runtime", { action: "start" });
        else if (take.runtimeBaseline?.p5Running)
          await this.adapter.command("runtime", { action: "p5_start" });
        if (take.runtimeBaseline?.paused)
          await this.adapter.command("runtime", { action: "pause" });
      } finally {
        this.replaying = false;
      }
      this.playback = {
        take: structuredClone(take),
        index: 0,
        playing: false,
        cancelled: false,
      };
      return this.replayState();
    }
    const p = this.playback;
    if (!p) throw Error("Load a recording first.");
    if (p.playing) throw Error("Replay already playing.");
    const step = async () => {
      const entry = p.take.entries[p.index];
      if (!entry) return false;
      this.replaying = true;
      try {
        if (entry.kind === "change")
          await this.adapter.applyProject(
            applyPatch(this.adapter.project(), entry.patches),
          );
        else if (entry.kind === "command")
          await this.adapter.command(
            entry.name.replace(/^p5comp_/, ""),
            entry.args,
          );
        this.observe("replay step");
        p.index++;
        this.emit("replay.step", { index: p.index, entry });
        return true;
      } finally {
        this.replaying = false;
      }
    };
    if (a.action === "step") {
      await step();
      return this.replayState();
    }
    if (a.action === "play") {
      p.playing = true;
      p.cancelled = false;
      try {
        let prior = p.index ? p.take.entries[p.index - 1].at : 0;
        while (!p.cancelled && p.index < p.take.entries.length) {
          const at = p.take.entries[p.index].at;
          if (a.timed)
            await new Promise((resolve) => {
              const timer = setTimeout(
                resolve,
                Math.max(0, at - prior) / Math.max(0.1, a.speed || 1),
              );
              p.wake = () => {
                clearTimeout(timer);
                resolve();
              };
            });
          p.wake = null;
          if (p.cancelled) break;
          await step();
          prior = at;
        }
      } finally {
        p.playing = false;
      }
      return this.replayState();
    }
  }
}
function describe(patches) {
  const paths = patches.map((p) => p.path);
  return paths.some((p) => p.startsWith("/diagram"))
    ? "Edit circuit"
    : paths.some((p) => p.startsWith("/controls"))
      ? "Adjust simulated inputs"
      : paths.some((p) => /^\/(p5|arduino)/.test(p))
        ? "Edit source code"
        : paths.some((p) => p.includes("/references"))
          ? "Edit scene media / notes"
          : "Edit workspace";
}
export function validateTake(t) {
  if (
    !t ||
    t.format !== "p5comp.process" ||
    t.version !== 1 ||
    !t.baseline ||
    !Array.isArray(t.entries) ||
    t.entries.length > 20000
  )
    throw Error("Invalid process recording.");
  let candidate = structuredClone(t.baseline);
  let prior = 0;
  for (const e of t.entries) {
    if (
      !["change", "command", "mark"].includes(e.kind) ||
      !Number.isFinite(e.at) ||
      e.at < prior
    )
      throw Error("Invalid process entry.");
    if (
      e.kind === "command" &&
      !["runtime", "serial", "p5comp_runtime", "p5comp_serial"].includes(e.name)
    )
      throw Error("Unsupported replay command.");
    prior = e.at;
    if (e.kind === "command") {
      const validator = validators.get(
        "p5comp_" + e.name.replace(/^p5comp_/, ""),
      );
      if (!validator?.(e.args))
        throw Error("Invalid replay command arguments.");
      if (e.name.endsWith("serial") && e.args.action !== "write")
        throw Error("Only serial writes are replayable.");
    }
    if (e.kind === "change") {
      if (!Array.isArray(e.patches)) throw Error("Invalid change entry.");
      candidate = applyPatch(candidate, e.patches);
    }
  }
  return true;
}
