import { validateProject } from './validateProject.js';
import {fetchJSON} from '../shared/loadJSON.js';

async function loadHelloLED() {
  const base = import.meta.env?.BASE_URL || '/';
  return fetchJSON(`${base}examples/one-led.json`, "HelloLED starter");
}

// Public examples are fetched by URL, not imported into Vite's module graph.
// Only load the starter when there is no usable saved project.
export async function startupProject(cachedText, loadDefault = loadHelloLED) {
  try {
    const cached = JSON.parse(cachedText || 'null');
    if (cached) { validateProject(cached); return cached; }
  } catch {}
  try {
    const starter = await loadDefault();
    validateProject(starter);
    return structuredClone(starter);
  } catch (error) {
    // Keep the editor usable when the starter asset is unavailable.
    return {
      version: 2, diagram: {version: 1, parts: [], connections: []},
      arduino: "void setup() {}\nvoid loop() {}\n",
      api: "none", p5: {none: "function setup() { createCanvas(400, 240); background(240); }"},
      workbench: {name: "Untitled"},
      startupWarning: `${error.message || "Starter could not load."} Open a saved project or retry Examples; an empty workspace is ready.`,
    };
  }
}
