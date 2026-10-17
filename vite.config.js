import { defineConfig } from "vite";

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
        server.middlewares.use((request, _response, next) => {
          if (request.url === "/ide") request.url = "/miniide.html";
          next();
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
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
