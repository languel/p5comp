import test from 'node:test';
import assert from 'node:assert/strict';
import {outputPreview,outputReading,paintOutputPreview} from '../sim/outputPreview.js';
test('output previews are presentation states and restore measured values',()=>{
 const part={type:'wokwi-rgb-led'}, element={};const measured={ledRed:.2,ledGreen:0,ledBlue:.6};
 paintOutputPreview(element,outputPreview(part));assert.equal(element.ledGreen,1);
 paintOutputPreview(element,measured);assert.equal(element.ledGreen,0);
 assert.equal(outputReading(measured),'RGB 20/0/60%');assert.equal(measured.ledRed,.2);
 assert.equal(outputPreview({type:'wokwi-resistor'}),null);
});
