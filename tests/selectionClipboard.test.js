import test from 'node:test';
import assert from 'node:assert/strict';
import {copyCircuitSelection,pasteCircuitSelection} from '../sim/selectionClipboard.js';
test('copy/paste remaps IDs, internal wires, seating and groups without external hookups',()=>{
 const d={parts:[{id:'a',left:0,top:0},{id:'b',left:10,top:0},{id:'host',left:40,top:0}],connections:[['a:1','b:1','#000',[{x:5,y:0}]],['a:2','host:1','#fff']],attachments:[['b:2','a:3'],['a:4','host:2']],groups:[['a','b']]};
 const f=copyCircuitSelection(d,new Set(['a','b']));
 const p=pasteCircuitSelection(d,f);
 assert.deepEqual(p.ids,['a_2','b_2']);assert.equal(p.diagram.connections.length,3);
 assert.deepEqual(p.diagram.connections[2],['a_2:1','b_2:1','#000',[{x:25,y:20}]]);
 assert.deepEqual(p.diagram.attachments.at(-1),['b_2:2','a_2:3']);
 assert.deepEqual(p.diagram.groups.at(-1),['a_2','b_2']);assert.equal(d.parts.length,3);
 assert.equal(pasteCircuitSelection(p.diagram,f).ids[0],'a_3');
});
test('selected external wires become free ends rather than reconnecting originals',()=>{
 const d={parts:[{id:'a',left:0,top:0}],connections:[['a:1','b:1','#000']]};
 const f=copyCircuitSelection(d,new Set(),new Set([0]),new Map([['a:1',{x:0,y:0}],['b:1',{x:10,y:0}]]));
 assert.deepEqual(pasteCircuitSelection(d,f).diagram.connections.at(-1),['free:20,20','free:30,20','#000',[]]);
});
