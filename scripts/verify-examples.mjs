import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve('public/examples'),built=resolve('dist/examples');
const index=JSON.parse(readFileSync(resolve(source,'index.json'),'utf8'));
const named=new Set(index.map(e=>e.project));
for(const item of index){const name=item.project.split('/').at(-1);const original=readFileSync(resolve(source,name)),packaged=readFileSync(resolve(built,name));if(!original.equals(packaged))throw Error('Packaged demo differs: '+name);const p=JSON.parse(packaged);if(!p.diagram?.parts||typeof p.arduino!=='string'||!p.p5)throw Error('Incomplete project: '+name);}
for(const name of readdirSync(source).filter(n=>n.endsWith('.json')&&n!=='index.json'))if(!named.has('examples/'+name))throw Error('Demo missing from catalog: '+name);
if(!readFileSync(resolve(source,'index.json')).equals(readFileSync(resolve(built,'index.json'))))throw Error('Catalog not packaged');
if(!readFileSync(resolve(source,'StandardFirmata.ino')).equals(readFileSync(resolve(built,'StandardFirmata.ino'))))throw Error('StandardFirmata source not packaged');
console.log(`Verified all ${index.length} catalog demos and StandardFirmata source in dist/examples.`);
