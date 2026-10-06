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

/**
 * Минимальный VK-клиент: отвечает ровно на то, что игра спрашивает.
 *
 * `approvePurchase` управляет ответом на `VKWebAppShowOrderBox`. Адаптер
 * считает покупку удачной по полю `success` (packages/platform/src/adapters/vk.ts),
 * поэтому именно его заглушка и возвращает.
 *
 * Важно понимать границу: это проверка **реакции клиента** на успешный
 * ответ Bridge — что состояние покупки применилось и кнопка стала
 * «Куплено». Настоящий платёж заглушкой не проверяется и не заменяется:
 * списание голосов и вызовы Worker проверяются только живыми тестовыми
 * покупками внутри VK.
 */
async function stubVkBridge(page, { approvePurchase = false } = {}) {
  await page.addInitScript((approve) => {
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
        case 'VKWebAppShowOrderBox':
          return approve ? ok({ success: true }) : fail();
        default:
          return fail();
      }
    });
  }, approvePurchase);
}

/**
 * Видно ли по-настоящему. `textContent` есть и у скрытого узла, поэтому
 * требование модератора «стоимость видна» проверяется видимостью и
 * положением в окне, а не наличием строки в разметке.
 */
async function assertVisibleIn(locator, viewport, what) {
  const visible = await locator.isVisible();
  assert(visible, `${what}: элемент действительно виден`);
  const box = await locator.boundingBox();
  assert(!!box && box.width > 0 && box.height > 0, `${what}: элемент имеет ненулевой размер`);
  assert(
    box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    `${what}: элемент целиком в окне ${viewport.width}×${viewport.height}`,
  );
}

const VIEWPORT = { width: 420, height: 800 };

async function openShop(browser, url, lang, options = {}) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubVkBridge(page, options);
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}lang=${lang}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.shop-btn', { timeout: 8000 });
  await page.locator('.shop-btn').click();
  await page.waitForSelector('.shop-item');
  return { page, errors };
}

async function checkShop({ page, errors }, { name, expectPrice, expectButton }) {
  const items = await page.locator('.shop-item').count();
  assert(items === 2, `${name}: в магазине два товара`);

  const prices = page.locator('.shop-price');
  assert((await prices.count()) === 2, `${name}: цена есть у каждого товара ДО нажатия`);
  for (let i = 0; i < 2; i += 1) {
    await assertVisibleIn(prices.nth(i), VIEWPORT, `${name}: цена товара ${i + 1}`);
    assert(
      (await prices.nth(i).innerText()).includes(expectPrice),
      `${name}: цена товара ${i + 1} — «${expectPrice}»`,
    );
  }

  const buttons = page.locator('.shop-item .btn');
  for (let i = 0; i < 2; i += 1) {
    await assertVisibleIn(buttons.nth(i), VIEWPORT, `${name}: кнопка покупки ${i + 1}`);
    assert(
      (await buttons.nth(i).innerText()).includes(expectButton),
      `${name}: кнопка ${i + 1} называет цену — «${expectButton}»`,
    );
  }

  assert(errors.length === 0, `${name}: без ошибок в консоли: ` + errors.join('; '));
  await page.close();
}

/**
 * Успешная покупка глазами клиента: кнопка становится «Куплено», а цена
 * **остаётся на экране и не меняется**. Второе важнее первого — именно
 * ради него цена вынесена отдельной строкой, а не спрятана в подпись
 * кнопки, которая после покупки текст теряет.
 *
 * Заодно это единственная живая проверка рефакторинга
 * `item.apply` → `SHOP_EFFECTS[item.sku].apply`: если ключ разъедется с
 * каталогом, покупка молча не применится, и сценарий это увидит.
 */
async function checkSuccessfulPurchase({ page, errors }, { name, expectPrice, expectOwned }) {
  const firstItem = page.locator('.shop-item').first();
  const priceBefore = await firstItem.locator('.shop-price').innerText();
  const button = firstItem.locator('.btn');

  await button.click();
  await page.waitForFunction(
    ([expected]) => {
      const btn = document.querySelector('.shop-item .btn');
      return !!btn && btn.textContent.trim() === expected;
    },
    [expectOwned],
    { timeout: 5000 },
  );
  assert(true, `${name}: после успешной покупки кнопка стала «${expectOwned}»`);
  assert(await button.isDisabled(), `${name}: купленный товар нельзя купить повторно`);

  const price = firstItem.locator('.shop-price');
  await assertVisibleIn(price, VIEWPORT, `${name}: цена после покупки`);
  const priceAfter = await price.innerText();
  assert(priceAfter === priceBefore, `${name}: цена не изменилась после покупки («${priceAfter}»)`);
  assert(priceAfter.includes(expectPrice), `${name}: цена осталась «${expectPrice}»`);

  /*
   * Ключевая проверка, и она не про надпись. Подпись кнопки меняется сразу
   * после успешного ответа Bridge — независимо от того, применилось ли
   * состояние покупки в сохранении. Проверено негативным контролем:
   * сломанный ключ SHOP_EFFECTS сценарий БЕЗ этой перезагрузки проходил.
   *
   * Поэтому перезагружаем страницу и открываем магазин заново: если
   * покупка реально применилась и сохранилась, товар уже помечен
   * купленным до всякого клика.
   */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.shop-btn', { timeout: 8000 });
  await page.locator('.shop-btn').click();
  await page.waitForSelector('.shop-item');

  const restored = page.locator('.shop-item').first();
  const restoredLabel = (await restored.locator('.btn').innerText()).trim();
  assert(
    restoredLabel === expectOwned,
    `${name}: покупка пережила перезагрузку — кнопка «${restoredLabel}» без единого клика`,
  );
  await assertVisibleIn(restored.locator('.shop-price'), VIEWPORT, `${name}: цена купленного товара после перезагрузки`);
  assert(
    (await restored.locator('.shop-price').innerText()).includes(expectPrice),
    `${name}: у купленного товара цена по-прежнему «${expectPrice}»`,
  );

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
  await checkShop(await openShop(browser, SUDOKU, 'en'), {
    name: 'Sudoku en',
    expectPrice: '20 votes',
    expectButton: 'Buy for 20 votes',
  });

  console.log('\n=== Успешная покупка: «Дачные тайны» ===');
  await checkSuccessfulPurchase(await openShop(browser, DACHNYE, 'ru', { approvePurchase: true }), {
    name: 'Дачные тайны',
    expectPrice: '20 голосов',
    expectOwned: 'Куплено',
  });

  console.log('\n=== Успешная покупка: «Академия Sudoku», русский ===');
  await checkSuccessfulPurchase(await openShop(browser, SUDOKU, 'ru', { approvePurchase: true }), {
    name: 'Sudoku ru',
    expectPrice: '20 голосов',
    expectOwned: 'Куплено',
  });

  console.log('\n=== Успешная покупка: «Академия Sudoku», английский ===');
  await checkSuccessfulPurchase(await openShop(browser, SUDOKU, 'en', { approvePurchase: true }), {
    name: 'Sudoku en',
    expectPrice: '20 votes',
    expectOwned: 'Purchased',
  });

  /*
   * Замечание модерации VK: «магазин не обнаруживается на первом экране».
   * Кнопка должна быть видна в окне сразу после загрузки меню, без прокрутки,
   * — на телефоне и на десктопе.
   */
  console.log('\n=== Sudoku: магазин виден на первом экране ===');
  for (const [w, h] of [[360, 640], [420, 800], [1000, 700], [1280, 720]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await stubVkBridge(page);
    await page.goto(`${SUDOKU}?lang=ru`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.shop-btn', { timeout: 8000 });
    await assertVisibleIn(page.locator('.shop-btn'), { width: w, height: h }, `первый экран ${w}×${h}: кнопка магазина`);
    await page.locator('.shop-btn').click();
    await page.waitForSelector('.shop-item');
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('.shop-item .btn, .shop-item .shop-price')].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.right > window.innerWidth + 1 || r.left < -1;
      }).length,
    );
    assert(clipped === 0, `экран магазина ${w}×${h}: цены и кнопки не обрезаны по ширине`);
    await page.close();
  }

  /*
   * ОК: модератор «Дачных тайн» ответил «Платежи не работают». В ОК нет
   * VKWebAppShowOrderBox (apiok.ru/apps/vk), поэтому при vk_client=ok магазина
   * быть не должно вовсе, а ни одного вызова ShowOrderBox — тоже.
   * Заглушка — не настоящая ОК: реальную среду проверяет только владелец.
   */
  console.log('\n=== ОК (vk_client=ok): платежи выключены, магазин скрыт ===');
  for (const [name, url] of [['Дачные тайны', DACHNYE], ['Sudoku', SUDOKU]]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await stubVkBridge(page, { approvePurchase: true });
    await page.addInitScript(() => {
      window.addEventListener('message', (e) => {
        if (e.data && e.data.handler === 'VKWebAppShowOrderBox') window.__orderBoxCalled = true;
      });
    });
    await page.goto(`${url}?vk_client=ok&lang=ru`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert((await page.locator('.shop-btn').count()) === 0, `${name} в ОК: кнопки магазина нет`);
    assert(!(await page.evaluate(() => window.__orderBoxCalled)), `${name} в ОК: VKWebAppShowOrderBox не вызывался`);
    assert(errors.length === 0, `${name} в ОК: без ошибок в консоли: ` + errors.join('; '));
    await page.close();
  }

  // Контрольная пара: тот же стенд без vk_client по-прежнему показывает магазин (VK не тронут).
  for (const [name, url] of [['Дачные тайны', DACHNYE], ['Sudoku', SUDOKU]]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await stubVkBridge(page);
    await page.goto(`${url}?vk_client=vk&lang=ru`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.shop-btn', { timeout: 8000 });
    assert(true, `${name} во ВКонтакте (vk_client=vk): магазин на месте`);
    await page.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
