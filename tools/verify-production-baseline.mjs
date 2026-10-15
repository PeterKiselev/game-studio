/** Fail closed unless every preserved file matches its public production bytes. */
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] || 'site');
const except = (process.argv.find(a => a.startsWith('--except=')) || '').slice('--except='.length);
if (except && except !== 'dachnye-tainy/vk/') throw new Error('Unexpected replacement scope');
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink in site');
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
const files = (await walk(root)).filter(file => !except || !relative(root, file).replaceAll('\\', '/').startsWith(except));
if (!files.length) throw new Error('Empty baseline');
const failures = [];
let cursor = 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < files.length) {
    const file = files[cursor++];
    const path = relative(root, file).replaceAll('\\', '/');
    const url = new URL(path.split('/').map(encodeURIComponent).join('/'), 'https://peterkiselev.github.io/game-studio/');
    try {
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        if (response.ok || response.status < 500) break;
      }
      if (!response.ok || hash(await response.arrayBuffer()) !== hash(await readFile(file))) failures.push(path);
    } catch { failures.push(path); }
  }
}));
if (failures.length) throw new Error('Production baseline differs; publication blocked: ' + failures.join(', '));
console.log(`Verified ${files.length} preserved production files byte-for-byte${except ? '; replacement scope: ' + except : ''}.`);
