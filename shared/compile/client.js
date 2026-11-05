import { basePath } from "../basePath.js";
import { responseJSON } from "../loadJSON.js";
import { validateCompileInput } from "./sketch.js";
export function compilerMode(settings = {}) {
  return settings.compilerMode || (settings.compiler ? "local" : "browser");
}
export async function compileSketch(
  input,
  {
    mode = "browser",
    url = basePath("api/compile"),
    progress = () => {},
    signal,
  } = {},
) {
  validateCompileInput(input);
  if (mode === "local") {
    progress("Compiling with local helper…");
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: signal || AbortSignal.timeout(120000),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw Error(
        "The optional local compiler helper could not be reached. Start it following Settings → Local helper setup, or select Browser compiler.",
      );
    }
    const result = await responseJSON(response, "Local compiler helper", {
      allowHTTPError: true,
    });
    if (!result || typeof result !== "object" || !result.ok)
      throw Error(result?.stderr || "Local compilation failed.");
    if (typeof result.hex !== "string" || !result.hex.startsWith(":"))
      throw Error("Local helper returned no valid firmware.");
    return { ...result, backend: "local" };
  }
  if (mode !== "browser")
    throw Error("Choose Browser compiler or Local helper.");
  if (!globalThis.crypto?.subtle)
    throw Error(
      "Browser compilation requires HTTPS or localhost. Open the hosted app securely, or use the local helper.",
    );
  if (typeof WebAssembly === "undefined")
    throw Error(
      "This browser does not support WebAssembly. Try a current browser or use the optional local helper.",
    );
  progress("Starting browser compiler…");
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", cancel);
      error ? reject(error) : resolve(value);
    };
    const cancel = () =>
      finish(
        Object.assign(Error("Compilation cancelled."), { name: "AbortError" }),
      );
    const timer = setTimeout(
      () =>
        finish(
          Error(
            "Browser compilation timed out. Check the connection, retry a smaller sketch, or use the optional local helper.",
          ),
        ),
      180000,
    );
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") progress(data.message);
      else if (data.type === "result") finish(null, data.result);
      else if (data.type === "error")
        finish(
          Object.assign(Error(data.message), { compilation: data.compilation }),
        );
    };
    worker.onerror = (event) =>
      finish(
        Error(
          event.message ||
            "The browser compiler could not start. Reload and retry; the local helper is also available in Settings.",
        ),
      );
    worker.postMessage({
      input,
      base: new URL(basePath("compiler/avr/"), location.href).href,
    });
  });
}
