import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawingBoard } from '../sim/DrawingBoard.js';
function board() {
  const b = Object.create(DrawingBoard.prototype);
  b.active = false; b.tab = false;
  b.setActive = value => { b.active = value; };
  return b;
}
test('D toggles the drawing both ways and Alt+Z remains available', () => {
  const b=board();
  assert.equal(b.key({code:'KeyD'}),true); assert.equal(b.active,true);
  b.key({code:'KeyD'}); assert.equal(b.active,false);
  b.key({code:'KeyZ',alt:true}); assert.equal(b.active,true);
});
test('drawing shortcut leaves text, browser modifiers, repeats, and Draw tab alone', () => {
  for (const extra of [{repeat:true},{metaKey:true},{ctrl:true},{alt:true},{defaultPrevented:true},{target:{closest:()=>true}}]) {
    const b=board(); assert.equal(b.key({code:'KeyD',...extra}),false); assert.equal(b.active,false);
  }
  const b=board();b.tab=true;assert.equal(b.key({code:'KeyD'}),false);
});
