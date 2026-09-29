/**
 * Живая проверка магазина обеих игр — та самая, которой не хватило перед
 * отказом VK 28 сентября: «стоимость покупки должна быть явно указана и
 * видна до нажатия на кнопку „Купить“».
 *
 * Почему отдельный скрипт, а не сценарий в playtest-<игра>.cjs: магазин
 * существует только там, где площадка умеет платежи. На web-сборке
 * `caps.payments === false`, и кнопки магазина нет вовсе — это правильное
 * поведение (правило 2 CLAUDE.md, не показывать мёртвых кнопок), но
 * проверить на ней нечего. Поэтому здесь поднимается VK-сборка, а
 * `@vkontakte/vk-bridge` отвечает заглушкой: bridge вне VK шлёт
 * postMessage в parent (на верхнем уровне это само окно) и ждёт ответ с
 * тем же request_id. Продакшен-код ради теста не меняется ни на строку.
 *
 * Запуск (две команды в разных терминалах или через свои preview-серверы):
 *   node tools/playtest-shop.cjs <url-дачных-тайн> <url-sudoku>
 */
const { chromium } = require('playwright');

const DACHNYE = process.argv[2] || 'http://127.0.0.1:4178/';
const SUDOKU = process.argv[3] || 'http://127.0.0.1:4177/';

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

/** Минимальный VK-клиент: отвечает ровно на то, что игра спрашивает при запуске. */
async function stubVkBridge(page) {
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'vk-connect' || !msg.handler) return;
      const requestId = msg.params && msg.params.request_id;
      const ok = (data) =>
        window.postMessage({ type: msg.handler + 'Result', data: Object.assign({ request_id: requestId }, data) }, '*');
      const fail = () =>
        window.postMessage({ type: msg.handler + 'Failed', data: { error_type: 'stub', request_id: requestId } }, '*');

      switch (msg.handler) {
        case 'VKWebAppInit':
          return ok({ result: true });
        case 'VKWebAppCheckNativeAds':
          return ok({ result: true });
        case 'VKWebAppGetUserInfo':
          return ok({ id: 1, first_name: 'Test', last_name: 'Player' });
        case 'VKWebAppStorageGet':
          return ok({ keys: [] });
        case 'VKWebAppStorageSet':
          return ok({ result: true });
        default:
          // Покупку намеренно НЕ подтверждаем: этот скрипт проверяет витрину
          // до нажатия, а не платёж. Настоящий платёж проверяется живыми
          // тестовыми покупками внутри VK — заглушкой это не заменить.
          return fail();
      }
    });
  });
}

async function openShop(browser, url, lang) {
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubVkBridge(page);
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}lang=${lang}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.shop-btn', { timeout: 8000 });
  await page.locator('.shop-btn').click();
  await page.waitForSelector('.shop-item');
  return { page, errors };
}

async function checkShop({ page, errors }, { name, expectPrice, expectButton }) {
  const items = await page.locator('.shop-item').count();
  assert(items === 2, `${name}: в магазине два товара`);

  const prices = await page.locator('.shop-price').allTextContents();
  assert(prices.length === 2, `${name}: цена показана у каждого товара ДО нажатия`);
  for (const price of prices) {
    assert(price.includes(expectPrice), `${name}: цена «${price}» содержит «${expectPrice}»`);
  }

  const buttons = await page.locator('.shop-item .btn').allTextContents();
  for (const label of buttons) {
    assert(label.includes(expectButton), `${name}: кнопка «${label}» называет цену`);
  }

  // Требование модератора буквально: увидеть стоимость можно, ничего не нажимая.
  const visibleText = await page.locator('.dialog.shop').innerText();
  assert(visibleText.includes(expectPrice), `${name}: стоимость видна в тексте витрины без единого клика`);

  assert(errors.length === 0, `${name}: без ошибок в консоли: ` + errors.join('; '));
  await page.close();
}

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== «Дачные тайны»: цена до нажатия ===');
  await checkShop(await openShop(browser, DACHNYE, 'ru'), {
    name: 'Дачные тайны',
    expectPrice: '20 голосов',
    expectButton: 'Купить за 20 голосов',
  });

  console.log('\n=== «Академия Sudoku», русский ===');
  await checkShop(await openShop(browser, SUDOKU, 'ru'), {
    name: 'Sudoku ru',
    expectPrice: '20 голосов',
    expectButton: 'Купить за 20 голосов',
  });

  console.log('\n=== «Академия Sudoku», английский ===');
  const en = await openShop(browser, SUDOKU, 'en');
  await checkShop(en, {
    name: 'Sudoku en',
    expectPrice: '20 votes',
    expectButton: 'Buy for 20 votes',
  });

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
