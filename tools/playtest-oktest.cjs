/**
 * Изолированная тестовая сборка для ОК (tools/build-oktest.mjs) — в браузере,
 * с заглушкой VK Bridge, как в playtest-shop.cjs. Живой запуск в настоящих
 * Одноклассниках этим НЕ заменяется: проверяется только сама сборка.
 *
 * Что проверяем: маркер «ТЕСТ ОК · дата · коммит» виден поверх игры и
 * показывает vk_client/vk_platform, но не подпись и не id; не мешает нажатиям;
 * в ОК магазина нет (платежи выключены, как в опубликованной версии);
 * ни одного запроса к платёжному серверу; закрыта от поиска; обычная VK-сборка
 * маркера не содержит.
 *
 * Запуск: node tools/playtest-oktest.cjs <url-ok-test> <url-обычной-vk>
 */
const { chromium } = require('playwright');

const OKTEST = process.argv[2] || 'http://127.0.0.1:4180/';
const PLAINVK = process.argv[3] || 'http://127.0.0.1:4178/';
const OK_LAUNCH = 'vk_user_id=574470572&vk_app_id=54767366&vk_client=ok&vk_platform=desktop_web&sign=test-sign&lang=ru';
const VK_LAUNCH = 'vk_user_id=574470572&vk_app_id=54767366&vk_platform=desktop_web&sign=test-sign&lang=ru';

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

async function stubVkBridge(page) {
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'vk-connect' || !msg.handler) return;
      const requestId = msg.params && msg.params.request_id;
      const ok = (data) => window.postMessage({ type: msg.handler + 'Result', data: Object.assign({ request_id: requestId }, data) }, '*');
      const fail = () => window.postMessage({ type: msg.handler + 'Failed', data: { error_type: 'stub', request_id: requestId } }, '*');
      switch (msg.handler) {
        case 'VKWebAppInit':
          return ok({ result: true });
        case 'VKWebAppCheckNativeAds':
          return ok({ result: false });
        case 'VKWebAppGetUserInfo':
          return ok({ id: 574470572, first_name: 'Test', last_name: 'Player' });
        case 'VKWebAppStorageGet':
          return ok({ keys: [] });
        case 'VKWebAppStorageSet':
          return ok({ result: true });
        default:
          return fail();
      }
    });
  });
}

async function open(browser, base, launch, viewport = { width: 420, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.foreign = [];
  const origin = new URL(base).origin;
  page.on('request', (r) => {
    if (!r.url().startsWith(origin)) page.foreign.push(`${r.method()} ${r.url()}`);
  });
  await stubVkBridge(page);
  await page.goto(`${base}?${launch}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.case-list', { timeout: 10000 });
  return { context, page };
}

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== 1. Тестовая сборка в ОК: маркер, без магазина, без запросов ===');
  {
    const { context, page } = await open(browser, OKTEST, OK_LAUNCH);
    const marker = page.locator('.test-marker');
    assert(await marker.isVisible(), 'маркер виден');
    const text = await marker.textContent();
    assert(/^ТЕСТ ОК · \d{4}-\d{2}-\d{2} · [0-9a-f]{7}/.test(text), 'маркер: «ТЕСТ ОК · дата · коммит» — ' + text);
    assert(text.includes('клиент: ok') && text.includes('платформа: desktop_web'), 'маркер показывает vk_client=ok и платформу');
    assert(!text.includes('574470572') && !text.includes('sign'), 'id пользователя и подпись не выводятся');
    assert((await page.title()).startsWith('[ТЕСТ]'), 'заголовок вкладки помечен');
    assert((await page.locator('.shop-btn').count()) === 0, 'в ОК магазина нет — платежи выключены, как в опубликованной версии');
    const box = await marker.boundingBox();
    assert(box.y === 0 && box.height < 24, `маркер — тонкая полоса сверху (${Math.round(box.height)}px)`);
    // Нажатия проходят сквозь маркер: открываем дело.
    await page.locator('.case-card').first().click();
    await page.locator('.story').getByRole('button', { name: 'Пропустить' }).click({ timeout: 3000 }).catch(() => {});
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForSelector('.case');
    assert(await marker.isVisible(), 'маркер виден и на экране дела');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    assert(robots === 'noindex, nofollow', 'сборка закрыта от поиска');
    assert(page.foreign.length === 0, 'ни одного запроса на сторонние адреса: ' + page.foreign.join('; '));
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 2. Та же тестовая сборка во ВКонтакте: маркер показывает клиент ===');
  {
    const { context, page } = await open(browser, OKTEST, VK_LAUNCH);
    const text = await page.locator('.test-marker').textContent();
    assert(text.includes('клиент: —'), 'без vk_client маркер говорит «клиент: —» — видно, что это не ОК');
    await context.close();
  }

  console.log('\n=== 3. Обычная VK-сборка: маркера нет ===');
  {
    const { context, page } = await open(browser, PLAINVK, OK_LAUNCH);
    assert((await page.locator('.test-marker').count()) === 0, 'обычная сборка без маркера');
    assert(!(await page.title()).startsWith('[ТЕСТ]'), 'заголовок обычный');
    assert((await page.locator('meta[name="robots"]').count()) === 0, 'обычная сборка не закрыта от поиска');
    await context.close();
  }

  console.log('\n=== 4. Маркер на узком телефоне не ломает вёрстку ===');
  {
    const { context, page } = await open(browser, OKTEST, OK_LAUNCH, { width: 360, height: 640 });
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert(fits, '360 px: без горизонтальной прокрутки');
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/oktest-360.png` });
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
