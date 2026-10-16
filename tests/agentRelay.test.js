import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createAgentRelay } from "../server/agentRelay.js";
test("relay enforces loopback/origin/auth and isolates sessions, results and timeouts", async () => {
  const app = express(),
    relay = createAgentRelay({ timeout: 100 });
  app.use("/api/agent", relay);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/agent`;
  const req = (p, body, headers = {}) =>
    fetch(base + p, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal(
      (await req("/config", null, { Origin: "https://untrusted.example" }))
        .status,
      403,
    );
    const badHost = await new Promise((resolve) =>
      http.get(
        base + "/config",
        { headers: { Host: "attacker.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ),
    );
    assert.equal(badHost, 403);
    assert.equal((await req("/sessions")).status, 401);
    const { token } = await (await req("/config")).json();
    const headers = { Authorization: "Bearer " + token };
    const a = (
      await (
        await req(
          "/register",
          { url: "http://127.0.0.1/", workspace: "a" },
          headers,
        )
      ).json()
    ).id;
    const b = (
      await (
        await req(
          "/register",
          { url: "http://127.0.0.1/", workspace: "b" },
          headers,
        )
      ).json()
    ).id;
    const waiting = req(`/sessions/${a}/poll`, {}, headers);
    const call = req(`/sessions/${a}/call`, { name: "p5comp_state" }, headers);
    const { command } = await (await waiting).json();
    assert.equal(command.name, "p5comp_state");
    assert.equal(
      (
        await req(
          `/sessions/${b}/result`,
          { id: command.id, result: "wrong" },
          headers,
        )
      ).status,
      404,
    );
    await req(
      `/sessions/${a}/result`,
      { id: command.id, result: { revision: 2 } },
      headers,
    );
    assert.deepEqual((await (await call).json()).result, { revision: 2 });
    assert.equal(
      (await req(`/sessions/${b}/call`, { name: "p5comp_state" }, headers))
        .status,
      422,
    );
    assert.equal(
      (await req(`/sessions/unknown/call`, { name: "p5comp_state" }, headers))
        .status,
      404,
    );
  } finally {
    relay.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
