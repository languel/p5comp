import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSketch,webserialSketch,upgradeClassSketchTheme} from '../sim/examples.js';
test('stock demos migrate to fixed colors without altering serial or drawing logic',()=>{
 const old='// A real serial message controls the drawing\nfunction draw(){const dark = window.theme === "dark"; background(dark ? "#222222" : "#fafafa"); circle(10,20,30);}\nconst studentThreshold=37;';
 const updated=upgradeClassSketchTheme(old);
 assert.doesNotMatch(updated,/window.theme|const dark/);
 assert.match(updated,/background\("#fafafa"\)/);
 assert.match(updated,/circle\(10,20,30\)/);
 assert.match(updated,/studentThreshold=37/);
 new Function(updated);
 assert.equal(upgradeClassSketchTheme(updated),updated);
});
test('color migration leaves custom artwork and current stock sketches alone',()=>{
 const custom='function draw(){background(window.theme === "dark" ? "#222" : "#fff")}';
 assert.equal(upgradeClassSketchTheme(custom),custom);
 for(const source of [nativeSketch,webserialSketch]){
 assert.doesNotMatch(source,/window.theme|var\(--ui/);
 assert.equal(upgradeClassSketchTheme(source),source);
 }
});
