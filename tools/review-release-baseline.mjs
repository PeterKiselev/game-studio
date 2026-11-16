// Exercise the production guard offline, including negative controls. No live requests.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const source = await readFile(resolve(process.argv[2] || '.release-checkers-2048', 'tools/verify-production-baseline.mjs'), 'utf8');
const root = await mkdtemp(join(tmpdir(), 'release-baseline-'));
const originalArgv = process.argv, originalFetch = globalThis.fetch;
let sequence = 0, mismatch = false;
const seen = [];
globalThis.fetch = async url => { seen.push(String(url)); return new Response(mismatch ? 'changed' : 'preserved'); };
async function run(except='') {
 process.argv = ['node', 'guard', root, ...(except ? ['--except='+except] : [])];
 return import('data:text/javascript;base64,'+Buffer.from(source+`\n// case ${sequence++}`).toString('base64'));
}
try {
 await writeFile(join(root,'index.html'),'preserved');
 for(const scope of ['dachnye-tainy','durak','checkers','2048']) {
  await mkdir(join(root,scope));await writeFile(join(root,scope,'index.html'),'replacement');
 }
 await run('dachnye-tainy/,durak/,checkers/,2048/');
 assert.equal(seen.length,1);assert.ok(seen[0].endsWith('/index.html'));
 mismatch=true;
 await assert.rejects(run('dachnye-tainy/,durak/,checkers/,2048/'),/Production baseline differs/);
 await assert.rejects(run('sudoku/'),/Unexpected replacement scope/);
 await assert.rejects(run('checkers'),/Unexpected replacement scope/);
 await assert.rejects(run('checkers/../'),/Unexpected replacement scope/);
 console.log('PASS baseline guard: explicit scopes, protected-file mismatch, unknown/malformed scopes');
} finally {
 process.argv=originalArgv;globalThis.fetch=originalFetch;
 await rm(root,{recursive:true,force:true});
}
