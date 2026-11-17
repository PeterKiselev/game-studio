// Offline negative controls for the release guard, including nested VK paths.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const source=await readFile(resolve(process.argv[2]||'.release-solitaire','tools/verify-production-baseline.mjs'),'utf8');
const root=await mkdtemp(join(tmpdir(),'solitaire-baseline-'));
const originalArgv=process.argv,originalFetch=globalThis.fetch;
let sequence=0,mismatch=false;const seen=[];
globalThis.fetch=async url=>{seen.push(String(url));return new Response(mismatch?'changed':'preserved');};
const scopes=['dachnye-tainy','durak','checkers','2048','solitaire'];
async function run(except=''){process.argv=['node','guard',root,...(except?['--except='+except]:[])];return import('data:text/javascript;base64,'+Buffer.from(source+`\n// case ${sequence++}`).toString('base64'));}
try{
 await writeFile(join(root,'index.html'),'preserved');
 for(const scope of scopes){await mkdir(join(root,scope,'vk'),{recursive:true});await writeFile(join(root,scope,'index.html'),'replacement');await writeFile(join(root,scope,'vk/index.html'),'replacement');}
 const allowed=scopes.map(s=>s+'/').join(',');await run(allowed);assert.equal(seen.length,1);
 mismatch=true;await assert.rejects(run(allowed),/Production baseline differs/);
 for(const bad of ['sudoku/','solitaire','solitaire/../','solitaire/vk/'])await assert.rejects(run(bad),/Unexpected replacement scope/);
 console.log('PASS: web + nested VK excluded, protected file mismatch and unknown/malformed scopes blocked');
}finally{process.argv=originalArgv;globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}
