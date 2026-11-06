/** Отказ ОК «Дачным тайнам» 3.11.2026: «На вебе не изменилось, на мобильных не видим „Магазин“».
 * Худший случай: iframe ОК выше окна, а страница площадки вообще не прокручивается.
 * Без единой прокрутки кнопка магазина, оба товара с ценой и «Закрыть» должны быть в видимой части окна.
 * Сборка: dist/vk с VITE_OK_PAYMENTS=1 (как в pages.yml), раздаётся `npx vite preview` на порту 4174.
 * Запуск: NODE_PATH="$(npm root -g)" node tools/review-dachnye-ok-shop.cjs [URL] */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=(process.argv[2]||'http://localhost:4174/')+'?vk_client=ok&vk_platform=';
const cases=[
  {name:'ОК веб',viewport:{width:1100,height:700},platform:'web_external',frame:1600},
  {name:'ОК m.web',viewport:{width:390,height:640},platform:'mobile_web',frame:640},
  {name:'ОК Android',viewport:{width:360,height:600},platform:'mobile_android',frame:600},
];
const inView=(b,h)=>b&&b.y>=0&&b.y+b.height<=h+1;
(async()=>{const b=await chromium.launch();try{
  for(const c of cases){
    const p=await b.newPage({viewport:c.viewport});
    // Мост отвечает «успех» на всё, как старая проверка tools/review-plot-scroll.cjs.
    await p.setContent(`<body style="margin:0;overflow:hidden;height:100vh"><script>window.addEventListener('message',e=>{const m=e.data;if(m?.type!=='vk-connect'||!m.handler)return;e.source.postMessage({type:m.handler+'Result',data:{result:true,keys:[],request_id:m.params?.request_id}},'*')})</script><iframe style="display:block;width:100%;height:${c.frame}px;border:0" src="${url}${c.platform}"></iframe></body>`);
    const f=p.frames()[1];await f.locator('.plot').waitFor({timeout:15000});
    const h=c.viewport.height;
    assert.ok(inView(await f.locator('.shop-btn').boundingBox(),h),`${c.name}: кнопка магазина на первом экране`);
    await f.locator('.shop-btn').click();
    const items=f.locator('.shop .shop-item');
    assert.equal(await items.count(),2,`${c.name}: два товара`);
    for(let i=0;i<2;i++){
      assert.ok(inView(await items.nth(i).boundingBox(),h),`${c.name}: товар ${i+1} виден`);
      assert.match(await items.nth(i).locator('.shop-price').innerText(),/20\s*ОК/,`${c.name}: цена в ОК`);
    }
    const close=f.getByRole('button',{name:'Закрыть',exact:true});
    assert.ok(inView(await close.boundingBox(),h),`${c.name}: «Закрыть» видна`);
    await close.click();
    await f.locator('.shop-btn').waitFor();
    console.log('PASS',c.name,c.viewport,'iframe',c.frame);await p.close();
  }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
