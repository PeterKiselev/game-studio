// Verify exact release copies, VK store dimensions, listing limits; write provenance.
import assert from 'node:assert/strict';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const checkout=resolve(process.argv[2]||'.release-solitaire');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function walk(root){const files=[];for(const e of await readdir(root,{withFileTypes:true})){const p=join(root,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files.sort();}
async function entries(root){return Promise.all((await walk(root)).map(async p=>{const b=await readFile(p);return {path:relative(root,p).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)};}));}
for(const mode of ['web','vk']){
 const expected=await entries(resolve('games/solitaire/dist',mode));
 const actual=(await entries(join(checkout,'release-solitaire',mode==='vk'?'vk':''))).filter(f=>mode==='vk'||!f.path.startsWith('vk/'));
 assert.deepEqual(actual,expected,`exact ${mode} build copy, no stale assets`);
}
const store=resolve('games/solitaire/store');const dimensions=[];
for(const [file,w,h] of [...[576,278,150].map(n=>[`icons/icon-${n}.png`,n,n]),['promo/snippet-1120x630.png',1120,630],...['01-klondike','02-draw-three','03-collection'].map(n=>[`shots/${n}-1200x600.png`,1200,600])]){
 const b=await readFile(join(store,file));assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),w);assert.equal(b.readUInt32BE(20),h);dimensions.push({file,width:w,height:h,bytes:b.length,sha256:hash(b)});
}
const listing=await readFile(join(store,'listing-ru.md'),'utf8');const fields={};
for(const [name,max] of [['Название',48],['Краткое описание',108],['Слоган',32],['Описание',2000]]){const body=listing.split('## '+name+'\n')[1]?.split('\n## ')[0].trim();assert.ok(body);assert.ok(body.length<=max,`${name}: ${body.length} > ${max}`);fields[name]={length:body.length,max};}
const built=JSON.parse(await readFile('games/solitaire/dist/build-source.json','utf8'));
for(const f of built.sourceFiles)assert.equal(hash(await readFile(f.path)),f.sha256,'source matches final build: '+f.path);
const sourceDiff=execFileSync('git',['diff','--unified=0','--','games/solitaire/src','packages/rules/src/klondike','packages/rules/test/klondike.test.ts'],{encoding:'utf8'});
const notes=join(checkout,'release-notes/solitaire');await mkdir(notes,{recursive:true});
await writeFile(join(notes,'source-fixes.patch'),sourceDiff);
await writeFile(join(notes,'manifest.json'),JSON.stringify({releaseBase:'3386337525a48e12317c023547559f523845b1b6',...built,sourcePatch:'source-fixes.patch',sourcePatchSha256:hash(sourceDiff),release:await entries(join(checkout,'release-solitaire')),store:dimensions,listing:fields,baseline:{runId:'43948567654',verification:'Inherited from release base; gh query blocked by sandbox network. Must confirm latest successful run before publishing.'}},null,2)+'\n');
console.log('PASS exact web/VK copies, seven PNG dimensions, listing limits:',fields);
