import { Worker } from "node:worker_threads";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { installSerialProxy } from "../shared/p5/serialProxy.js";
import { UnoRuntime } from "../sim/runtime.js";
import { classroomCircuit, resolveCircuit } from "../sim/circuit.js";

const hex = readFileSync(
  new URL("../public/sim/classroom.hex", import.meta.url),
  "utf8",
);
const library = readFileSync(
  new URL(
    "../node_modules/@gohai/p5.webserial/libraries/p5.webserial.js",
    import.meta.url,
  ),
  "utf8",
);
const settle = () => new Promise((resolve) => setImmediate(resolve));
function frame(send) {
  const context = vm.createContext({
    window: {},
    navigator: {},
    EventTarget,
    Event,
    DOMException,
    ReadableStream,
    WritableStream,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    console,
    setTimeout,
    clearTimeout,
    send,
  });
  const proxy = vm.runInContext(
    `(${installSerialProxy.toString()})(send)`,
    context,
  );
  return { context, proxy, serial: context.navigator.serial };
}

test("native Web Serial streams carry actual UART bytes in both directions and honor locks", async () => {
  let pending = [];
  const { proxy, serial } = frame((bytes) => runtime.write(bytes));
  const runtime = new UnoRuntime(
    hex,
    resolveCircuit(classroomCircuit()),
    { sonar: 100, pot: 512 },
    (b) => pending.push(b),
  );
  await assert.rejects(serial.requestPort(), /Start simulation/);
  proxy.setConnected(true);
  const port = await serial.requestPort();
  await port.open({ baudRate: 9600 });
  const reader = port.readable.getReader(),
    writer = port.writable.getWriter();
  await assert.rejects(port.close(), /locks/);
  runtime.advance(4000000);
  proxy.receive(pending);
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /99\.\d,512,0,0/);
  pending = [];
  await writer.write(new TextEncoder().encode("LED:1\nPING\n"));
  runtime.advance(4000000);
  proxy.receive(pending);
  assert.match(new TextDecoder().decode((await reader.read()).value), /PONG/);
  assert.equal(runtime.snapshot().led, true);
  proxy.setConnected(false);
  assert.equal((await reader.read()).done, true);
  reader.releaseLock();
  writer.releaseLock();
  await port.close();
  proxy.setConnected(true);
  await port.open({ baudRate: 9600 });
  await port.close();
});

test("unmodified p5.webserial library reads fragmented UART lines and writes LED commands", async () => {
  let pending = [];
  const { context, proxy } = frame((bytes) => runtime.write(bytes));
  const runtime = new UnoRuntime(
    hex,
    resolveCircuit(classroomCircuit()),
    { sonar: 100, pot: 512 },
    (b) => pending.push(b),
  );
  vm.runInContext("class p5 {}", context);
  vm.runInContext(library, context);
  proxy.setConnected(true);
  const port = vm.runInContext("new p5().createSerial()", context);
  port.open(9600);
  for (let i = 0; i < 30 && !port.opened(); i++) await settle();
  assert.equal(port.opened(), true);
  runtime.advance(4000000);
  proxy.receive(pending.slice(0, 5));
  await settle();
  assert.equal(port.readUntil("\n"), "");
  proxy.receive(pending.slice(5));
  await settle();
  assert.match(port.readUntil("\n"), /99\.\d,512,0,0/);
  port.println("LED:1");
  await settle();
  runtime.advance(4000000);
  assert.equal(runtime.snapshot().led, true);
  await port.close();
});

test("unmodified p5.webserial exits on host disconnect and can reconnect without starving the browser", async () => {
  const script = `const {parentPort,workerData}=require('node:worker_threads');const vm=require('node:vm');
    const installSerialProxy=(${installSerialProxy.toString()});const makeFrame=(${frame.toString()});
    (async()=>{const {context,proxy}=makeFrame(()=>{});context.console={log(){},warn(){},error(){}};
    vm.runInContext('class p5 {}',context);vm.runInContext(workerData.library,context);
    proxy.setConnected(true);const port=vm.runInContext('new p5().createSerial()',context);port.open(9600);
    for(let i=0;i<30&&!port.opened();i++)await new Promise(setImmediate);
    const initial=port.opened();proxy.setConnected(false);await new Promise(setImmediate);const disconnected=!port.opened();
    proxy.setConnected(true);port.open(9600);for(let i=0;i<30&&!port.opened();i++)await new Promise(setImmediate);
    const reconnected=port.opened();await port.close();parentPort.postMessage({initial,disconnected,reconnected});
    })().catch(error=>parentPort.postMessage({error:error.message}));`;
  const worker = new Worker(script, { eval: true, workerData: { library } });
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Serial disconnect starved the event loop."));
        worker.terminate();
      }, 2000);
      worker.once("message", (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      worker.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    assert.deepEqual(result, {
      initial: true,
      disconnected: true,
      reconnected: true,
    });
  } finally {
    await worker.terminate();
  }
});
