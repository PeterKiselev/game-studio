// NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" node tools/review-checkers-2048-release.cjs [release checkout]
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const checkout=path.resolve(process.argv[2]||'.release-checkers-2048');
const cases=[{width:1100,height:700,frame:1600,platform:'web_external'},
  {width:390,height:640,frame:640,platform:'mobile_web'},
  {width:360,height:600,frame:600,platform:'mobile_android'}];
async function copyTree(from,to){
 await fs.mkdir(to,{recursive:true});
 for(const entry of await fs.readdir(from,{withFileTypes:true})){
  if(entry.isDirectory())await copyTree(path.join(from,entry.name),path.join(to,entry.name));
  else await fs.copyFile(path.join(from,entry.name),path.join(to,entry.name));
 }
}
async function bridgeHarness(page,url,c,options={}){
  await page.setContent(`<body style="margin:0;overflow:hidden;height:100vh"><script>
    window.calls=[];window.storage={};window.reward=${options.reward!==false};window.available=${options.available!==false};
    window.addEventListener('message',e=>{const m=e.data;if(m?.type!=='vk-connect'||!m.handler)return;
      calls.push({method:m.handler,params:m.params});let data={result:true};
      if(m.handler==='VKWebAppCheckNativeAds')data={result:available};
      if(m.handler==='VKWebAppShowNativeAds')data={result:reward};
      if(m.handler==='VKWebAppGetUserInfo')data={id:123,first_name:'Локальный',last_name:'Тест'};
      if(m.handler==='VKWebAppStorageGet')data={keys:(m.params.keys||[]).map(key=>({key,value:storage[key]||''}))};
      if(m.handler==='VKWebAppStorageSet')storage[m.params.key]=m.params.value;
      e.source.postMessage({type:m.handler+'Result',data:{...data,request_id:m.params?.request_id}},'*');
    });</script><iframe style="display:block;width:100%;height:${c.frame}px;border:0" src="${url}?vk_platform=${c.platform}&vk_language=ru"></iframe></body>`);
  const frame=page.frames()[1];await frame.locator('#board').waitFor({timeout:15000});return frame;
}
async function main(){
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'checkers-2048-preview-'));
 for(const game of ['checkers','2048'])await copyTree(path.join(checkout,'release-'+game),path.join(stage,game));
 const {preview}=await import('vite');
 const server=await preview({configFile:false,build:{outDir:stage},preview:{host:'127.0.0.1',port:5290,strictPort:true}});
 const browser=await chromium.launch();const results=[];
 try{
  for(const game of ['checkers','2048'])for(const mode of ['web','vk'])for(const c of cases){
   const ctx=await browser.newContext({viewport:{width:c.width,height:c.height},locale:'ru-RU'});
   const page=await ctx.newPage(),errors=[],badResponses=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badResponses.push(r.url());});
   const url=`http://127.0.0.1:5290/${game}/${mode==='vk'?'vk/':''}`;
   const frame=await bridgeHarness(page,url,c);
   assert.equal(await frame.locator(game==='checkers'?'.cell':'.tile').count(),game==='checkers'?64:16);
   assert.equal(await frame.getByRole('button',{name:/магазин|купить/i}).count(),0,'shop hidden');
   assert.ok(!await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'no horizontal overflow');
   const initial=await frame.locator('#board').innerHTML();
   if(game==='checkers'){
    await frame.locator('[data-square="40"]').click();await frame.locator('[data-square="33"]').click();
     await frame.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ход белых')&&document.querySelector('#undo:not(:disabled)'),null,{timeout:5000}).catch(async e=>{console.log(await frame.locator('#status').innerText(),errors,await frame.locator('#board').innerHTML());throw e;});
   }else{
    for(const direction of ['left','down','right','up'])await frame.locator(`[data-dir="${direction}"]`).click();
   }
   const played=await frame.locator('#board').innerHTML();assert.notEqual(played,initial,'move changes board');
    // Local writes are immediate; cloud writes are debounced.
   await frame.waitForFunction(game=>!!localStorage.getItem('studio:'+game),game);
   await page.waitForTimeout(1700);
   await frame.goto(url+`?vk_platform=${c.platform}&vk_language=ru`);await frame.locator('#board').waitFor();
   assert.equal(await frame.locator('#board').innerHTML(),played,'round survives reload');
   await frame.locator('#undo').click();assert.notEqual(await frame.locator('#board').innerHTML(),played,'undo works');
   if(game==='checkers'){
    assert.equal(await frame.locator('#board').innerHTML(),initial,'bot reply undone too');
    await frame.locator('#duo').click();await frame.locator('[data-square="40"]').click();await frame.locator('[data-square="33"]').click();
    assert.match(await frame.locator('#status').innerText(),/чёрных/);await frame.locator('#undo').click();
   }
   await frame.locator('.meta-bar').click();await frame.locator('.meta-panel').waitFor();
   const panel=await frame.locator('.meta-panel').boundingBox();assert.ok(panel.y>=0&&panel.y+panel.height<=c.height+1,'meta panel fits host viewport');
   assert.equal(await frame.locator('.meta-tasks li').count(),3,'three daily tasks');
   assert.equal(await frame.locator('.meta-item').count(),game==='checkers'?7:6,'collection');
   assert.match(await frame.locator('.meta-panel').innerText(),/Серия|серия/);
   assert.equal(await frame.getByRole('button',{name:/купить/i}).count(),0);
   await frame.getByRole('button',{name:'Играть',exact:true}).click();
   const hint=frame.getByRole('button',{name:/Подсказка.*за видео/});
   if(mode==='vk'){
    assert.ok(await hint.isVisible());await hint.click();
    await frame.getByText(game==='checkers'?/Рекомендуемый ход:/:/Попробуй .*Это совет/).waitFor();
    const calls=await page.evaluate(()=>calls);
    assert.ok(calls.some(c=>c.method==='VKWebAppInit'),'VK adapter initialized');
    assert.equal(calls.filter(c=>c.method==='VKWebAppShowNativeAds').length,1,'only requested rewarded');
    assert.equal(calls.find(c=>c.method==='VKWebAppShowNativeAds').params.ad_format,'reward');
    assert.ok(calls.some(c=>c.method==='VKWebAppStorageSet'),'cloud save requested');
    assert.ok(!calls.some(c=>/OrderBox|PayForm/.test(c.method)),'no payments');
   }else assert.ok(!await hint.isVisible(),'web hides unavailable ads');
   await page.emulateMedia({colorScheme:'dark'});
   assert.ok(!await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
   assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
   const label=`${game} ${mode} ${c.width}x${c.height} iframe ${c.frame}`;console.log('PASS',label);results.push(label);
   await ctx.close();
  }
  for(const game of ['checkers','2048'])for(const options of [{reward:false},{available:false}]){
   const page=await browser.newPage({viewport:{width:390,height:640}});
   const frame=await bridgeHarness(page,`http://127.0.0.1:5290/${game}/vk/`,cases[1],options);
   const hint=frame.getByRole('button',{name:/Подсказка.*за видео/});
   if(options.available===false)assert.ok(!await hint.isVisible());else{
    await hint.click();await frame.getByText(/Видео недоступно или просмотр не завершён/).waitFor();
    assert.equal(await frame.getByText(/Рекомендуемый ход:|Попробуй .*Это совет/).count(),0);
   }
   console.log('PASS',game,JSON.stringify(options));await page.close();
  }
  const dimensions=[];
  for(const game of ['checkers','2048'])for(const [file,w,h] of [
   ...[576,278,150].map(n=>[`icons/icon-${n}.png`,n,n]),['promo/snippet-1120x630.png',1120,630],
   ...['01-game','02-play','03-collection'].map(n=>[`shots/${n}-1200x600.png`,1200,600])]){
   const bytes=await fs.readFile(path.join('games',game,'store',file));
   assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);
   dimensions.push({game,file,width:w,height:h});
  }
  await fs.mkdir(path.join(checkout,'release-notes/checkers-2048'),{recursive:true});
  await fs.writeFile(path.join(checkout,'release-notes/checkers-2048/review.json'),JSON.stringify({cases:results,negativeAds:'2 games x refusal/no inventory passed',dimensions,pageErrors:[],httpErrors:[]},null,2)+'\n');
  console.log('PASS 14 store image dimensions');
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));await fs.rm(stage,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
