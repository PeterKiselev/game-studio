/**
 * QA английской версии «Академии Sudoku» на всех размерах окна, которые
 * реально используют CrazyGames Basic Launch и Poki Playtest.
 *
 * Отдельный файл, не сценарий внутри playtest-sudoku.cjs: там уже есть
 * одна проверка размера (907×510, встроенный плеер CrazyGames) — здесь
 * тот же принцип прогоняется по всем восьми размерам сразу, и добавлена
 * проверка практики (не только урока), которой в исходном файле не было.
 *
 * Размеры площадок — из карточки этапа в WORK_QUEUE.md, сверены Codex по
 * официальной документации 30 сентября 2026:
 *   CrazyGames: 907×510 (встроенный плеер), 1216×684, 821×462, 800×450.
 *   Poki:       640×360, 836×470, 1031×580 (масштабируемые варианты 16:9,
 *               см. developers.poki.com/guide/requirements-quality).
 *   Портретный телефон 420×800 — тот же viewport, что уже используют
 *   остальные сценарии `playtest-sudoku.cjs`, добавлен для полноты: оба
 *   портала отдают игру и на мобильных браузерах, не только в iframe на
 *   десктопе.
 *
 * На каждом размере проверяется: без горизонтального переполнения; первый
 * урок открывается одним кликом и решается до конца; сетка/цифры/кнопка
 * перехода реально видны и целиком в окне; практика запускается и
 * сохраняет прогресс через перезагрузку; ни одной кириллической буквы на
 * экране; ноль ошибок в консоли.
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4176/';

function url(lang) {
  return `${BASE}${BASE.includes('?') ? '&' : '?'}lang=${lang}`;
}

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

async function newPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  return page;
}

async function assertNoOverflow(page, viewport, where) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `${where}: нет горизонтального переполнения (запас ${-overflow}px)`);
}

async function assertBoundedVisible(page, selector, viewport, where) {
  const locator = page.locator(selector).first();
  assert(await locator.isVisible(), `${where}: ${selector} действительно виден`);
  const box = await locator.boundingBox();
  assert(!!box && box.width > 0 && box.height > 0, `${where}: ${selector} имеет ненулевой размер`);
  assert(
    !!box &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height,
    `${where}: ${selector} целиком в окне ${viewport.width}×${viewport.height}`,
  );
}

async function assertNoCyrillic(page, selector, where) {
  const text = await page.locator(selector).innerText();
  assert(!/[А-Яа-яЁё]/.test(text), `${where}: без кириллицы — ${text.replace(/\n/g, ' | ').slice(0, 200)}`);
}

/** Решает открытый урок английской подсказкой — тот же разбор текста, что в playtest-sudoku.cjs. */
async function solveOpenLesson(page, where) {
  const explanation = await page.locator('.lesson-feedback').innerText();
  const cells = [...explanation.matchAll(/row (\d+), column (\d+)\)/g)];
  const value = explanation.match(/can only be (\d+)/);
  assert(cells.length > 0 && !!value, `${where}: объяснение называет клетку и цифру`);
  const target = cells[cells.length - 1];
  const index = (Number(target[1]) - 1) * 9 + Number(target[2]) - 1;
  await page.locator('.sudoku-cell').nth(index).click();
  await page.locator('.digit-btn', { hasText: String(value[1]) }).click();
  assert(await page.locator('.academy-lesson .btn.primary').isVisible(), `${where}: урок решён, переход открыт`);
}

async function checkViewport(browser, viewport, label) {
  console.log(`\n=== ${label} (${viewport.width}×${viewport.height}) ===`);
  const page = await newPage(browser, viewport);
  await page.goto(url('en'), { waitUntil: 'networkidle' });

  await assertNoOverflow(page, viewport, `${label}: меню`);
  await assertNoCyrillic(page, '.menu', `${label}: меню`);

  // Урок — один клик от первого экрана, как требует карточка.
  await page.locator('.academy-card').click();
  await page.waitForSelector('.academy-lesson');
  await assertNoOverflow(page, viewport, `${label}: урок`);
  for (const selector of ['.sudoku-grid', '.numpad', '.digit-btn', '.academy-lesson .topbar .btn']) {
    await assertBoundedVisible(page, selector, viewport, `${label}: урок`);
  }
  await solveOpenLesson(page, label);
  await assertBoundedVisible(page, '.academy-lesson .btn.primary', viewport, `${label}: урок завершён`);
  await assertNoCyrillic(page, '.screen', `${label}: экран урока`);

  // Практика — второй самостоятельный режим, не только курс.
  await page.locator('.academy-lesson .topbar .btn').click(); // назад к списку уроков
  await page.waitForSelector('.academy');
  await page.locator('.topbar .btn').click(); // назад в меню
  await page.waitForSelector('.menu');

  await page.locator('.difficulty-card').first().click();
  await page.waitForSelector('.puzzle');
  await assertNoOverflow(page, viewport, `${label}: практика`);
  for (const selector of ['.sudoku-grid', '.numpad', '.hint-btn']) {
    await assertBoundedVisible(page, selector, viewport, `${label}: практика`);
  }

  const cell = page.locator('.sudoku-cell:not(.given)').first();
  await cell.click();
  await page.locator('.digit-btn', { hasText: '5' }).click();
  await page.waitForTimeout(1700); // дебаунс автосохранения SaveStore — 1500мс, см. playtest-sudoku.cjs

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.menu');
  const status = await page.locator('.difficulty-card').first().locator('.best').innerText();
  assert(status === 'Resume', `${label}: практика сохраняется — меню честно предлагает «Resume» после reload`);

  assert(page.errors.length === 0, `${label}: без ошибок в консоли за весь проход: ` + page.errors.join('; '));
  await page.close();
}

const VIEWPORTS = [
  { label: 'CrazyGames — встроенный плеер', width: 907, height: 510 },
  { label: 'CrazyGames — широкий десктоп', width: 1216, height: 684 },
  { label: 'CrazyGames — узкий десктоп', width: 821, height: 462 },
  { label: 'CrazyGames — минимальный', width: 800, height: 450 },
  { label: 'Poki — 640×360', width: 640, height: 360 },
  { label: 'Poki — 836×470', width: 836, height: 470 },
  { label: 'Poki — 1031×580', width: 1031, height: 580 },
  { label: 'Портретный телефон', width: 420, height: 800 },
];

(async () => {
  const browser = await chromium.launch();
  for (const { label, width, height } of VIEWPORTS) {
    await checkViewport(browser, { width, height }, label);
  }
  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
