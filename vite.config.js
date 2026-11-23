import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
  root: ".",
  base: process.env.PAGES_BASE || "/",
  plugins: [
    {
      name: "avrgirl-stk500-local-variables",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith("/avrgirl-arduino/dist/avrgirl-arduino.js")) return;
        // The bundled STK500 v1 driver assigns two undeclared `match` variables.
        // ES modules run in strict mode, so declare them in their own functions.
        return code.replace(
          /^(\s*)match = Buffer\.concat\(/gm,
          "$1var match = Buffer.concat(",
        );
      },
    },
    {
      name: "physical-p5-routes",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/ide") {
            request.url = "/miniide.html";
            return next();
          }
          if (request.url?.startsWith("/models/")) {
            const rel = decodeURIComponent(request.url.split("?")[0].slice("/models/".length));
            if (rel.includes("..")) return next();
            const filePath = path.resolve("models", rel);
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
            const stat = fs.statSync(filePath);
            const total = stat.size;
            response.setHeader("Accept-Ranges", "bytes");
            response.setHeader("Content-Type", "application/octet-stream");
            if (request.method === "HEAD") {
              response.setHeader("Content-Length", total);
              response.statusCode = 200;
              return response.end();
            }
            const range = request.headers.range;
            if (range) {
              const m = /^bytes=(\d*)-(\d*)$/.exec(range);
              if (m) {
                const start = m[1] ? Number(m[1]) : 0;
                const end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
                response.statusCode = 206;
                response.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
                response.setHeader("Content-Length", end - start + 1);
                return fs.createReadStream(filePath, { start, end }).pipe(response);
              }
            }
            response.statusCode = 200;
            response.setHeader("Content-Length", total);
            return fs.createReadStream(filePath).pipe(response);
          }
          next();
        });
      },
    },
  ],
  optimizeDeps: { include: ["@ffmpeg/ffmpeg", "@ffmpeg/ffmpeg/worker", "html-to-image"] },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/_ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/_ollama/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        app: "index.html",
        ide: "miniide.html",
        firmata: "firmata/index.html",
        sandbox: "shared/p5/sandbox.html",
        sim: "sim/index.html",
      },
    },
  },
});
