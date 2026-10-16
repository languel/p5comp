import test from 'node:test';import assert from 'node:assert/strict';
import {listCameras,cameraConstraints} from '../sim/cameraSources.js';
test('webcam picker lists camera sources and uses labels when permission reveals them',async()=>{
 const devices={enumerateDevices:async()=>[{kind:'videoinput',deviceId:'one',label:''},{kind:'audioinput',deviceId:'mic',label:'Mic'},{kind:'videoinput',deviceId:'two',label:'USB camera'}]};
 assert.deepEqual(await listCameras(devices),[{id:'one',label:'Camera 1'},{id:'two',label:'USB camera'}]);assert.deepEqual(await listCameras(null),[]);
});
test('camera selection targets an exact device and does not request audio',()=>{
 assert.deepEqual(cameraConstraints('usb'),{video:{deviceId:{exact:'usb'}},audio:false});assert.deepEqual(cameraConstraints(''),{video:true,audio:false});
});
