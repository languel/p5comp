// Refresh both p5 runtimes and the p5.webserial compatibility copy.
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {tokenizer} from 'acorn';
await copyFile('node_modules/p5/lib/p5.min.js', 'public/libraries/p5.min.js');
await copyFile('node_modules/p5-v1/lib/p5.min.js', 'public/libraries/p5-v1.min.js');
const source = await readFile('node_modules/@gohai/p5.webserial/libraries/p5.webserial.js', 'utf8');
// p5 2's name checker also scans library-local bindings. Keep p5.byte unshadowed.
const replacements = [...tokenizer(source, {ecmaVersion: 'latest'})]
  .filter(token => token.type.label === 'name' && ['byte', 'str', 'filter'].includes(token.value));
let patched = source;
for (const token of replacements.reverse()) patched = patched.slice(0, token.start) + ({byte:'serialByte',str:'serialText',filter:'usbPortFilter'}[token.value]) + patched.slice(token.end);
await writeFile('public/libraries/p5.webserial.js', patched);
