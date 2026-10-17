import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const source = resolve('public/vendor/ams-editor');
const built = resolve('dist/vendor/ams-editor');
const files = readdirSync(source, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => relative(source, resolve(entry.parentPath || entry.path, entry.name)));
for (const required of ['embed.html', 'ams-editor.js', 'VERSION'])
  if (!files.includes(required)) throw Error('Missing packaged Poliplan file: ' + required);
const html = readFileSync(resolve(source, 'embed.html'), 'utf8');
for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g))
  if (!files.includes(path)) throw Error('Missing Poliplan dependency: ' + path);
for (const path of files)
  if (!readFileSync(resolve(source, path)).equals(readFileSync(resolve(built, path))))
    throw Error('Poliplan build differs: ' + path);
console.log(`Verified ${files.length} Poliplan files in dist/vendor/ams-editor.`);
