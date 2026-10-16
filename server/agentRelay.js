import express from "express";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  TOOLS,
  PROTOCOL_VERSION,
  TOOL_MAP,
} from "../shared/automation/tools.js";
export function createAgentRelay({
  timeout = 120000,
  origins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
  ],
} = {}) {
  const router = express.Router(),
    token = randomBytes(32).toString("hex"),
    sessions = new Map(),
    pending = new Map();
  router.use((req, res, next) => {
    if (req.headers.origin && !origins.includes(req.headers.origin))
      return res.status(403).json({ error: "Agent API origin not allowed." });
    const host = req.headers.host || "";
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
      return res
        .status(403)
        .json({ error: "Agent API requires a loopback host." });
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/config", (_req, res) =>
    res.json({ protocolVersion: PROTOCOL_VERSION, token }),
  );
  router.use((req, res, next) => {
    const supplied = Buffer.from(
      req.headers.authorization?.replace(/^Bearer /, "") || "",
    );
    const expected = Buffer.from(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return res.status(401).json({
        error:
          "Bearer token required; obtain it locally from /api/agent/config.",
      });
    next();
  });
  router.use(express.json({ limit: "32mb" }));
  const live = () =>
    [...sessions.values()]
      .filter((s) => Date.now() - s.seen < 45000)
      .sort((a, b) => b.seen - a.seen);
  router.get("/tools", (_req, res) =>
    res.json({ tools: TOOLS, protocolVersion: PROTOCOL_VERSION }),
  );
  router.get("/sessions", (_req, res) =>
    res.json({
      sessions: live().map(({ id, title, url, workspace, seen }) => ({
        id,
        title,
        url,
        workspace,
        seen,
      })),
    }),
  );
  router.post("/register", (req, res) => {
    const { title, url, workspace } = req.body || {};
    if (typeof workspace !== "string" || typeof url !== "string")
      return res.status(400).json({ error: "workspace and url required." });
    for (const [id, s] of sessions)
      if (Date.now() - s.seen > 300000 && !s.poll) sessions.delete(id);
    if (sessions.size >= 100)
      return res.status(429).json({ error: "Too many browser sessions." });
    const id = randomUUID();
    sessions.set(id, {
      id,
      title: String(title || "p5comp").slice(0, 200),
      url: url.slice(0, 2000),
      workspace: workspace.slice(0, 300),
      seen: Date.now(),
      queue: [],
    });
    res.json({ id });
  });
  router.post("/sessions/:id/poll", (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: "Unknown session." });
    s.seen = Date.now();
    if (s.poll) s.poll.finish(null);
    if (s.queue.length) return res.json({ command: s.queue.shift() });
    const timer = setTimeout(() => finish(null), 20000);
    function finish(command) {
      if (s.poll?.finish !== finish) return;
      clearTimeout(timer);
      s.poll = null;
      if (!res.writableEnded) res.json({ command });
    }
    s.poll = { finish };
    res.on("close", () => {
      if (s.poll?.finish === finish) {
        clearTimeout(timer);
        s.poll = null;
        s.seen = 0;
      }
    });
  });
  router.post("/sessions/:id/result", (req, res) => {
    const p = pending.get(req.body?.id);
    if (!p || p.session !== req.params.id)
      return res.status(404).json({ error: "Unknown command." });
    pending.delete(req.body.id);
    clearTimeout(p.timer);
    p.resolve(req.body);
    res.json({ ok: true });
  });
  router.post("/sessions/:id/call", async (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s || Date.now() - s.seen >= 45000)
      return res
        .status(404)
        .json({ error: "Session offline. Open the p5comp workspace first." });
    const { name, arguments: args = {}, requestId } = req.body || {};
    if (!TOOL_MAP.has(name))
      return res.status(400).json({ error: "Unknown tool." });
    if (pending.size > 100)
      return res.status(429).json({ error: "Too many pending calls." });
    const id = randomUUID(),
      command = { id, name, args, requestId: requestId || id };
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        s.queue = s.queue.filter((c) => c.id !== id);
        resolve({
          error:
            "Command timed out. Outcome may be unknown; use state or the same requestId before retrying a mutation.",
        });
      }, timeout);
      pending.set(id, { session: s.id, resolve, timer });
      if (s.poll) s.poll.finish(command);
      else s.queue.push(command);
    });
    res.status(result.error ? 422 : 200).json(result);
  });
  router.close = () => {
    for (const s of sessions.values()) s.poll?.finish(null);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.resolve({ error: "Relay closed." });
    }
    pending.clear();
  };
  return router;
}
