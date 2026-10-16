// Exécuté après `next build` : injecte la liste des fichiers de out/ dans out/sw.js.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const OUT = 'out';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(OUT);

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const urls = files
  .map((f) => '/' + relative(OUT, f).split('\\').join('/'))
  .filter((u) => u !== '/sw.js' && !u.endsWith('.map') && !/\/(404|_not-found)\//.test(u))
  .map((u) => (u.endsWith('/index.html') ? u.slice(0, -'index.html'.length) : u))
  .map((u) => BASE + u)
  .sort();

const version = createHash('sha1').update(urls.join('\n')).digest('hex').slice(0, 10);
const sw = readFileSync(join(OUT, 'sw.js'), 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls));
writeFileSync(join(OUT, 'sw.js'), sw);
console.log(`sw.js : ${urls.length} fichiers précachés (version ${version})`);
