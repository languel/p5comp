import test from 'node:test';
import assert from 'node:assert/strict';
import {SerialConnection} from '../shared/serial/SerialConnection.js';

test('upload handoff drains pending serial writes before closing the port', async () => {
  const connection = new SerialConnection();
  let finishWrite;
  let locked = false;
  let closed = false;
  const port = {
    writable: {getWriter() { locked = true; return {
      write: () => new Promise(resolve => { finishWrite = resolve; }),
      releaseLock() { locked = false; },
    }; }},
    async close() { assert.equal(locked, false); closed = true; },
  };
  connection.port = port;
  const write = connection.write('last command');
  const release = connection.releasePort();
  await Promise.resolve();
  assert.equal(closed, false);
  await assert.rejects(connection.write('too late'), /Connect to a board/);
  finishWrite();
  await write;
  assert.equal(await release, port);
  assert.equal(closed, true);
  assert.equal(connection.port, null);
});
