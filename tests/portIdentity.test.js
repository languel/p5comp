import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingPortName} from '../shared/serial/portIdentity.js';
test('port labels use local paths only for unambiguous USB identities',()=>{
 const info={usbVendorId:0x2341,usbProductId:0x43};
 const port={port:{address:'/dev/cu.usbmodem2101',properties:{vid:'0x2341',pid:'0x0043'}}};
 assert.equal(matchingPortName(info,[port]),'usbmodem2101');
 assert.equal(matchingPortName(info,[port,port]),null);
 assert.equal(matchingPortName({},[port]),null);
});
