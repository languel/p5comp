import test from 'node:test';
import assert from 'node:assert/strict';
import {createSerialActivity} from '../sim/serialActivity.js';
test('serial activity extends bursts independently and clears board LEDs on stop', () => {
  const pending = new Map(); let id = 0;
  const activity = createSerialActivity({schedule: fn => {pending.set(++id, fn);return id;}, cancel: id => pending.delete(id)});
  const board = {};
  activity.pulse(board, 'TX');
  activity.pulse(board, 'RX');
  activity.pulse(board, 'TX');
  assert.equal(pending.size, 2);
  assert.equal(board.ledTX, true);
  assert.equal(board.ledRX, true);
  pending.get(3)();
  assert.equal(board.ledTX, false);
  assert.equal(board.ledRX, true);
  activity.clear();
  assert.equal(board.ledRX, false);
});
