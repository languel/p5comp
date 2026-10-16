import test from 'node:test';import assert from 'node:assert/strict';
import {startupProject} from '../sim/startupProject.js';
test('fresh and invalid caches start with complete HelloLED project',()=>{
 for(const cache of [null,'null','bad','{"diagram":{}}']){const p=startupProject(cache);assert.equal(p.workbench.name,'HelloLED');assert.equal(p.diagram.parts.length,2);assert.ok(p.artifact.hex);assert.equal(p.diagram.attachments.length,2);assert.ok(p.arduino.includes('LED'));assert.ok(p.p5.webserial);}
 const a=startupProject(null);a.diagram.parts=[];assert.equal(startupProject(null).diagram.parts.length,2);
});
test('saved project is restored rather than replaced',()=>{const p=startupProject(null);p.workbench.name='My lesson';p.arduino='// saved';assert.deepEqual(startupProject(JSON.stringify(p)),p);});
