import test from 'node:test';
import assert from 'node:assert/strict';
import {SerialMonitor} from '../sim/SerialMonitor.js';
function monitor(){
 const element=()=>({textContent:'',title:'',setAttribute(k,v){this[k]=v;}});
 const log={...element(),scrollHeight:1000,clientHeight:100,scrollTop:900};
 const pause=element(),latest=element(),feed=element();
 return {m:new SerialMonitor(log,{pause,latest,feed}),log,pause,latest,feed};
}
test('latest keeps exactly two rows with independent RX and TX packets',()=>{
 const {m,log}=monitor();m.append('← POT0:123');m.append('→ R:255');m.append('← POT0:456');
 assert.equal(log.textContent,'⇥ RX: POT0:456\n⇤ TX: R:255');
});
test('pause freezes both modes while buffering; resume shows new data',()=>{
 const {m,log,pause,feed}=monitor();m.append('← POT0:123');pause.onclick();m.append('← POT0:456');
 assert.equal(log.textContent,'⇥ RX: POT0:123\n⇤ TX: ');
 feed.onclick();assert.equal(log.textContent,'← POT0:123');
 log.scrollTop=12;m.append('→ R:255');assert.equal(log.scrollTop,12);
 pause.onclick();assert.equal(log.textContent,'← POT0:123\n← POT0:456\n→ R:255');
});
test('feed buffer stays bounded and clear returns to live',()=>{
 const {m,pause,log,feed}=monitor();feed.onclick();pause.onclick();for(let i=0;i<550;i++)m.append('← POT0:'+i);
 assert.equal(m.rows.length,500);m.clear();assert.equal(log.textContent,'');assert.equal(m.paused,false);
});
