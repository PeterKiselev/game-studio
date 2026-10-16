const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.argv[2] || 'http://127.0.0.1:4175/';
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [360, 1000]) {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 640 : 700 } });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded-art')) return;
        localStorage.setItem('studio:dachnye-tainy', JSON.stringify({v:3,t:Date.now(),data:{
          casesCompleted:['ch1-hose','ch1-key','ch1-pond','ch2-boat','ch2-cart'],
          progress:{},stars:{'ch1-hose':3},achievements:[],purchases:{noAds:true},onboardingSeen:true,
        }})); sessionStorage.setItem('seeded-art','1');
      });
      await page.goto(BASE);
      for (const title of ['Глава 2. Чья лодка','Глава 2. По сухой дорожке','Глава 2. Сюрприз для соседей']) {
        await page.getByRole('button',{name:title}).click();
        await page.locator('.story').waitFor();
        for (let i=1;i<=2;i++) {
          assert.equal(await page.locator('.story-counter').innerText(),`${i} / 2`);
          await page.locator('.story-image').evaluate(image=>image.decode());
          assert(await page.locator('.story-image').evaluate(image=>image.naturalWidth===1080));
          const button = await page.locator('.story-controls button').boundingBox();
          assert(button && button.y>=0 && button.y+button.height<=page.viewportSize().height+1);
          await page.locator('.story-controls button').click();
        }
        await page.locator('.case').waitFor();
        await page.locator('.case .topbar .btn').click();
        await page.getByRole('button',{name:title}).click();
        await page.locator('.case').waitFor();
        assert.equal(await page.locator('.story').count(),0);
        await page.locator('.case .topbar .btn').click();
      }
      await page.reload(); await page.locator('.case-list').waitFor();
      const save = await page.evaluate(()=>JSON.parse(localStorage.getItem('studio:dachnye-tainy')).data);
      for(const id of ['ch2-boat','ch2-cart','ch2-cleanup']) assert(save.storySeen.includes(id));
      assert.equal(save.purchases.noAds,true); assert.equal(save.stars['ch1-hose'],3);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: six pages, controls, once-only stories, persistence, purchase and stars intact`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
