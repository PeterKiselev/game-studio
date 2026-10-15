const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '../games/dachnye-tainy/dist/ok-candidate');
const server = createServer((req, res) => {
  const file = resolve(root, '.' + (new URL(req.url, 'http://local').pathname === '/' ? '/index.html' : new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + require('node:path').sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webp': 'image/webp' })[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const ok of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 420, height: 800 } });
      const page = await context.newPage();
      const errors = [], calls = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => window.addEventListener('message', e => {
        const m = e.data;
        if (m?.type !== 'vk-connect' || !m.handler) return;
        const data = { VKWebAppInit: { result: true }, VKWebAppGetUserInfo: { id: 123, first_name: 'Test' },
          VKWebAppCheckNativeAds: { result: false }, VKWebAppStorageGet: { keys: [] }, VKWebAppStorageSet: { result: true } }[m.handler];
        window.postMessage({ type: m.handler + (data ? 'Result' : 'Failed'), data: { request_id: m.params?.request_id, ...data } }, '*');
      }));
      await page.route('https://dachnye-tainy-payments-ok.kiselevpetr3.workers.dev/**', route => {
        calls.push(new URL(route.request().url()).pathname);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ skus: ['dachnye_tainy_no_ads', 'dachnye_tainy_unlimited_hints'] }) });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/?vk_app_id=54767366&vk_user_id=123&vk_ok_user_id=456&sign=synthetic${ok ? '&vk_client=ok' : ''}`);
      await page.locator('.shop-btn').waitFor();
      await page.locator('.shop-btn').click();
      await page.locator('.shop-item').first().waitFor();
      if (ok) {
        await page.waitForFunction(() => [...document.querySelectorAll('.shop-item .btn')].every(b => b.textContent.trim() === 'Куплено'));
        assert.deepEqual(calls, ['/ok/restore']);
      } else assert.deepEqual(calls, []);
      assert.equal(await page.locator('.test-marker, .test-marker-journal').count(), 0);
      assert.equal(await page.getByText('Тест: подсказки', { exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      console.log(ok ? 'OK: journal restores both products, no diagnostic UI' : 'VK: no requests to OK server, shop intact');
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
