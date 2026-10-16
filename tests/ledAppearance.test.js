import test from 'node:test';
import assert from 'node:assert/strict';
import {rgbAppearance} from '../sim/ledAppearance.js';
test('RGB presentation boosts emission without changing hue ratios or input values',()=>{
 const state={ledRed:.2,ledGreen:.1,ledBlue:0};
 const display=rgbAppearance(state);
 assert.equal(display.color,'rgb(255, 128, 0)');
 assert.ok(display.intensity>.2 && display.intensity<=1);
 assert.equal(state.ledRed,.2);
 assert.equal(rgbAppearance({}).intensity,0);
});
