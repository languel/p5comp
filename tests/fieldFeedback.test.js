import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolveCircuit} from '../sim/circuit.js';
const project=JSON.parse(readFileSync(new URL('../public/examples/field-feedback.json',import.meta.url)));
test('two-way art demo preserves standalone sources, cached firmware, and powered sensor wiring',()=>{
 for(const [name,source] of [['sketch.js',project.p5.webserial],['sketch.ino',project.arduino],['index.html',project.workbench.files['index.html']]])
  assert.equal(source,readFileSync(new URL('../public/examples/field-feedback/'+name,import.meta.url),'utf8'));
 assert.equal(project.artifact.source,project.arduino);
 assert.equal(project.artifact.buildKey,project.arduino+'{}');
 const topology=resolveCircuit(project.diagram);
 assert.equal(topology.pots[0].powered,true);
 assert.equal(topology.pots[0].pin,14);
 assert.equal(topology.sonars[0].powered,true);
 assert.deepEqual(topology.warnings,[]);
 assert.ok(project.diagram.connections.some(c=>c[0]==='rgbled:B'&&c[1]==='uno:11'));
});
test('telemetry validates complete rows atomically and bounds history',()=>{
 const ctx=vm.createContext({window:{},p5:{prototype:{},registerAddon(){}},millis:()=>1000,console});
 vm.runInContext(project.p5.webserial,ctx);
 vm.runInContext('acceptLine("MS:123 POT0:512 DIST0:42.3 SW1:1 R:128 G:64 B:32 ACK:7")',ctx);
 assert.equal(vm.runInContext('sensor.pot',ctx),512);
 assert.equal(vm.runInContext('sensor.cm',ctx),42.3);
 assert.equal(vm.runInContext('sensor.ack',ctx),7);
 for(const row of ['MS:124 POT0:2000 DIST0:40 SW1:0 R:0 G:0 B:0 ACK:8','MS:124 POT0: DIST0:40 SW1:0 R:0 G:0 B:0 ACK:8','MS:124 POT0:512 DIST0:NaN SW1:0 R:0 G:0 B:0 ACK:8','MS:124 POT0:512 DIST0:40 SW1:3 R:0 G:0 B:0 ACK:8','MS:124 POT0:512 DIST0:40 SW1:0 R:256 G:0 B:0 ACK:8','MS:124 POT0:512 POT0:1 DIST0:40 SW1:0 R:0 G:0 B:0 ACK:8','noise'])
  vm.runInContext(`acceptLine(${JSON.stringify(row)})`,ctx);
 assert.equal(vm.runInContext('history.length',ctx),1);
 assert.equal(vm.runInContext('sensor.ack',ctx),7);
 for(let i=0;i<300;i++)vm.runInContext('acceptLine("B:0 ACK:8 SW1:0 R:0 DIST0:-1 MS:124 G:0 POT0:512 EXTRA0:42")',ctx);
 assert.equal(vm.runInContext('history.length',ctx),256);
 assert.equal(vm.runInContext('sensor.cm',ctx),-1);
});

test('spring field stays bounded and active after settling time across sensor extremes',()=>{
 const summaries=[];
 for(const [tension,rest] of [[0.05,22],[1,110]]){
  let seed=42;
  const random=(a=1,b)=>{seed=(1664525*seed+1013904223)>>>0;const n=seed/4294967296;return b===undefined?n*a:a+n*(b-a);};
  const ctx=vm.createContext({window:{},p5:{prototype:{},registerAddon(){}},millis:()=>1000,console,random,randomSeed:()=>{seed=42;},noiseSeed:()=>{},TWO_PI:Math.PI*2});
  vm.runInContext(project.p5.webserial,ctx);vm.runInContext('resetField()',ctx);
  const summary=vm.runInContext(`(()=>{
   for(let i=0;i<2400;i++)stepSprings(1/60,${tension},${rest},600,470,i/60);
   const before=agents.map(a=>[a.x,a.y]);
   for(let i=2400;i<3600;i++)stepSprings(1/60,${tension},${rest},600,470,i/60);
   return {energy,valid:agents.every(a=>[a.x,a.y,a.vx,a.vy].every(Number.isFinite)&&a.x>=.02&&a.x<=.98&&a.y>=.02&&a.y<=.98&&Math.hypot(a.vx,a.vy)<=150.001),movement:agents.reduce((n,a,i)=>n+Math.hypot(a.x-before[i][0],a.y-before[i][1]),0)/agents.length,spread:Math.max(...agents.map(a=>a.x))-Math.min(...agents.map(a=>a.x))};
  })()`,ctx);
  assert.ok(summary.valid);
  assert.ok(summary.energy>.01,'moving eddies must keep injecting energy');
  assert.ok(summary.movement>.01,'late states must still move');
  summaries.push(summary);
 }
 assert.ok(Math.abs(summaries[0].spread-summaries[1].spread)>.01,'sensor extremes should create distinct configurations');
});
