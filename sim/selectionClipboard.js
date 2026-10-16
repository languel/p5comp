import {freePoint,freeEnd} from './partGeometry.js';
export function copyCircuitSelection(diagram, ids, wires=new Set(), pins=new Map()) {
  const selected=new Set(ids);
  const endpoint=end=>selected.has(end.split(':')[0])||freePoint(end)?end:pins.has(end)?freeEnd(pins.get(end)):null;
  const connections=diagram.connections.filter((c,i)=>wires.has(i)||c.slice(0,2).every(e=>selected.has(e.split(':')[0]))).map(c=>[endpoint(c[0]),endpoint(c[1]),...structuredClone(c.slice(2))]).filter(c=>c[0]&&c[1]);
  return {parts:structuredClone(diagram.parts.filter(p=>selected.has(p.id))),connections,attachments:structuredClone((diagram.attachments||[]).filter(c=>c.every(e=>selected.has(e.split(':')[0])))),groups:(diagram.groups||[]).map(g=>g.filter(id=>selected.has(id))).filter(g=>g.length>1)};
}
export function pasteCircuitSelection(diagram, fragment, offset={x:20,y:20}) {
  const next=structuredClone(diagram), ids=new Map(), used=new Set(next.parts.map(p=>p.id));
  for(const p of fragment.parts){let n=2,id=p.id+'_'+n;while(used.has(id))id=p.id+'_'+ ++n;used.add(id);ids.set(p.id,id);next.parts.push({...structuredClone(p),id,left:p.left+offset.x,top:p.top+offset.y});}
  const end=e=>{const q=freePoint(e);if(q)return freeEnd({x:q.x+offset.x,y:q.y+offset.y});const colon=e.indexOf(':');return ids.get(e.slice(0,colon))+e.slice(colon);};
  const wireStart=next.connections.length;
  for(const c of fragment.connections)next.connections.push([end(c[0]),end(c[1]),c[2],(c[3]||[]).map(p=>({x:p.x+offset.x,y:p.y+offset.y}))]);
  next.attachments=[...(next.attachments||[]),...(fragment.attachments||[]).map(c=>c.map(end))];
  next.groups=[...(next.groups||[]),...(fragment.groups||[]).map(g=>g.map(id=>ids.get(id)))];
  return {diagram:next,ids:[...ids.values()],wires:fragment.connections.map((_,i)=>wireStart+i)};
}
