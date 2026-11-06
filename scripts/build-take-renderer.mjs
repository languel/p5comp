// Reuse AMS's actual drawing renderer in portable lessons; no copied drawing algorithms.
import { build } from "esbuild";
import { resolve } from "node:path";
const source =
  process.env.AMS_DIR || resolve(process.env.HOME, "dev/artistmodelstudio");
await build({
  stdin: {
    contents: `
    import { renderFrame } from './src/process/takeRender.js';
    import { installLines } from './src/process/brushes.js';
    import { flatClips } from './src/process/take.js';
    export function prepare(take) {
      installLines(take.baseline);
      for (const c of flatClips(take)) if (c.diff) installLines({ brushes: c.diff.brushes || {}, lines: c.diff.lines || {} });
    }
    export { renderFrame };
  `,
    resolveDir: source,
  },
  bundle: true,
  format: "iife",
  globalName: "AMSDrawingRenderer",
  minify: true,
  outfile: "public/vendor/ams-editor/take-renderer.js",
});
