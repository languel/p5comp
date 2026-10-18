import { validateDiagram } from './circuit.js';

async function loadHelloLED() {
  const base = import.meta.env?.BASE_URL || '/';
  const response = await fetch(`${base}examples/one-led.json`);
  if (!response.ok) throw new Error(`Could not load HelloLED (${response.status})`);
  return response.json();
}

// Public examples are fetched by URL, not imported into Vite's module graph.
// Only load the starter when there is no usable saved project.
export async function startupProject(cachedText, loadDefault = loadHelloLED) {
  try {
    const cached = JSON.parse(cachedText || 'null');
    if (cached) { validateDiagram(cached.diagram); return cached; }
  } catch {}
  const starter = await loadDefault();
  validateDiagram(starter.diagram);
  return structuredClone(starter);
}
