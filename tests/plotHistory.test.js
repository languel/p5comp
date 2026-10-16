import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPlotSample,plotRange} from '../sim/plotHistory.js';
test('plot history trims by time, freezes duplicate frames and resets on restart',()=>{
 let h=[];for(let seconds=0;seconds<20;seconds++) h=appendPlotSample(h,{seconds,channels:[{value:seconds}]},5);
 assert.equal(h[0].time,14);assert.equal(h.length,6);
 assert.equal(appendPlotSample(h,{seconds:19},5),h);
 assert.equal(appendPlotSample(h,{seconds:0,channels:[]},5).length,1);
});
test('plot ranges handle floating streams, constant values and fixed scale',()=>{
 assert.deepEqual(plotRange([null],true,0,5),[0,5]);
 const [a,b]=plotRange([2,2],true);assert.ok(a<2&&b>2);
 assert.deepEqual(plotRange([99],false,-1,6),[-1,6]);
});
