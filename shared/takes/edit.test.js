import test from 'node:test';
import assert from 'node:assert/strict';
import { diffText,stateAt,validateTake } from './take.js';
import { ensureSections,cut,ripple,trimSection,duplicateSection,steps,overdub,EditHistory } from './edit.js';
function recording(){return {type:'ams-take',version:1,title:'Edit test',duration:9000,meta:{p5comp:{state:{files:{'sketch.js':'a'},diagram:{parts:[],connections:[]},signals:{},controls:{},page:{activeView:'circuit'}}}},tracks:[],clips:[
 {id:'one',track:'code',file:'sketch.js',diff:diffText('a','a\nb'),start:500,dur:1},
 {id:'two',track:'code',file:'sketch.js',diff:diffText('a\nb','a\nb\nc'),start:4000,dur:1},
 {id:'part',track:'circuit',diff:{parts:[{id:'led',type:'wokwi-led'}]},start:6000,dur:1},
 {id:'view',track:'page',diff:{activeView:'p5'},controls:{pot:500},start:7000,dur:1}
]};}
test('cuts apply boundary edits once and moving sections preserves independent starting states',()=>{
 const original=recording(),split=cut(original,4000);assert.equal(split.clips.length,2);
 assert.equal(stateAt(split,3999).files['sketch.js'],'a\nb');assert.equal(stateAt(split,4000).files['sketch.js'],'a\nb\nc');
 const moved=ripple(split,split.clips.map(c=>c.id).reverse());assert.equal(stateAt(moved,0).files['sketch.js'],'a\nb\nc');
 assert.equal(stateAt(moved,5000).files['sketch.js'],'a');assert.equal(stateAt(moved,5500).files['sketch.js'],'a\nb');
 assert.equal(original.clips[0].start,500);validateTake(moved);
});
test('nested cuts preserve intermediate section anchors; trim and duplicate remain seekable',()=>{
 let t=cut(cut(recording(),4000),6500);assert.equal(t.clips.length,3);const rearranged=ripple(t,[t.clips[2].id,t.clips[0].id,t.clips[1].id]);
 assert.equal(stateAt(rearranged,0).diagram.parts.length,1);assert.equal(stateAt(rearranged,2500).diagram.parts.length,0);
 const dup=duplicateSection(rearranged,rearranged.clips[0].id);assert.equal(dup.clips.length,4);
 const trimmed=trimSection(dup,dup.clips[0].id,500,2000);assert.equal(trimmed.clips[0].dur,1500);assert.equal(stateAt(trimmed,0).page.activeView,'p5');
});
test('steps replace long pauses with before/after states and preserve the final source and circuit',()=>{
 const t=steps(recording(),1000);assert.equal(t.duration,4000);assert.equal(stateAt(t,0).files['sketch.js'],'a');assert.equal(stateAt(t,300).files['sketch.js'],'a\nb');
 assert.equal(stateAt(t,3999).files['sketch.js'],'a\nb\nc');assert.equal(stateAt(t,3999).page.activeView,'p5');assert.equal(stateAt(t,3999).controls.pot,500);
});
test('replacement passes preserve the original and restore the tail after the overdub',()=>{
 const base=recording(),pass=recording();pass.duration=1000;pass.meta.p5comp.state=stateAt(base,1000);pass.clips=[{id:'new',track:'code',file:'sketch.js',diff:diffText('a\nb','overdub'),start:200,dur:1}];
 const out=overdub(base,pass,1000,3000);assert.equal(stateAt(out,1200).files['sketch.js'],'overdub');assert.equal(stateAt(out,2000).files['sketch.js'],'a\nb');assert.equal(base.clips.length,4);
});
test('timeline undo and redo restore independent copies and discard the redo branch on new edits',()=>{
 const history=new EditHistory();history.reset(recording());history.push(ensureSections(recording()));assert.equal(history.undo().clips[0].track,'code');assert.equal(history.redo().clips[0].track,'comp');
 history.undo();history.push(steps(recording()));assert.equal(history.redo(),null);
});
