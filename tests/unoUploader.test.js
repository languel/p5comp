import test from "node:test";
import assert from "node:assert/strict";
import { flashUno } from "../shared/serial/UnoUploader.js";

test("Uno reset leaves RTS released, retries an early missed sync, and verifies flashed bytes", async () => {
  let controller,
    address = 0,
    syncs = 0,
    closed = false;
  const flash = new Uint8Array(32768).fill(255),
    signals = [];
  const port = {
    async open() {
      this.readable = new ReadableStream({
        start(c) {
          controller = c;
        },
      });
      this.writable = new WritableStream({
        write(bytes) {
          assert.equal(bytes.at(-1), 0x20);
          const command = bytes[0];
          let payload = [];
          if (command === 0x30 && ++syncs === 1) return;
          if (command === 0x75) payload = [0x1e, 0x95, 0x0f];
          if (command === 0x55) address = (bytes[1] + bytes[2] * 256) * 2;
          if (command === 0x64) flash.set(bytes.slice(4, -1), address);
          if (command === 0x74)
            payload = Array.from(flash.slice(address, address + 128));
          controller.enqueue(Uint8Array.from([0x14, ...payload, 0x10]));
        },
      });
    },
    async setSignals(s) {
      signals.push(s);
    },
    async close() {
      closed = true;
    },
  };
  const progress = [];
  await flashUno(port, ":0400000001020304F2\n:00000001FF", (p) =>
    progress.push(p),
  );
  assert.deepEqual(signals, [
    { dataTerminalReady: false, requestToSend: false },
    { dataTerminalReady: true, requestToSend: false },
  ]);
  assert.equal(syncs, 2);
  assert.deepEqual(Array.from(flash.slice(0, 4)), [1, 2, 3, 4]);
  assert.ok(progress.includes("Verifying firmware · 100%"));
  assert.equal(closed, true);
});
