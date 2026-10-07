/**
 * Восстановление покупок «Дачных тайн» в настоящем браузере.
 *
 * Две VK-сборки:
 *  - обычная (без VITE_PAYMENTS_URL) — проверяем, что поведение не изменилось
 *    и игра не делает ни одного запроса восстановления;
 *  - тестовая (VITE_PAYMENTS_URL=https://payments.test) — сервер подменяется
 *    Playwright-маршрутом, VK Bridge — заглушкой, как в playtest-shop.cjs.
 *
 * Это проверка клиента: настоящий журнал и подписи проверяются тестами
 * services/payments (unit и workerd). Реальную оплату и реальный сервер
 * заглушка не заменяет.
 *
 * Запуск (обе сборки подняты vite preview):
 *   node tools/playtest-restore.cjs <url-обычной> <url-тестовой>
 */
const { chromium } = require('playwright');

const PLAIN = process.argv[2] || 'http://127.0.0.1:4178/';
const RESTORE = process.argv[3] || 'http://127.0.0.1:4179/';
const SERVER = 'https://payments.test';
const NO_ADS = 'dachnye_tainy_no_ads';
const HINTS = 'dachnye_tainy_unlimited_hints';

const VK_LAUNCH = 'vk_user_id=574470572&vk_app_id=54767366&vk_platform=desktop_web&sign=test-sign&lang=ru';
const OK_LAUNCH = 'vk_user_id=512005303399&vk_app_id=54767366&vk_client=ok&vk_platform=desktop_web&sign=test-sign&lang=ru';

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

async function stubVkBridge(page, { approvePurchase = false, ads = false } = {}) {
  await page.addInitScript(([approve, adsOn]) => {
    window.__adsShown = 0;
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
          return ok({ result: adsOn });
        case 'VKWebAppShowNativeAds':
          window.__adsShown += 1;
          return ok({ result: true });
        case 'VKWebAppGetUserInfo':
          return ok({ id: 574470572, first_name: 'Test', last_name: 'Player' });
        case 'VKWebAppStorageGet':
          return ok({ keys: [] });
        case 'VKWebAppStorageSet':
          return ok({ result: true });
        case 'VKWebAppShowOrderBox':
          return approve ? ok({ success: true }) : fail();
        default:
          return fail();
      }
    });
  }, [approvePurchase, ads]);
}

/**
 * Подменённый платёжный сервер. `state.mode`: 'ok' — отвечает журналом,
 * 'down' — сеть недоступна, '503' — сервер не настроен, 'hang' — не отвечает.
 */
async function stubServer(context, state) {
  await context.route(`${SERVER}/**`, async (route) => {
    const url = new URL(route.request().url());
    state.requests.push(url.pathname + url.search);
    if (state.mode === 'down') return route.abort('failed');
    if (state.mode === 'hang') return; // не отвечаем вовсе
    if (state.gate) await state.gate; // задержанный ответ: отпускает сценарий
    if (state.mode === '503') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not_configured"}' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ skus: state.journal }),
    });
  });
}

async function open(browser, base, launch, { state, approvePurchase = false, ads = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.restoreCalls = [];
  page.on('request', (r) => {
    if (r.url().includes('/restore')) page.restoreCalls.push(r.url());
  });
  await stubVkBridge(page, { approvePurchase, ads });
  if (state) await stubServer(context, state);
  await page.goto(`${base}?${launch}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.plot, .shop-btn, h1', { timeout: 10000 });
  return { context, page };
}

/** Подписи кнопок в магазине по порядку SHOP_ITEMS: [без рекламы, подсказки]. */
async function shopLabels(page) {
  await page.locator('.shop-btn').click();
  await page.waitForSelector('.shop-item');
  const labels = (await page.locator('.shop-item .btn').allInnerTexts()).map((t) => t.trim());
  await page.locator('.shop .actions .btn').click();
  return labels;
}

/** Ждём, пока восстановление после запуска отработает (или упадёт). */
async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
}

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== 0. Обычная сборка без адреса сервера: поведение прежнее ===');
  {
    const { context, page } = await open(browser, PLAIN, VK_LAUNCH);
    await settle(page);
    assert(page.restoreCalls.length === 0, 'ни одного запроса восстановления');
    assert((await page.locator('.shop-btn').count()) === 1, 'магазин ВК на месте');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 1. Оплатил и закрыл игру до ответа окна → при запуске покупка восстановлена ===');
  {
    const state = { mode: 'ok', journal: [NO_ADS], requests: [] };
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state });
    await settle(page);
    assert(state.requests.some((r) => r.startsWith('/vk/restore?')), 'запрос ушёл на /vk/restore');
    const sent = new URL(SERVER + state.requests[0]).searchParams;
    assert(sent.get('sign') === 'test-sign' && !sent.has('lang'), 'переданы подписанные vk_* и sign, без лишнего');
    assert((await shopLabels(page))[0] === 'Куплено', '«Без рекламы» — «Куплено» без единой покупки в этой сессии');

    console.log('\n=== 2. Повторный запуск при недоступном сервере — право сохраняется ===');
    state.mode = 'down';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    assert((await shopLabels(page))[0] === 'Куплено', 'после перезапуска без сервера покупка на месте');
    assert((await page.locator('.toast').count()) === 0, 'игроку не показана ошибка сервера');

    console.log('\n=== 3. Повторное восстановление ничего не ломает ===');
    state.mode = 'ok';
    for (let i = 0; i < 2; i += 1) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page);
    }
    const labels = await shopLabels(page);
    assert(labels[0] === 'Куплено' && labels[1] !== 'Куплено', 'после двух повторов: куплено ровно то, что в журнале');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 4. Окно оплаты вернуло ошибку, а оплата прошла → товар появляется после попытки ===');
  {
    const state = { mode: 'ok', journal: [], requests: [] };
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state, approvePurchase: false });
    await settle(page);
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    state.journal = [HINTS]; // сервер подтвердил оплату, клиент получил ошибку окна
    const before = state.requests.length;
    await page.locator('.shop-item').nth(1).locator('.btn').click();
    await page.waitForFunction(() => document.querySelectorAll('.shop-item .btn')[1].textContent.trim() === 'Куплено', null, { timeout: 7000 });
    assert(state.requests.length > before, 'после попытки покупки игра запросила журнал');
    assert(true, 'кнопка «Безлимитные подсказки» стала «Куплено»');
    assert((await page.locator('.toast').count()) === 0, 'ложного «Покупка не завершилась» нет');
    await page.locator('.shop .actions .btn').click();

    console.log('\n=== 4б. Окно вернуло ошибку и журнал оплату не подтвердил → честная ошибка ===');
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    await page.locator('.shop-item').first().locator('.btn').click();
    await page.waitForSelector('.toast', { timeout: 7000 });
    assert((await page.locator('.shop-item .btn').first().innerText()).trim() !== 'Куплено', 'кнопка вернулась к «Купить…»');
    assert(await page.locator('.shop-item .btn').first().isEnabled(), 'можно попробовать ещё раз');
    await context.close();
  }

  console.log('\n=== 5. Старая покупка ВК, которой нет в журнале, не снимается ===');
  {
    const state = { mode: 'ok', journal: [], requests: [] };
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state, approvePurchase: true });
    await settle(page);
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    await page.locator('.shop-item').first().locator('.btn').click();
    await page.waitForFunction(() => document.querySelector('.shop-item .btn').textContent.trim() === 'Куплено', null, { timeout: 7000 });
    await page.locator('.shop .actions .btn').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    assert(state.journal.length === 0, 'журнал пуст (покупка «до журнала»)');
    assert((await shopLabels(page))[0] === 'Куплено', 'после запуска с пустым журналом покупка осталась');
    await context.close();
  }

  console.log('\n=== 6. Сервер недоступен, не настроен или завис — игра не блокируется ===');
  for (const mode of ['down', '503', 'hang']) {
    const state = { mode, journal: [NO_ADS], requests: [] };
    const started = Date.now();
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state });
    const ready = Date.now() - started;
    assert(ready < 6000, `${mode}: игра на экране через ${ready} мс`);
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    assert((await page.locator('.shop-item .btn').first().innerText()).trim() !== 'Куплено', `${mode}: без ответа сервера права не выдуманы`);
    assert((await page.locator('.toast').count()) === 0, `${mode}: ошибка игроку не показана`);
    assert(page.errors.length === 0, `${mode}: без ошибок: ` + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 7. Запуск в ОК: запрос на /ok/restore, магазин ОК по-прежнему скрыт ===');
  {
    const state = { mode: 'ok', journal: [], requests: [] };
    const { context, page } = await open(browser, RESTORE, OK_LAUNCH, { state });
    await settle(page);
    assert(state.requests.some((r) => r.startsWith('/ok/restore?')), 'запрос ушёл на /ok/restore');
    assert(!state.requests.some((r) => r.startsWith('/vk/restore')), 'запроса к журналу ВК нет');
    assert((await page.locator('.shop-btn').count()) === 0, 'кнопки магазина в ОК нет');
    await context.close();
  }

  console.log('\n=== 8. test/live: клиент верит только своему серверу; «рабочий» пустой ответ ничего не снимает ===');
  {
    // Тестовая покупка записана в тестовом журнале; рабочий сервер о ней не знает.
    const state = { mode: 'ok', journal: [HINTS], requests: [] };
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state });
    await settle(page);
    state.journal = []; // тот же игрок, ответ «рабочего» журнала
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    assert((await shopLabels(page))[1] === 'Куплено', 'пустой ответ не отзывает выданное право');
    assert(state.requests.every((r) => r.startsWith('/vk/restore')), 'все запросы — только к адресу этой сборки');
    await context.close();
  }

  /** Ответ сервера придёт, только когда сценарий вызовет release(). */
  function delayed(journal) {
    const state = { mode: 'ok', journal, requests: [] };
    state.gate = new Promise((resolve) => {
      state.release = resolve;
    });
    return state;
  }

  console.log('\n=== 9. Задержанное восстановление при открытом магазине — кнопки обновляются без перезагрузки ===');
  {
    const state = delayed([NO_ADS]);
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state });
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    const buttons = page.locator('.shop-item .btn');
    assert((await buttons.first().innerText()).trim() !== 'Куплено', 'до ответа сервера «Без рекламы» ещё не куплено');
    state.release();
    await page.waitForFunction(() => document.querySelector('.shop-item .btn').textContent.trim() === 'Куплено', null, { timeout: 3000 });
    assert(await buttons.first().isDisabled(), 'после ответа — «Куплено» и кнопка неактивна, магазин не закрывался');
    assert((await buttons.nth(1).innerText()).trim() !== 'Куплено', 'второй товар не тронут');
    assert((await page.locator('.shop-price').first().innerText()).includes('20'), 'цена купленного товара осталась на экране');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 10. Задержанное восстановление на экране дела — подсказка без рекламы без перезагрузки ===');
  {
    const state = delayed([HINTS]);
    const { context, page } = await open(browser, RESTORE, VK_LAUNCH, { state, ads: true });
    await page.getByRole('button', { name: /Чей пирог остался в беседке/ }).click();
    try {
      await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 1500 });
    } catch {
      /* обучающего диалога нет */
    }
    await page.waitForSelector('.case');
    const hint = page.locator('.hint-btn');
    await hint.click(); // первая подсказка бесплатна
    await page.waitForFunction(() => /рекламу/.test(document.querySelector('.hint-btn').textContent), null, { timeout: 3000 });
    assert(true, 'до ответа сервера предлагается «Ещё подсказка за рекламу»');
    state.release();
    await page.waitForFunction(() => !/рекламу/.test(document.querySelector('.hint-btn').textContent), null, { timeout: 3000 });
    assert((await hint.innerText()).trim() === '💡 Ещё подсказка', 'после ответа — «Ещё подсказка», без упоминания рекламы');
    const adsBefore = await page.evaluate(() => window.__adsShown);
    await hint.click();
    await page.waitForTimeout(500);
    assert((await page.evaluate(() => window.__adsShown)) === adsBefore, 'следующая подсказка выдана без показа рекламы');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
