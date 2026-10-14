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
 * Плюс сборка с магазином ОК (build-oktest.mjs --shop): в ОК магазин есть, цена
 * и кнопка — в ОКах, окно оплаты вызывается с тем же SKU; во ВКонтакте та же
 * сборка показывает голоса; без адреса сервера — ни одного запроса восстановления.
 *
 * Плюс диагностика восстановления (--restore-diag): вторая строка полосы показывает
 * ответ журнала (товары / пусто / ошибка) независимо от сохранения, без ID и адресов;
 * сохранение и облако не трогаются. Сервер подменяется маршрутом Playwright.
 *
 * Запуск: node tools/playtest-oktest.cjs <url-ok-test> <url-обычной-vk> <url-ok-test-shop> <url-ok-test-diag>
 */
const { chromium } = require('playwright');

const OKTEST = process.argv[2] || 'http://127.0.0.1:4180/';
const PLAINVK = process.argv[3] || 'http://127.0.0.1:4178/';
const OKSHOP = process.argv[4] || 'http://127.0.0.1:4181/';
const OKDIAG = process.argv[5] || 'http://127.0.0.1:4182/';
// Адрес, с которым собрана диагностическая сборка (--payments-url); ответы подменяются.
const DIAG_SERVER = 'https://payments-oktest.test';
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
          window.__cloud = (window.__cloud || 0) + 1;
          return ok({ keys: [] });
        case 'VKWebAppStorageSet':
          window.__cloudSet = (window.__cloudSet || 0) + 1;
          return ok({ result: true });
        case 'VKWebAppShowOrderBox':
          (window.__orders = window.__orders || []).push(msg.params);
          return ok({ success: true });
        default:
          return fail();
      }
    });
  });
}

async function open(browser, base, launch, viewport = { width: 420, height: 800 }, prepare = null) {
  const context = await browser.newContext({ viewport });
  if (prepare) await prepare(context);
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

  console.log('\n=== 5. Сборка с магазином ОК: цена в ОКах, окно оплаты, без восстановления ===');
  {
    const { context, page } = await open(browser, OKSHOP, OK_LAUNCH);
    const text = await page.locator('.test-marker').textContent();
    assert(text.includes('ТЕСТ ОК · МАГАЗИН') && text.includes('восстановление: выкл') && text.includes('клиент: ok'), 'маркер: магазин, восстановление выключено, клиент ok — ' + text);
    assert((await page.locator('.shop-btn').count()) === 1, 'в ОК есть кнопка магазина');
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    const prices = (await page.locator('.shop-price').allInnerTexts()).map((t) => t.trim());
    const buttons = (await page.locator('.shop-item .btn').allInnerTexts()).map((t) => t.trim());
    assert(JSON.stringify(prices) === JSON.stringify(['20 ОК', '20 ОК']), 'цены видны до нажатия и в ОКах: ' + prices.join(', '));
    assert(buttons.every((b) => b === 'Купить за 20 ОК'), 'кнопки: «Купить за 20 ОК» — ' + buttons.join(', '));
    assert(!(await page.locator('.shop').innerText()).includes('голос'), 'слова «голос» в магазине ОК нет');
    await page.locator('.shop-item .btn').first().click();
    await page.waitForFunction(() => (window.__orders || []).length === 1);
    const order = await page.evaluate(() => window.__orders[0]);
    assert(order.type === 'item' && order.item === 'dachnye_tainy_no_ads', 'окно оплаты вызвано с SKU «Без рекламы»: ' + JSON.stringify(order));
    await page.waitForFunction(() => document.querySelector('.shop-item .btn').textContent === 'Куплено');
    assert(true, 'после успешного ответа окна — «Куплено»');
    const restoreCalls = page.foreign.concat(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('restore'))));
    assert(restoreCalls.length === 0, 'адрес сервера не задан — ни одного запроса восстановления и сторонних запросов');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  {
    const { context, page } = await open(browser, OKSHOP, VK_LAUNCH);
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    const prices = (await page.locator('.shop-price').allInnerTexts()).map((t) => t.trim());
    assert(JSON.stringify(prices) === JSON.stringify(['20 голосов', '20 голосов']), 'та же сборка во ВКонтакте — цены в голосах: ' + prices.join(', '));
    await context.close();
  }
  {
    // Обычная VK-сборка в ОК: как раньше — магазина нет.
    const { context, page } = await open(browser, PLAINVK, OK_LAUNCH);
    assert((await page.locator('.shop-btn').count()) === 0, 'обычная VK-сборка в ОК — магазина нет, как в опубликованной версии');
    await context.close();
  }

  console.log('\n=== 6. Диагностика восстановления: ответ журнала независимо от сохранения ===');
  const journal = (page) => page.locator('.test-marker-journal').textContent();
  const server = (reply) => async (context) => {
    await context.route(`${DIAG_SERVER}/**`, async (route) => {
      const r = reply(route.request().url());
      if (r === 'fail') return route.abort('failed');
      return route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(r.body) });
    });
  };
  const withSave = (purchases) => async (context) => {
    await context.addInitScript((p) => {
      if (!localStorage.getItem('studio:dachnye-tainy')) {
        localStorage.setItem('studio:dachnye-tainy', JSON.stringify({ v: 3, t: Date.now(), data: { casesCompleted: ['tutorial-1'], progress: {}, stars: { 'tutorial-1': 3 }, achievements: ['first_case'], purchases: p, onboardingSeen: true } }));
      }
    }, purchases);
  };
  const both = (...fns) => async (context) => {
    for (const fn of fns) await fn(context);
  };
  {
    // Сохранение без покупок, журнал — оба товара.
    const { context, page } = await open(browser, OKDIAG, OK_LAUNCH, undefined, server(() => ({ status: 200, body: { skus: ['dachnye_tainy_no_ads', 'dachnye_tainy_unlimited_hints'] } })));
    await page.waitForSelector('.test-marker-journal');
    assert((await journal(page)) === 'журнал: без рекламы, подсказки', 'журнал вернул оба товара — строка: ' + (await journal(page)));
    assert((await page.locator('.test-marker').textContent()).includes('ДИАГНОСТИКА'), 'маркер помечен как диагностика');
    const screen = (await page.locator('.test-marker').textContent()) + ' ' + (await journal(page));
    assert(!/574470572|test-sign|sign=|https?:|oktest|vk_user/.test(screen), 'на экране нет ID, подписи и адресов: ' + screen);
    assert((await page.evaluate(() => window.__cloud || 0)) > 0, 'облачное сохранение запрашивается как обычно');
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    assert((await page.locator('.shop-item .btn').allInnerTexts()).every((t) => t.trim() === 'Куплено'), 'права из журнала добавлены — «Куплено»');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  {
    // Сохранение с покупкой, журнал пуст: строка честно говорит «пусто», купленное не снимается.
    const { context, page } = await open(browser, OKDIAG, OK_LAUNCH, undefined, both(withSave({ noAds: true }), server(() => ({ status: 200, body: { skus: [] } }))));
    await page.waitForSelector('.test-marker-journal');
    assert((await journal(page)) === 'журнал: пусто', 'журнал пуст — строка «журнал: пусто», хотя в сохранении покупка есть');
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    assert((await page.locator('.shop-item .btn').first().innerText()).trim() === 'Куплено', 'купленное по сохранению не снято');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('studio:dachnye-tainy')));
    assert(saved.data.purchases.noAds === true && saved.data.casesCompleted.includes('tutorial-1'), 'прогресс и покупки в сохранении целы');
    await context.close();
  }
  for (const [label, reply, expected] of [
    ['403', () => ({ status: 403, body: { error: 'bad_sign' } }), 'журнал: ошибка 403'],
    ['503', () => ({ status: 503, body: { error: 'not_configured' } }), 'журнал: ошибка 503'],
    ['сеть', () => 'fail', 'журнал: ошибка сети'],
  ]) {
    const { context, page } = await open(browser, OKDIAG, OK_LAUNCH, undefined, both(withSave({ unlimitedHints: true }), server(reply)));
    await page.waitForSelector('.test-marker-journal');
    assert((await journal(page)) === expected, `${label}: «${expected}»`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('studio:dachnye-tainy')));
    assert(saved.data.purchases.unlimitedHints === true, `${label}: покупка в сохранении на месте`);
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  {
    // Обычная сборка с магазином (без --restore-diag) второй строки не показывает.
    const { context, page } = await open(browser, OKSHOP, OK_LAUNCH);
    await page.waitForTimeout(500);
    assert((await page.locator('.test-marker-journal').count()) === 0, 'без --restore-diag строки журнала нет');
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
