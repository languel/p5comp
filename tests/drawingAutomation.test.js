import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingCommand } from '../sim/automation/drawing.js';
import { TOOL_MAP } from '../shared/automation/tools.js';
function harness() {
  let doc = { elements: [] };
  const saved = [];
  const drawing = {
    start: async () => {}, remember: r => { drawing.doc = r.document; },
    setActive: v => { drawing.active = v; }, applyUI: async () => {},
    assetNames: n => n, addAsset: async (...a) => saved.push(a),
    editor: {
      getDocument: async () => ({ rev: 1, document: doc }),
      load: async d => { doc = d; }, listTools: async () => [{ name: 'ams_add' }],
      callTool: async () => { doc.elements.push({ id: 'mark' }); return { added: true }; },
      export: async () => ({ text: '<svg/>' }),
    },
  };
  return { drawing, saved };
}
test('drawing tools are discoverable and Draw is a main view', () => {
  assert.ok(TOOL_MAP.has('p5comp_drawing'));
  assert.ok(TOOL_MAP.get('p5comp_view').inputSchema.properties.main.enum.includes('draw'));
});
test('native calls persist fresh documents and unknown calls fail', async () => {
  const { drawing } = harness();
  await drawingCommand(drawing, { action: 'call', name: 'ams_add' });
  assert.equal(drawing.doc.elements[0].id, 'mark');
  await assert.rejects(drawingCommand(drawing, { action: 'call', name: 'eval' }), /Unknown/);
  await drawingCommand(drawing, { action: 'load', document: { elements: [] } });
  assert.deepEqual(drawing.doc.elements, []);
});
test('exports become project assets and absent editor is explicit', async () => {
  const { drawing, saved } = harness();
  const result = await drawingCommand(drawing, { action: 'export', format: 'svg' });
  assert.equal(result.name, 'drawing.svg');
  assert.equal(saved[0][1].type, 'image/svg+xml');
  await assert.rejects(drawingCommand({ start: async () => {} }, { action: 'get' }), /not installed/);
});
