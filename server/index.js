import { createAgentRelay } from "./agentRelay.js";
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boards } from "../shared/boards/boards.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3001);
const maxSourceLength = 100_000;
const frontendRoot = path.resolve(directory, "../dist");

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (
    origin &&
    (origin === "https://languel.github.io" ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
  ) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  }
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});
app.use("/api/agent", createAgentRelay());
app.use(express.json({ limit: "512kb", strict: true }));

app.get("/api/serial-ports", async (_request, response) => {
  try {
    const {stdout} = await promisify(execFile)("arduino-cli", ["board", "list", "--format", "json"], {timeout: 5000, maxBuffer: 1024 * 1024});
    response.json({ports: JSON.parse(stdout).detected_ports || []});
  } catch { response.status(503).json({ports: [], error: "Local serial discovery unavailable"}); }
});

app.post("/api/compile", async (request, response) => {
  const { board: boardId, source, files = {} } = request.body ?? {};
  const board = boards[boardId];
  if (!board) {
    response
      .status(400)
      .json({ ok: false, stdout: "", stderr: "Unsupported board." });
    return;
  }
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > maxSourceLength
  ) {
    response.status(400).json({
      ok: false,
      stdout: "",
      stderr: `Source must be a non-empty string of at most ${maxSourceLength} characters.`,
    });
    return;
  }

  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    Object.keys(files).length > 30 ||
    Object.entries(files).some(
      ([name, text]) =>
        !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(ino|h|hpp|cpp|c)$/.test(name) ||
        name.includes("..") ||
        name === "StudentSketch.ino" ||
        typeof text !== "string" ||
        text.length > maxSourceLength,
    )
  ) {
    response
      .status(400)
      .json({ ok: false, stderr: "Invalid Arduino project source files." });
    return;
  }
  let root;
  try {
    root = await mkdtemp(path.join(tmpdir(), "physical-p5-"));
    const sketchDirectory = path.join(root, "StudentSketch");
    const outputDirectory = path.join(root, "build");
    await mkdir(sketchDirectory);
    await mkdir(outputDirectory);
    await writeFile(
      path.join(sketchDirectory, "StudentSketch.ino"),
      source,
      "utf8",
    );

    for (const [name, content] of Object.entries(files))
      await writeFile(path.join(sketchDirectory, name), content, "utf8");
    const result = await execute(
      process.env.ARDUINO_CLI ?? "arduino-cli",
      [
        "compile",
        "--fqbn",
        board.fqbn,
        "--output-dir",
        outputDirectory,
        sketchDirectory,
      ],
      { timeout: 120_000 },
    );
    const builtFiles = await readdir(outputDirectory);
    const hexName = builtFiles.find(
      (name) => name.endsWith(".hex") && !name.endsWith(".with_bootloader.hex"),
    );
    if (result.code !== 0 || !hexName) {
      response.status(422).json({
        ok: false,
        stdout: result.stdout,
        stderr:
          result.stderr || "Compilation failed without diagnostic output.",
      });
      return;
    }
    const hex = await readFile(path.join(outputDirectory, hexName), "utf8");
    response.json({
      ok: true,
      hex,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.message || "Arduino compilation service failed.",
    });
  } finally {
    if (root) await rm(root, { recursive: true, force: true });
  }
});

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.use((error, _request, response, _next) => {
  const status = error.status === 413 ? 413 : 400;
  response.status(status).json({
    ok: false,
    stdout: "",
    stderr:
      status === 413
        ? "Request body is too large."
        : "Request body must be valid JSON.",
  });
});
app.use(
  express.static(frontendRoot, {
    setHeaders: (response) =>
      response.setHeader("Access-Control-Allow-Origin", "*"),
  }),
);
app.get(["/ide"], async (_request, response) => {
  try {
    await access(path.join(frontendRoot, "miniide.html"));
    response.sendFile(path.join(frontendRoot, "miniide.html"));
  } catch {
    response.status(503).json({
      ok: false,
      error: "Run npm run build before starting the production server.",
    });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`p5comp API listening on http://127.0.0.1:${port}`);
});

function execute(command, args, { timeout }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(Object.assign(error, { stdout, stderr }));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === null) {
        reject(
          Object.assign(new Error("arduino-cli compile timed out."), {
            stdout,
            stderr,
          }),
        );
      } else {
        resolve({ code, stdout, stderr });
      }
    });
  });
}
