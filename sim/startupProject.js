import helloLED from '../public/examples/one-led.json' with {type:'json'};
import {validateDiagram} from './circuit.js';
// One canonical starter: the same project students can open from Examples.
export function startupProject(cachedText) {
  try {
    const cached=JSON.parse(cachedText||'null');
    if(cached){validateDiagram(cached.diagram);return cached;}
  } catch {}
  return structuredClone(helloLED);
}
