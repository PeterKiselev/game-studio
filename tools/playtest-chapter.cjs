/**
 * Глава 1 «Тихая вода», дело 1 «Шланг у водокачки» — в настоящем браузере.
 *
 * Что проверяем: старые сохранения (v3 и v1) загружаются, шесть прежних дел и
 * покупки на месте, новое дело появляется седьмым; дело проходится подсказками
 * до развязки с находкой; вступление, факты, сетки и развязка не ломают вёрстку
 * на телефоне и на десктопе (геометрия, а не только отсутствие прокрутки).
 *
 * Запуск: node tools/playtest-chapter.cjs <url-web-сборки>
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4175/';
const KEY = 'studio:dachnye-tainy';
const OLD_SIX = ['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1'];
const TITLE = /Шланг у водокачки/;

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

async function openWithSave(browser, envelope, viewport = { width: 420, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  if (envelope) {
    await page.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('seeded', '1');
      }
    }, [KEY, JSON.stringify(envelope)]);
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.case-list');
  return { context, page };
}

async function openChapterCase(page) {
  await page.getByRole('button', { name: TITLE }).click();
  try {
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 1000 });
  } catch {
    /* обучение уже видели */
  }
  await page.waitForSelector('.case');
}

/**
 * Верные пары только таблиц ответа (соседи — время, соседи — вещь). Вспомогательную
 * таблицу «время — вещь» намеренно не трогаем: раскрытие засчитывается без неё, и
 * игра об этом прямо говорит.
 */
const SOLUTION_YES = [
  ['Зоя', '7:00'], ['Игорь', '6:00'], ['Настя', '8:00'], ['Рома', '9:00'],
  ['Зоя', 'ведро'], ['Игорь', 'канистра'], ['Настя', 'лейка'], ['Рома', 'шланг'],
];

/** Клик до состояния «да»; клетка ищется в любом порядке строка/столбец. */
async function clickYes(page, a, b) {
  let cell = page.locator(`button[aria-label="${a} — ${b}"]`).first();
  if ((await cell.count()) === 0) cell = page.locator(`button[aria-label="${b} — ${a}"]`).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Дело раскрывается, как только сетка однозначна, и через ~0,5 с экран
    // сменяется развязкой — клик может застать клетку уже отсоединённой.
    if ((await page.locator('.reveal').count()) > 0 || (await cell.count()) === 0) return;
    if (await cell.evaluate((el) => el.classList.contains('yes')).catch(() => true)) return;
    await cell.click({ timeout: 2000 }).catch(() => {});
  }
}

async function solve(page) {
  for (const [a, b] of SOLUTION_YES) {
    if ((await page.locator('.reveal').count()) > 0) return;
    await clickYes(page, a, b);
  }
  await page.waitForSelector('.reveal', { timeout: 5000 });
}

/** Пары блоков, которые не должны пересекаться, и выход за ширину окна. */
async function geometry(page, pairs) {
  return page.evaluate((pairs) => {
    const out = [];
    const r = (sel) => {
      const n = document.querySelector(sel);
      return n ? n.getBoundingClientRect() : null;
    };
    for (const [a, b] of pairs) {
      const ra = r(a);
      const rb = r(b);
      if (!ra || !rb || ra.width === 0 || rb.width === 0) continue;
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 1 && iy > 1) out.push(`${a}×${b} ${Math.round(iy)}px`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('горизонтальная прокрутка');
    for (const sel of ['.case-intro', '.clues', '.finding', '.reveal-text']) {
      const n = r(sel);
      if (n && (n.left < -1 || n.right > window.innerWidth + 1)) out.push(`${sel} шире окна`);
    }
    return out;
  }, pairs);
}

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== 1. Сохранение v3 (все шесть дел, покупка, достижения) ===');
  {
    const v3 = {
      v: 3,
      t: Date.now(),
      data: {
        casesCompleted: OLD_SIX,
        progress: {},
        stars: Object.fromEntries(OLD_SIX.map((id) => [id, 3])),
        achievements: ['first_case', 'all_cases'],
        purchases: { noAds: true },
        onboardingSeen: true,
      },
    };
    const { context, page } = await openWithSave(browser, v3);
    const cards = page.locator('.case-card');
    assert((await cards.count()) === 7, 'на участке семь дел');
    for (let i = 0; i < 6; i += 1) {
      assert((await cards.nth(i).innerText()).includes('Раскрыто'), `прежнее дело ${i + 1} осталось раскрытым`);
    }
    assert((await cards.nth(6).innerText()).includes('Ждёт расследования'), 'новое дело седьмым и ждёт расследования');
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    assert(saved.data.purchases.noAds === true, 'покупка «Без рекламы» сохранилась');
    assert(saved.data.achievements.includes('all_cases'), 'полученное достижение «Все тайны участка» не отозвано');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 2. Сохранение v1 мигрирует как раньше, новое дело доступно ===');
  {
    const v1 = {
      v: 1,
      t: Date.now(),
      data: { casesCompleted: ['tutorial-1', 'second-1'], inProgress: { caseId: 'third-1', marks: {}, hintsUsed: 1 }, onboardingSeen: true },
    };
    const { context, page } = await openWithSave(browser, v1);
    const cards = page.locator('.case-card');
    assert((await cards.count()) === 7, 'семь дел после миграции v1');
    assert((await cards.nth(1).innerText()).includes('Раскрыто'), 'раскрытые в v1 дела остались раскрытыми');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 3. Прохождение дела до развязки и находки ===');
  {
    const { context, page } = await openWithSave(browser, null);
    await openChapterCase(page);
    assert((await page.locator('.case-intro').innerText()).includes('Кто принёс шланг?'), 'вступление с вопросом дела на экране');
    assert((await page.locator('.clues-title').innerText()).trim() === 'Факты', 'улики подписаны как факты');
    assert((await page.locator('.clues .clue').count()) === 7, 'семь фактов');
    const labels = (await page.locator('.grid-block .label').allInnerTexts()).map((t) => t.trim().toLowerCase());
    assert(
      JSON.stringify(labels) === JSON.stringify(['соседи — время у бака', 'соседи — что принесли', 'время у бака — что принесли']),
      `таблицы названы понятно и в порядке «ответ, ответ, вспомогательная»: ${labels.join(' | ')}`,
    );
    assert((await page.locator('.grids-goal').innerText()).includes('двух верхних таблицах'), 'над таблицами сказано, что нужно для раскрытия');
    assert((await page.locator('.grid-block.helper .grid-note').innerText()).includes('не обязательно'), 'третья таблица помечена как вспомогательная');
    assert((await page.locator('.grid-block.answer .grid-note').count()) === 0, 'у таблиц ответа такой пометки нет');

    // Подсказка показывает шаг рассуждения (отметку ставит игрок) — проверяем,
    // что первый шаг объясняется фактом, а не раскрывает ответ.
    await page.locator('.hint-btn').click();
    const hintText = await page.locator('.hint-text').innerText();
    assert(hintText.length > 20 && !/Рома.*шланг|шланг.*Рома/.test(hintText), 'первая подсказка объясняет шаг, не выдавая ответ');
    assert((await page.locator('.grid-block.helper .cell.yes').count()) === 0, 'вспомогательная таблица пуста до раскрытия');
    await solve(page);
    assert((await page.locator('.reveal-text').innerText()).includes('Шланг принёс Рома'), 'развязка совпадает с решением');
    const head = (await page.locator('.case-file-head').innerText()).toLowerCase();
    assert(head.includes('соседи') && head.includes('время у бака') && head.includes('что принесли'), `итог с заголовками «сосед — время — вещь»: ${head.replace(/\s+/g, ' ')}`);
    const rows = await page.locator('.case-file-row:not(.case-file-head)').allInnerTexts();
    assert(rows.length === 4 && rows.some((r) => /Рома[\s\S]*9:00[\s\S]*шланг/.test(r)), 'в итоге каждый сосед со своим временем и вещью');
    const finding = page.locator('.finding');
    assert(await finding.isVisible(), 'находка показана на развязке');
    assert((await finding.innerText()).includes('Склад правления'), 'находка — бирка склада правления');
    assert((await finding.innerText()).includes('Продолжение следует'), 'честно сказано, что продолжение впереди');
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    assert(saved.data.casesCompleted.includes('ch1-hose'), 'дело записано в раскрытые');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 4. Вёрстка: телефон, большой телефон, десктоп ===');
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const { context, page } = await openWithSave(browser, null, viewport);
    await openChapterCase(page);
    const caseIssues = await geometry(page, [
      ['.case-intro', '.clues'],
      ['.clues', '.grids-stack'],
      ['.case .topbar', '.case-intro'],
    ]);
    assert(caseIssues.length === 0, `${viewport.width}×${viewport.height}: экран дела без наложений` + (caseIssues.length ? ': ' + caseIssues.join('; ') : ''));
    const introBox = await page.locator('.case-intro').boundingBox();
    assert(introBox && introBox.y >= 0 && introBox.y < viewport.height, `${viewport.width}×${viewport.height}: вступление видно сразу`);
    const fontSize = await page.locator('.case-intro').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    assert(fontSize >= 14, `${viewport.width}×${viewport.height}: текст вступления не уменьшен (${fontSize}px)`);

    // «К таблицам»: есть ровно тогда, когда первая сетка ниже первого экрана.
    const below = await page.evaluate(() => {
      const scroller = document.querySelector('.case-scroll').getBoundingClientRect();
      return document.querySelector('.grids-stack').getBoundingClientRect().top >= scroller.bottom - 40;
    });
    const toGrids = page.locator('.to-grids');
    assert((await toGrids.isVisible()) === below, `${viewport.width}×${viewport.height}: кнопка «К таблицам» ${below ? 'показана — сетки ниже первого экрана' : 'скрыта — сетки видны сразу'}`);
    if (viewport.width === 360) assert(below, '360×640: сетки действительно ниже первого экрана (иначе проверка ничего не проверяет)');
    if (below) {
      const btnBox = await toGrids.boundingBox();
      assert(btnBox && btnBox.y + btnBox.height <= viewport.height, `${viewport.width}×${viewport.height}: кнопка видна без прокрутки`);
      await toGrids.click();
      await page.waitForTimeout(700); // плавная прокрутка
      const pos = await page.evaluate(() => {
        const grid = document.querySelector('.grids-stack').getBoundingClientRect();
        const bar = document.querySelector('.hint-bar').getBoundingClientRect();
        const scroller = document.querySelector('.case-scroll').getBoundingClientRect();
        return { top: grid.top, barTop: bar.top, scrollerTop: scroller.top };
      });
      assert(pos.top >= pos.scrollerTop - 1 && pos.top < pos.barTop - 40, `${viewport.width}×${viewport.height}: после нажатия начало таблиц на экране, над панелью подсказки`);
      await page.locator('.case-scroll').evaluate((n) => n.scrollTo(0, 0));
    }
    // Нижняя панель подсказки не закрывает последнюю сетку после прокрутки до конца.
    await page.locator('.case-scroll').evaluate((n) => n.scrollTo(0, n.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const covered = await page.evaluate(() => {
      const grids = [...document.querySelectorAll('.grids-stack > *')];
      const last = grids[grids.length - 1].getBoundingClientRect();
      const bar = document.querySelector('.hint-bar').getBoundingClientRect();
      return Math.max(0, last.bottom - bar.top);
    });
    assert(covered <= 1, `${viewport.width}×${viewport.height}: последняя сетка не уходит под панель подсказки (${Math.round(covered)}px)`);

    await solve(page);
    const revealIssues = await geometry(page, [['.reveal-text', '.finding']]);
    assert(revealIssues.length === 0, `${viewport.width}×${viewport.height}: развязка и находка без наложений` + (revealIssues.length ? ': ' + revealIssues.join('; ') : ''));
    await page.locator('.finding').scrollIntoViewIfNeeded();
    assert(await page.locator('.finding').isVisible(), `${viewport.width}×${viewport.height}: находка достижима прокруткой`);
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
