import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {embedComms} from '../sim/commsCode.js';

for (const major of [1, 2]) {
  test(`p5 ${major} copied sketch provides an explicit Connect button`, async () => {
    const hooks = {}, buttons = [];
    const p5 = function() {};
    if (major === 2) p5.registerAddon = addon => addon(p5, p5.prototype, hooks);
    else p5.prototype.registerMethod = (name, callback) => {hooks[name] = callback;};
    const device = {async open(){}, readable:{getReader(){return {read:()=>new Promise(()=>{}),cancel:async()=>{},releaseLock(){}};}},writable:{getWriter(){return {write:async()=>{},releaseLock(){}};}}};
    let selections = 0;
    const context = {p5, console, TextEncoder, TextDecoder, setTimeout,
      navigator:{serial:{requestPort:async()=>{selections++;return device;}}},
      document:{addEventListener(){},removeEventListener(){},createElement:()=>({style:{},setAttribute(){},append(...children){this.children=children;}}),body:{append:b=>buttons.push(b)}}};
    context.window = context;
    vm.runInNewContext(embedComms('function setup(){}', 'native'), context);
    (hooks.postsetup || hooks.afterSetup).call({});
    assert.equal(selections, 0);
    assert.equal(context.arduinoComms.connectButton.textContent, 'Connect Arduino');
    await context.arduinoComms.connectButton.onclick();
    assert.equal(selections, 1);
    assert.equal(context.arduinoComms.connected, true);
    assert.equal(context.arduinoComms.connectButton.textContent, 'Disconnect Arduino');
  });
}

test('host-managed webserial uses captured class and does not await its lifetime read loop', async () => {
  const hooks = {};
  const p5 = function() {};
  p5.registerAddon = addon => addon(p5, p5.prototype, hooks);
  class WebSerial {
    async selectPort() {}
    start(){this.open = true;return new Promise(()=>{});}
    opened(){return this.open;}
    readUntil(){return '';}
  }
  p5.prototype.WebSerial = WebSerial;
  const context = {p5, console, setTimeout, navigator:{serial:{}}, p5compHostSerial:true, serialConnected:false};
  context.window = context;
  vm.runInNewContext(embedComms('function setup(){}', 'webserial'), context);
  // p5 2 may wrap exposed prototype functions, including the library's class.
  p5.prototype.WebSerial = () => {throw new Error('wrapped class');};
  hooks.postsetup.call({});
  await context.arduinoComms.connect();
  assert.equal(context.arduinoComms.connected, true);
});

function standaloneFixture(serial) {
  const hooks = {}, roots = [], errors = [];
  const p5 = function() {};
  p5.registerAddon = addon => addon(p5, p5.prototype, hooks);
  const context = {p5, TextEncoder, TextDecoder, setTimeout,
    console:{error:error=>errors.push(error)}, navigator:{serial},
    document:{addEventListener(){},removeEventListener(){},createElement:()=>({style:{},setAttribute(){},append(...children){this.children=children;}}),body:{append:root=>roots.push(root)}}};
  context.window=context;
  vm.runInNewContext(embedComms('function setup(){}', 'native'), context);
  hooks.postsetup.call({});
  return {comms:context.arduinoComms, button:context.arduinoComms.connectButton,status:roots[0].children[1],errors};
}

test('unsupported serial browsers get an explanation instead of an undefined API exception', async () => {
  const {comms,button,status}=standaloneFixture(undefined);
  assert.equal(button.disabled,true);
  assert.match(status.textContent,/Safari is not supported/);
  await assert.rejects(comms.connect(),/USB serial is unavailable/);
});

test('port chooser cancellation is quiet and immediately retryable', async () => {
  const {button,status,errors}=standaloneFixture({requestPort:async()=>{throw Object.assign(new Error('cancelled'),{name:'NotFoundError'});}});
  await button.onclick();
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Connect Arduino');
  assert.match(status.textContent,/No port selected/);
  assert.equal(errors.length,0);
});

test('native reader handles recurring serial packets without an instrumented lifetime loop', async () => {
  const {comms}=standaloneFixture({});
  let count=0;
  const received=[];
  comms.connected=true;
  comms.reader={read:async()=>++count<=1000 ? {value:count,done:false}:{done:true}};
  await comms.readBytes(value=>received.push(value));
  assert.equal(received.length,1000);
  assert.equal(received.at(-1),1000);
  assert.equal(comms.connected,false);
  assert.doesNotMatch(embedComms('function setup(){}','native'),/while\s*\(this\.connected\)/);
});

for (const localAvailable of [true,false]) {
  test(`webserial loader ${localAvailable ? 'uses local copy' : 'falls back from local to CDN'} without HTML edits`, async () => {
    const hooks={}, requested=[];
    const p5=function(){};
    p5.registerAddon=addon=>addon(p5,p5.prototype,hooks);
    class SerialReader {async selectPort(){} start(){this.open=true;return new Promise(()=>{});}opened(){return this.open;}}
    const context={p5,console,setTimeout,clearTimeout,navigator:{serial:{requestPort:async()=>({})}},document:{
      createElement:()=>({remove(){}}),
      head:{append(script){requested.push(script.src);if(script.src.startsWith('./')&&!localAvailable)script.onerror();else{p5.prototype.WebSerial=SerialReader;script.onload();}}}
    }};
    context.window=context;
    vm.runInNewContext(embedComms('function setup(){}','webserial'),context);
    await context.arduinoComms.connect();
    assert.equal(requested[0],'./p5.webserial.js');
    assert.equal(requested.length,localAvailable?1:2);
    if(!localAvailable)assert.match(requested[1],/^https:\/\/cdn.jsdelivr.net\//);
    assert.equal(context.arduinoComms.connected,true);
  });
}

async function configurableFixture({granted=[],autoConnect=false,controls='always'}={}) {
 const hooks={},events=new Map();let prompts=0,opens=0;
 const p5=function(){};p5.registerAddon=addon=>addon(p5,p5.prototype,hooks);
 const port={async open(){opens++;},readable:{getReader:()=>({read:()=>new Promise(()=>{})})},writable:{getWriter:()=>({})}};
 const context={p5,console,setTimeout,TextEncoder,TextDecoder,navigator:{serial:{getPorts:async()=>granted.map(()=>port),requestPort:async()=>{prompts++;return port;}}},document:{
 addEventListener:(type,handler)=>events.set(type,handler),removeEventListener(){},
 createElement:()=>({style:{},setAttribute(){},append(){},contains(){return false;},remove(){}}),body:{append(){}}}};
 context.window=context;
 const source=embedComms('function setup(){}','native').replace('SERIAL_AUTO_CONNECT = false','SERIAL_AUTO_CONNECT = '+autoConnect).replace("SERIAL_CONTROLS = 'always'",`SERIAL_CONTROLS = '${controls}'`);
 vm.runInNewContext(source,context);hooks.postsetup.call({});
 await new Promise(resolve=>setImmediate(resolve));
 return {comms:context.arduinoComms,events,prompts:()=>prompts,opens:()=>opens};
}

test('auto-connect uses one previously permitted port without opening a chooser',async()=>{
 const f=await configurableFixture({granted:[{}],autoConnect:true});
 assert.equal(f.opens(),1);assert.equal(f.prompts(),0);assert.equal(f.comms.connected,true);
 for(const granted of [[],[{},{}]]){const f=await configurableFixture({granted,autoConnect:true});assert.equal(f.opens(),0);assert.equal(f.prompts(),0);}
});
test('connected controls reveal on hover or shortcut and stay visible while disconnected',async()=>{
 const f=await configurableFixture({controls:'hover'});const controls=f.comms.connectControls;
 assert.equal(controls.style.opacity,'1');
 f.comms.connected=true;f.comms.updateControls();assert.equal(controls.style.opacity,'0');
 controls.onmouseenter();assert.equal(controls.style.opacity,'1');controls.onmouseleave();assert.equal(controls.style.opacity,'0');
 f.events.get('keydown')({altKey:true,shiftKey:true,code:'KeyS',target:{},preventDefault(){}});assert.equal(controls.style.opacity,'1');
 f.events.get('keydown')({altKey:true,shiftKey:true,code:'KeyS',target:{},preventDefault(){}});assert.equal(controls.style.opacity,'0');
});

test('shortcut can reveal hidden controls and hide always-visible controls once connected',async()=>{
 for(const mode of ['hidden','always']){
  const f=await configurableFixture({controls:mode});f.comms.connected=true;f.comms.updateControls();
  const controls=f.comms.connectControls;
  assert.equal(controls.style.opacity,mode==='hidden'?'0':'1');
  f.events.get('keydown')({altKey:true,shiftKey:true,code:'KeyS',target:{},preventDefault(){}});
  assert.equal(controls.style.opacity,mode==='hidden'?'1':'0');
 }
});
