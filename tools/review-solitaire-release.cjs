// Local release preview and real UI checks; no state/DOM substitution.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const checkout=path.resolve(process.argv[2]||'.release-solitaire');
const store=path.resolve('games/solitaire/store');
const cases=[{width:390,height:640,frame:640,platform:'mobile_web'},{width:1100,height:700,frame:1600,platform:'web_external'}];
async function harness(page,url,c){
 await page.setContent(`<body style="margin:0;overflow:hidden"><script>
 window.calls=[];window.storage={};addEventListener('message',e=>{const m=e.data;if(m?.type!=='vk-connect'||!m.handler)return;
 calls.push({method:m.handler,params:m.params});let data={result:true};
 if(m.handler==='VKWebAppGetUserInfo')data={id:123,first_name:'Локальный',last_name:'Тест'};
 if(m.handler==='VKWebAppStorageGet')data={keys:(m.params.keys||[]).map(key=>({key,value:storage[key]||''}))};
 if(m.handler==='VKWebAppStorageSet')storage[m.params.key]=m.params.value;
 e.source.postMessage({type:m.handler+'Result',data:{...data,request_id:m.params?.request_id}},'*');});
 </script><iframe style="display:block;border:0;width:100%;height:${c.frame}px" src="${url}?vk_platform=${c.platform}&vk_language=ru"></iframe></body>`);
 const f=page.frames()[1];await f.locator('.stock').waitFor();return f;
}
async function ready(page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});}
async function transfer(f){
 for(let tries=0;tries<52;tries++){
  const move=await f.evaluate(()=>{
   const ranks=['','туз','двойка','тройка','четвёрка','пятёрка','шестёрка','семёрка','восьмёрка','девятка','десятка','валет','дама','король'];
   const parse=(el,i)=>{const label=el?.getAttribute('aria-label');if(!label)return null;const [r,s]=label.split(' ');return {i,r:ranks.indexOf(r),s,red:s==='червы'||s==='бубны'};};
   const tops=[...document.querySelectorAll('.column')].map((col,i)=>parse(col.lastElementChild.querySelector('.face'),i));
   const sources=[...tops,parse(document.querySelector('.waste .face:last-child'),-1)].filter(Boolean);
   for(const a of sources){if(a.r===1)return {from:a.i,to:'auto'};
    for(const b of tops.filter(Boolean))if(a.i!==b.i&&a.r+1===b.r&&a.red!==b.red)return {from:a.i,to:b.i};}
   return null;
  });
  if(move){const before=await f.locator('.felt').innerHTML();
   const source=()=>move.from===-1?f.locator('.waste'):f.locator('.column').nth(move.from).locator('.stacked').last();
   await source().click();if(move.to==='auto')await source().click();else await f.locator('.column').nth(move.to).locator('.stacked').last().click();
   assert.notEqual(await f.locator('.felt').innerHTML(),before,'card transfer changes position');
   assert.equal(await f.locator('.selected').count(),0,'transfer clears selection');
   await f.getByRole('button',{name:'Отменить',exact:true}).click();assert.equal(await f.locator('.felt').innerHTML(),before,'undo restores transferred card');return;
  }
  await f.locator('.stock').click();
 }
 throw new Error('No transferable card found');
}
async function main(){
 const {preview}=await import('vite');
 const server=await preview({configFile:false,build:{outDir:path.join(checkout,'release-solitaire')},preview:{host:'127.0.0.1',port:5293,strictPort:true}});
 const browser=await chromium.launch();const results=[],errors=[],httpErrors=[];
 try{
 for(const mode of ['web','vk'])for(const c of cases){
  const ctx=await browser.newContext({viewport:{width:c.width,height:c.height},locale:'ru-RU'});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)httpErrors.push(r.url());});
  const url='http://127.0.0.1:5293/'+(mode==='vk'?'vk/':'');const f=await harness(p,url,c);
  assert.equal(await f.locator('.column').count(),7);assert.equal(await f.locator('.stacked').count(),28);
  assert.ok(!await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'no horizontal overflow');
  const actions=await f.locator('.actions').boundingBox();assert.ok(actions.y>=0&&actions.y+actions.height<=c.height+1,'actions visible inside host window');
  const initial=await f.locator('.felt').innerHTML();await f.locator('.stock').click();
  const played=await f.locator('.felt').innerHTML();assert.notEqual(initial,played);
  assert.match(await f.locator('.status').innerText(),/Ходов: 1/);
  await f.getByRole('button',{name:'Отменить',exact:true}).click();assert.equal(await f.locator('.felt').innerHTML(),initial,'undo restores cards');
  await f.locator('.stock').click();await p.waitForTimeout(1700);
  await f.goto(url+`?vk_platform=${c.platform}&vk_language=ru`);await f.locator('.stock').waitFor();
  assert.equal(await f.locator('.felt').innerHTML(),played,'reload restores round');
  await f.getByRole('button',{name:'Отменить',exact:true}).click();assert.equal(await f.locator('.felt').innerHTML(),initial,'undo survives reload');
  await transfer(f);
  await f.getByRole('button',{name:'Новый расклад',exact:true}).click();
  const dialog=await f.locator('.dialog').boundingBox();assert.ok(dialog.y>=0&&dialog.y+dialog.height<=c.height+1,'new deal dialog visible');
  await f.getByRole('button',{name:'По три карты',exact:true}).click();await f.locator('.stock').click();
  assert.equal(await f.locator('.waste .card').count(),3);assert.match(await f.locator('.status').innerText(),/по 3 карты/);
  await f.locator('.meta-bar').click();const box=await f.locator('.meta-panel').boundingBox();
  assert.ok(box.y>=0&&box.y+box.height<=c.height+1,'collection fits host viewport');
  assert.equal(await f.locator('.meta-tasks li').count(),3);assert.equal(await f.locator('.meta-item').count(),6);
  await f.getByRole('button',{name:'Играть',exact:true}).click();
  await p.emulateMedia({colorScheme:'dark'});assert.ok(!await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
  if(mode==='vk'){const calls=await p.evaluate(()=>calls);assert.ok(calls.some(x=>x.method==='VKWebAppInit'));assert.ok(calls.some(x=>x.method==='VKWebAppStorageSet'));assert.ok(!calls.some(x=>/OrderBox|PayForm/.test(x.method)));}
  results.push(`${mode} ${c.width}x${c.height}, iframe ${c.frame}`);console.log('PASS',results.at(-1));await ctx.close();
 }
 // Native screenshots, normal 1200x600 viewport; only clicks in the real game.
 const p=await browser.newPage({viewport:{width:1200,height:600},locale:'ru-RU'});
 p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5293/');await p.locator('.stock').waitFor();await ready(p);
 await fs.mkdir(path.join(store,'shots'),{recursive:true});
 await p.screenshot({path:path.join(store,'shots/01-klondike-1200x600.png'),animations:'disabled'});
 await p.getByRole('button',{name:'Новый расклад',exact:true}).click();await p.getByRole('button',{name:'По три карты',exact:true}).click();
 await p.locator('.stock').click();await ready(p);await p.screenshot({path:path.join(store,'shots/02-draw-three-1200x600.png'),animations:'disabled'});
 await p.locator('.meta-bar').click();await ready(p);await p.locator('.meta-panel').evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished));e.scrollTop=e.scrollHeight;});await p.screenshot({path:path.join(store,'shots/03-collection-1200x600.png'),animations:'disabled'});
 assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);
 await fs.writeFile(path.join(checkout,'release-notes/solitaire/review.json'),JSON.stringify({cases:results,pageErrors:errors,httpErrors,screenshots:'1200x600, actual release, UI clicks only, no state/DOM/style substitution'},null,2)+'\n');
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
