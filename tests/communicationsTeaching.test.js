import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../public/examples/'+name+'.json',import.meta.url)));
test('catalog p5 examples parse and use fixed colors',()=>{
 const catalog=read('index');
 for(const item of catalog){const p=JSON.parse(readFileSync(new URL('../public/'+item.project,import.meta.url)));for(const source of Object.values(p.p5)){new Function(source);assert.doesNotMatch(source,/window\.theme/);}}
});
test('minimal serial demo matches its standalone sources and cached firmware',()=>{
 const project=read('serial-basics');
 assert.equal(project.p5.native,readFileSync(new URL('../public/examples/serial-basics/sketch.js',import.meta.url),'utf8'));
 assert.equal(project.arduino,readFileSync(new URL('../public/examples/serial-basics/sketch.ino',import.meta.url),'utf8'));
 assert.equal(project.artifact.source,project.arduino);
 assert.equal(project.artifact.buildKey,project.arduino+'{}');
 assert.doesNotMatch(project.p5.native,/arduinoComms|p5comp communications: begin/);
});
