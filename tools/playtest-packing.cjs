/**
 * Браузерный сценарий локального прототипа упаковки: настоящие клики и
 * касания по настоящим кнопкам. Решения заказов берутся из тех же файлов,
 * что и юнит-тесты (prototypes/packing/test/*.json), — но игра принимает их
 * только через интерфейс: выбрать предмет, повернуть, коснуться клетки.
 *
 * Запуск (прототип должен быть собран и раздаваться на порту 5177):
 *   npm run build:packing
 *   npx vite preview prototypes/packing --port 5177 --strictPort
 *   node tools/playtest-packing.cjs [базовый-url]
 */
const { chromium } = require('playwright');
const solutions = require('../prototypes/packing/test/solutions.json');
const tempting = require('../prototypes/packing/test/tempting.json');

const BASE = process.argv[2] || 'http://127.0.0.1:5177/';
const SAVE_KEY = 'packing-proto:save:v1';
const LOG_KEY = 'packing-proto:log:v1';
const ALL_ORDERS = ['order-1', 'order-2', 'order-3', 'order-4', 'order-5'];

const url = (lang) => `${BASE}${BASE.includes('?') ? '&' : '?'}lang=${lang}`;

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

async function newPage(browser, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 420, height: 800 }, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.errors = errors;
  page.context_ = context;
  return page;
}

const cell = (page, x, y) => page.locator(`.cell[data-x="${x}"][data-y="${y}"]`);
const item = (page, id) => page.locator(`.tray-item[data-item="${id}"]`);

/** Играет раскладку через интерфейс; tap=true — сенсорными касаниями вместо мыши. */
async function playLayout(page, layout, tap = false) {
  const act = async (locator) => (tap ? locator.tap() : locator.click());
  for (const p of layout) {
    await act(item(page, p.itemId));
    for (let i = 0; i < p.rot; i += 1) await act(page.locator('.rotate-btn'));
    await act(cell(page, p.x, p.y));
  }
}

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function insideViewport(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  assert(
    !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5,
    `${label} целиком в окне ${vp.width}×${vp.height}`,
  );
}

(async () => {
  const browser = await chromium.launch();

  // --- 1. Вход сразу в первое задание ---
  console.log('\n=== 1. Вход сразу в первое задание ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    assert((await page.locator('.board .cell').count()) === 9, 'на экране сразу коробка 3×3 — без меню и заставок');
    assert(/Заказ 1 из 5/.test(await page.locator('.goal').innerText()), 'цель видна: «Заказ 1 из 5»');
    assert(/хрупкое/i.test(await page.locator('.rule').innerText()), 'правило про хрупкое и тяжёлое видно с первой секунды');
    assert((await page.locator('.legend .kind-badge').count()) === 3, 'легенда показывает три категории предметов');
    assert((await page.locator('.tray-item').count()) === 3, 'в ряду три предмета первого заказа');
    assert(/Выбери предмет/.test(await page.locator('.status').innerText()), 'статус подсказывает первое действие');
    assert((await page.locator('.order-chip:enabled').count()) === 1, 'доступен только первый заказ');
    assert((await overflowX(page)) <= 0, 'нет горизонтального переполнения на первом экране');
    assert(await page.locator('.rotate-btn').isDisabled(), 'поворот недоступен, пока в руке пусто');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();
  }

  // --- 2. Заказ 1 реальными кликами, переход ко второму — отдельное действие ---
  console.log('\n=== 2. Первый заказ мышью ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await playLayout(page, solutions['order-1']);
    assert(await page.locator('.result').isVisible(), 'верная раскладка собирает заказ');
    assert(/Заказ собран/.test(await page.locator('.status').innerText()), 'статус сообщает: заказ собран');
    assert(/Заказ 1 из 5/.test(await page.locator('.goal').innerText()), 'второй заказ сам не начался — переход добровольный');
    assert((await page.locator('.order-chip:enabled').count()) === 2, 'после сборки открылся второй заказ');
    await page.locator('.next-btn').click();
    assert(/Заказ 2 из 5/.test(await page.locator('.goal').innerText()), 'по кнопке открылся второй заказ');
    assert((await page.locator('.board .cell').count()) === 16, 'во втором заказе коробка 4×4');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();
  }

  // --- 3. Занятое место, повторное взятие, поворот, клавиатурные сокращения ---
  console.log('\n=== 3. Укладка, поворот, поднять и переложить ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });

    await item(page, 'teddy').click();
    assert(await page.locator('.rotate-btn').isEnabled(), 'с предметом в руке поворот доступен');
    await cell(page, 0, 0).click();
    await item(page, 'cup').click();
    await cell(page, 0, 0).click();
    assert(/занято/i.test(await page.locator('.status').innerText()), 'на занятое место положить нельзя — есть объяснение');
    assert((await item(page, 'cup').getAttribute('aria-pressed')) === 'true', 'отвергнутый предмет остался в руке, не пропал');

    await page.keyboard.press('Escape');
    assert((await item(page, 'cup').getAttribute('aria-pressed')) === 'false', 'Esc убирает предмет из руки');

    await item(page, 'book').click();
    const widthBefore = await item(page, 'book').locator('.mini').evaluate((el) => el.style.getPropertyValue('--mw'));
    await page.locator('.rotate-btn').click();
    const widthAfter = await item(page, 'book').locator('.mini').evaluate((el) => el.style.getPropertyValue('--mw'));
    assert(widthBefore === '2' && widthAfter === '1', 'кнопка «Повернуть» поворачивает книгу: 2×1 → 1×2');
    await page.keyboard.press('r');
    const widthKey = await item(page, 'book').locator('.mini').evaluate((el) => el.style.getPropertyValue('--mw'));
    assert(widthKey === '2', 'клавиша R тоже поворачивает, но кнопка не обязательна для мыши и касаний');

    await cell(page, 1, 2).click();
    assert((await cell(page, 1, 2).getAttribute('class')).includes('filled'), 'книга легла в коробку');
    await cell(page, 1, 2).click();
    assert((await item(page, 'book').getAttribute('aria-pressed')) === 'true', 'касание уложенного предмета возвращает его в руку');
    assert(!(await cell(page, 1, 2).getAttribute('class')).includes('filled'), 'клетка освободилась');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();
  }

  // --- 4. Неверная полная раскладка не даёт победу ---
  console.log('\n=== 4. Плотная, но неверная раскладка второго заказа ===');
  {
    const page = await newPage(browser, {});
    await page.addInitScript(
      ([key, ids]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 1, completed: ids }));
      },
      [SAVE_KEY, ['order-1']],
    );
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    assert(/Заказ 2 из 5/.test(await page.locator('.goal').innerText()), 'при открытии начат первый несобранный заказ');

    await playLayout(page, tempting['order-2']);
    assert((await page.locator('.tray-item').count()) === 0, 'все предметы лежат в коробке');
    assert(!(await page.locator('.result').isVisible()), 'победа не засчитана');
    assert((await page.locator('.cell.conflict').count()) > 0, 'нарушение подсвечено на поле');
    assert((await page.locator('.cell .warn').count()) > 0, 'нарушение помечено значком «!», а не только цветом');
    assert(/соприкасаются/.test(await page.locator('.status').innerText()), 'статус называет, какие предметы касаются');
    assert((await page.locator('.order-chip:enabled').count()) === 2, 'третий заказ не открылся');

    await page.locator('.reset-btn').click();
    assert((await page.locator('.cell.filled').count()) === 0, '«Начать заново» очищает коробку');
    assert((await page.locator('.tray-item').count()) === 4, 'и возвращает все предметы в ряд');

    await playLayout(page, solutions['order-2']);
    assert(await page.locator('.result').isVisible(), 'правильная раскладка того же заказа собирает его');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();
  }

  // --- 5. Сохранение, повреждённое сохранение, журнал ---
  console.log('\n=== 5. Перезагрузка, повреждённое сохранение, журнал событий ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await playLayout(page, solutions['order-1']);
    await page.locator('.next-btn').click();
    await playLayout(page, solutions['order-2']);

    // Журнал читаем до перезагрузки: время отсчитывается от открытия страницы
    // и после reload начинается заново.
    const log = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), LOG_KEY);
    const names = log.map((e) => e.e);
    for (const name of ['order_start', 'first_place', 'order_complete', 'next_order']) {
      assert(names.includes(name), `в журнале есть событие ${name}`);
    }
    assert(
      log.every((e, i) => Number.isFinite(e.t) && e.t >= 0 && (i === 0 || e.t >= log[i - 1].t)),
      'у каждого события есть относительное время, и оно не убывает',
    );
    const ordered = log.filter((e) => e.order === 'order-1').map((e) => e.e);
    assert(
      ordered.indexOf('order_start') < ordered.indexOf('first_place') && ordered.indexOf('first_place') < ordered.indexOf('order_complete'),
      'события первого заказа идут по порядку: старт → первое размещение → завершение',
    );

    await page.reload({ waitUntil: 'networkidle' });
    assert((await page.locator('.order-chip.done').count()) === 2, 'после перезагрузки два завершённых заказа отмечены');
    assert(/Заказ 3 из 5/.test(await page.locator('.goal').innerText()), 'игра продолжается с первого несобранного заказа');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();

    for (const bad of ['{not json', '{"completed":"order-1"}', '{"completed":["order-99",5,null]}', 'null']) {
      const corrupted = await newPage(browser);
      await corrupted.addInitScript(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, bad]);
      await corrupted.goto(url('ru'), { waitUntil: 'networkidle' });
      assert(
        (await corrupted.locator('.board .cell').count()) === 9 && (await corrupted.locator('.order-chip.done').count()) === 0,
        `повреждённое сохранение ${JSON.stringify(bad)} не ломает старт: начат первый заказ`,
      );
      assert(corrupted.errors.length === 0, 'без ошибок в консоли: ' + corrupted.errors.join('; '));
      await corrupted.context_.close();
    }
  }

  // --- 6. Клавиатура без мыши ---
  console.log('\n=== 6. Клавиатура ===');
  {
    const page = await newPage(browser);
    await page.goto(url('en'), { waitUntil: 'networkidle' });
    await item(page, 'teddy').focus();
    await page.keyboard.press('Enter');
    assert((await item(page, 'teddy').getAttribute('aria-pressed')) === 'true', 'предмет выбирается с клавиатуры (Enter)');
    await cell(page, 0, 0).focus();
    await page.keyboard.press('Enter');
    assert((await cell(page, 0, 0).getAttribute('class')).includes('filled'), 'клетка коробки принимает предмет с клавиатуры');
    assert(/teddy/i.test((await cell(page, 0, 0).getAttribute('aria-label')) || ''), 'клетка озвучивает содержимое в aria-label');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();
  }

  // --- 7. Сенсорный режим ---
  console.log('\n=== 7. Касания (телефон) ===');
  {
    const page = await newPage(browser, { hasTouch: true, isMobile: true, viewport: { width: 420, height: 800 } });
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await playLayout(page, solutions['order-1'], true);
    assert(await page.locator('.result').isVisible(), 'первый заказ собирается одними касаниями');
    await page.locator('.next-btn').tap();
    await playLayout(page, solutions['order-2'], true);
    assert(await page.locator('.result').isVisible(), 'второй заказ с поворотами — тоже касаниями');
    const minTap = await page.evaluate(() =>
      Math.min(...[...document.querySelectorAll('.tray-item, .actions .btn, .order-chip')].filter((n) => n.getClientRects().length > 0).map((n) => Math.min(n.getBoundingClientRect().width, n.getBoundingClientRect().height))),
    );
    assert(minTap >= 44 - 0.5, `цели касания не меньше 44px (минимум ${minTap.toFixed(1)}px)`);
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.context_.close();
  }

  // --- 8. Размеры окна × языки × тёмная тема, самый плотный заказ ---
  console.log('\n=== 8. Размеры окна, RU/EN, тёмная тема ===');
  for (const vp of [{ width: 907, height: 510 }, { width: 420, height: 800 }]) {
    for (const lang of ['ru', 'en']) {
      for (const scheme of ['light', 'dark']) {
        const label = `${vp.width}×${vp.height} ${lang} ${scheme}`;
        const page = await newPage(browser, { viewport: vp, colorScheme: scheme });
        await page.addInitScript(([k, ids]) => localStorage.setItem(k, JSON.stringify({ v: 1, completed: ids })), [
          SAVE_KEY,
          ALL_ORDERS.slice(0, 3),
        ]);
        await page.goto(url(lang), { waitUntil: 'networkidle' });
        assert(/4/.test(await page.locator('.goal').innerText()), `${label}: открыт четвёртый заказ (5×5, шесть предметов)`);
        assert((await overflowX(page)) <= 0, `${label}: нет горизонтального переполнения`);
        await insideViewport(page, page.locator('.board'), `${label}: коробка`);
        await insideViewport(page, page.locator('.tray'), `${label}: ряд предметов`);
        await item(page, 'lamp').click();
        await insideViewport(page, page.locator('.rotate-btn'), `${label}: кнопка поворота`);
        if (lang === 'en') {
          const text = await page.locator('.screen').innerText();
          assert(!/[А-Яа-яЁё]/.test(text), `${label}: на экране нет кириллицы`);
        }
        await page.keyboard.press('Escape');
        await playLayout(page, solutions['order-4']);
        assert(await page.locator('.result').isVisible(), `${label}: заказ собирается`);
        await insideViewport(page, page.locator('.next-btn'), `${label}: кнопка следующего заказа`);
        assert(page.errors.length === 0, `${label}: без ошибок в консоли: ` + page.errors.join('; '));
        await page.context_.close();
      }
    }
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
