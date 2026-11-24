import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawingBoard } from '../sim/DrawingBoard.js';
import {
  PHYSICS_BODY_TOOLS,
  PHYSICS_JOINT_TOOLS,
  resolvePhysicsShortcut,
  resolveCircuitShortcut,
} from '../sim/toolbarShortcuts.js';
import { MECHANISM_PRESETS } from '../sim/physics/mechanisms.js';
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
test('M/J/+ select physics tools, Shift+M/Shift+J/Shift+= cycle submenus, and A/W trigger circuit actions', () => {
  const presetIds = MECHANISM_PRESETS.map(m => m.id);
  // J selects current joint; Shift+J cycles through all joint submenu options
  let activeJointTool = 'hinge';
  assert.deepEqual(resolvePhysicsShortcut({ code: 'KeyJ', shiftKey: false }, { activeJointTool }), {
    kind: 'joint', tool: 'hinge', cycled: false,
  });
  const seenJoints = [activeJointTool];
  for (let i = 1; i < PHYSICS_JOINT_TOOLS.length; i++) {
    const res = resolvePhysicsShortcut({ code: 'KeyJ', shiftKey: true }, { activeJointTool });
    assert.equal(res.cycled, true);
    activeJointTool = res.tool;
    seenJoints.push(activeJointTool);
  }
  assert.deepEqual(seenJoints, PHYSICS_JOINT_TOOLS);
  assert.equal(resolvePhysicsShortcut({ code: 'KeyJ', shiftKey: true }, { activeJointTool }).tool, PHYSICS_JOINT_TOOLS[0]);

  // M selects current body brush; Shift+M cycles through all body submenu options
  assert.deepEqual(resolvePhysicsShortcut({ code: 'KeyM', shiftKey: false }, { activeBodyTool: 'link' }), {
    kind: 'body', tool: 'link', cycled: false,
  });
  assert.deepEqual(resolvePhysicsShortcut({ code: 'KeyM', shiftKey: true }, { activeBodyTool: 'link' }), {
    kind: 'body', tool: PHYSICS_BODY_TOOLS[(PHYSICS_BODY_TOOLS.indexOf('link') + 1) % PHYSICS_BODY_TOOLS.length], cycled: true,
  });

  // + activates mechanism stamp; pressing Shift+= again while in stamp mode cycles presets
  assert.deepEqual(resolvePhysicsShortcut({ code: 'Equal', key: '+', shiftKey: true }, { presetIds, inStampMode: false }), {
    kind: 'stamp', presetId: presetIds[0], cycled: false,
  });
  assert.deepEqual(resolvePhysicsShortcut({ code: 'Equal', key: '+', shiftKey: true }, { presetIds, activeStampPresetId: presetIds[0], inStampMode: true }), {
    kind: 'stamp', presetId: presetIds[1], cycled: true,
  });

  // Circuit toolbar shortcuts A (Add) and W (Wire)
  assert.deepEqual(resolveCircuitShortcut({ code: 'KeyA', shiftKey: false }), { kind: 'add' });
  assert.deepEqual(resolveCircuitShortcut({ code: 'KeyW', shiftKey: false }), { kind: 'wire' });
  assert.equal(resolveCircuitShortcut({ code: 'KeyA', metaKey: true }), null);
});
