import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const helloLED=JSON.parse(readFileSync(new URL('../public/examples/one-led.json',import.meta.url),'utf8'));
const loadDefault=async()=>helloLED;
import {startupProject} from '../sim/startupProject.js';
test('fresh and invalid caches start with complete HelloLED project',async()=>{
 for(const cache of [null,'null','bad','{"diagram":{}}']){const p=await startupProject(cache,loadDefault);assert.equal(p.workbench.name,'HelloLED');assert.equal(p.diagram.parts.length,2);assert.ok(p.artifact.hex);assert.equal(p.diagram.attachments.length,2);assert.ok(p.arduino.includes('LED'));assert.ok(p.p5.webserial);}
 const a=await startupProject(null,loadDefault);a.diagram.parts=[];assert.equal((await startupProject(null,loadDefault)).diagram.parts.length,2);
});
test('saved project is restored rather than replaced',async()=>{const p=await startupProject(null,loadDefault);p.workbench.name='My lesson';p.arduino='// saved';assert.deepEqual(await startupProject(JSON.stringify(p),()=>{throw Error("Saved projects must not fetch the starter");}),p);});
test('missing or invalid starter leaves a usable workspace with a recovery notice',async()=>{
 for(const load of [async()=>{throw Error('HelloLED returned a web page instead of JSON.');},async()=>({diagram:{bad:true}})]){
  const p=await startupProject(null,load);assert.equal(p.workbench.name,'Untitled');assert.deepEqual(p.diagram.parts,[]);assert.match(p.startupWarning,/empty workspace/);assert.match(p.arduino,/void setup/);
 }
});
