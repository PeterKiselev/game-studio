/**
 * «Дачные тайны», ежедневный режим — в настоящем браузере с подменой часов.
 *
 * Что проверяем: дело дня по московской дате при любом часовом поясе
 * устройства; смену суток в полночь по Москве, пока открыт участок;
 * перезагрузку посреди дела; раскрытие без влияния на дела участка,
 * звёзды, покупки и достижения; пропущенные дни без штрафов; честное
 * состояние до начала и после конца расписания; старые сохранения (v3, v1);
 * вёрстку участка и большого дела на телефоне и десктопе.
 *
 * Запуск: node tools/playtest-daily.cjs <url-web-сборки>
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4175/';
const KEY = 'studio:dachnye-tainy';
const OLD_SIX = ['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1'];

/** Московское время → момент: МСК = UTC+3. */
const msk = (local) => new Date(`${local}+03:00`);

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

async function open(browser, { at, save = null, viewport = { width: 420, height: 800 }, timezoneId = 'Asia/Vladivostok' }) {
  const context = await browser.newContext({ viewport, timezoneId });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.clock.install({ time: at });
  if (save) {
    await page.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('seeded', '1');
      }
    }, [KEY, JSON.stringify(save)]);
  }
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.case-list');
  return { context, page };
}

const saveOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
// textContent, а не innerText: у подписи text-transform: uppercase.
const label = (page) => page.locator('.daily-section > .plot-label').textContent();

async function closeOnboarding(page) {
  try {
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 1000 });
  } catch {
    /* обучение уже видели */
  }
}

async function clickYes(page, a, b) {
  let cell = page.locator(`button[aria-label="${a} — ${b}"]`).first();
  if ((await cell.count()) === 0) cell = page.locator(`button[aria-label="${b} — ${a}"]`).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await page.locator('.reveal').count()) > 0 || (await cell.count()) === 0) return;
    if (await cell.evaluate((el) => el.classList.contains('yes')).catch(() => true)) return;
    await cell.click({ timeout: 2000 }).catch(() => {});
  }
}

const GLASSES_YES = [
  ['Майя', 'веранда'], ['Борис', 'сарай'], ['Лёня', 'теплица'],
  ['Майя', 'ключи'], ['Борис', 'телефон'], ['Лёня', 'очки'],
];

async function solveGlasses(page) {
  for (const [a, b] of GLASSES_YES) await clickYes(page, a, b);
  await page.clock.runFor(1000); // переход на развязку — по таймеру 500 мс
  await page.waitForSelector('.reveal', { timeout: 5000 });
}

const V3_OLD = {
  v: 3,
  t: Date.parse('2026-10-01T10:00:00Z'),
  data: {
    casesCompleted: OLD_SIX,
    progress: {},
    stars: Object.fromEntries(OLD_SIX.map((id) => [id, 3])),
    achievements: ['first_case', 'all_cases', 'no_hints'],
    purchases: { noAds: true },
    onboardingSeen: true,
  },
};

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== 1. Дело дня по Москве при поясе устройства UTC+10 ===');
  {
    const { context, page } = await open(browser, { at: msk('2026-10-14T12:00:00') });
    assert((await label(page)).includes('14 октября'), 'Дело дня · 14 октября');
    const card = page.locator('.daily-card:not(.past)');
    assert((await card.count()) === 1 && (await card.innerText()).includes('Где очки?'), 'дело 14 октября — «Где очки?»');
    assert((await card.innerText()).includes('Ждёт расследования'), 'статус — ждёт расследования');
    assert((await page.locator('.daily-card.past').count()) === 0, 'прошлых дел дня ещё нет');
    assert((await page.locator('.case-card').count()) === 9, 'дела участка и главы на месте: 9');
    const order = await page.evaluate(() => {
      const d = document.querySelector('.daily-section').getBoundingClientRect().top;
      const c = document.querySelector('.case-list').getBoundingClientRect().top;
      return d < c;
    });
    assert(order, 'дело дня — над делами участка');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 2. Полночь по Москве, пока открыт участок (на устройстве уже 15-е) ===');
  {
    const { context, page } = await open(browser, { at: msk('2026-10-14T23:59:40') });
    assert((await label(page)).includes('14 октября'), 'в 23:59:40 МСК — ещё 14 октября, хотя во Владивостоке уже утро 15-го');
    await page.clock.runFor(40_000);
    await page.waitForFunction(() => document.querySelector('.daily-section > .plot-label').textContent.includes('15 октября'));
    assert((await label(page)).includes('15 октября'), 'после полуночи МСК участок сам перешёл на 15 октября');
    assert((await page.locator('.daily-card:not(.past)').innerText()).includes('Утренний полив'), 'новое дело дня — «Утренний полив»');
    const past = await page.locator('.daily-card.past').allInnerTexts();
    assert(past.length === 1 && past[0].includes('14 октября · Где очки?'), 'вчерашнее дело — в прошлых, с датой');
    await context.close();
  }

  console.log('\n=== 3. Незаконченные отметки переживают перезагрузку ===');
  {
    const { context, page } = await open(browser, { at: msk('2026-10-14T09:00:00') });
    await page.locator('.daily-card:not(.past)').click();
    await closeOnboarding(page);
    await page.waitForSelector('.case');
    assert((await page.locator('.case .topbar .title').innerText()).includes('Где очки?'), 'открыто дело дня');
    await clickYes(page, 'Майя', 'веранда');
    await page.locator('.case .topbar .btn').click();
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.case-list');
    assert((await page.locator('.daily-card:not(.past)').innerText()).includes('Начато'), 'после перезагрузки: «Начато — можно продолжить»');
    await page.locator('.daily-card:not(.past)').click();
    await page.waitForSelector('.case');
    assert((await page.locator('button[aria-label="Майя — веранда"].yes').count()) === 1, 'отметка на месте');
    await solveGlasses(page);
    assert((await page.locator('.stars-reward').innerText()).includes('Дело дня раскрыто'), 'на развязке — «Дело дня раскрыто», не «участок пополнился»');
    await page.getByRole('button', { name: 'Вернуться на участок' }).click();
    assert((await page.locator('.daily-card:not(.past)').innerText()).includes('Раскрыто'), 'карточка дела дня — «Раскрыто» со звёздами');
    const saved = await saveOf(page);
    assert(saved.data.dailySolved['daily-glasses'].date === '2026-10-14', 'раскрытие записано с датой расписания');
    assert(!saved.data.progress['daily-glasses'], 'незаконченный прогресс удалён');
    assert(saved.data.casesCompleted.length === 0 && Object.keys(saved.data.stars).length === 0, 'дела участка и звёзды участка не тронуты');
    assert(saved.data.achievements.length === 0, 'достижения за дело дня не выдаются');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 4. Старое сохранение v3: дела участка, звёзды, покупка и достижения целы ===');
  {
    const { context, page } = await open(browser, { at: msk('2026-10-16T08:00:00'), save: V3_OLD });
    const cards = page.locator('.case-card');
    for (let i = 0; i < 6; i += 1) assert((await cards.nth(i).innerText()).includes('Раскрыто'), `дело участка ${i + 1} раскрыто`);
    assert((await page.locator('.daily-card:not(.past)').innerText()).includes('Очередь к колодцу'), '16 октября — «Очередь к колодцу»');
    const past = await page.locator('.daily-card.past').allInnerTexts();
    assert(past.length === 2 && past[0].includes('15 октября') && past[1].includes('14 октября'), 'пропущенные 14 и 15 октября доступны, без штрафов');
    assert(!(await page.locator('.daily-section').innerText()).match(/пропущ|штраф|серия/i), 'никаких упрёков за пропуск');
    // Раскрываем пропущенное дело 14-го — цели участка и достижения не меняются.
    await page.locator('.daily-card.past', { hasText: 'Где очки?' }).click();
    await page.waitForSelector('.case');
    await solveGlasses(page);
    await page.getByRole('button', { name: 'Вернуться на участок' }).click();
    const saved = await saveOf(page);
    assert(JSON.stringify(saved.data.casesCompleted) === JSON.stringify(OLD_SIX), 'casesCompleted прежний');
    assert(JSON.stringify(saved.data.achievements) === JSON.stringify(V3_OLD.data.achievements), 'достижения прежние');
    assert(saved.data.purchases.noAds === true, 'покупка на месте');
    assert(JSON.stringify(saved.data.stars) === JSON.stringify(V3_OLD.data.stars), 'звёзды участка прежние');
    assert(saved.data.dailySolved['daily-glasses'], 'пропущенное дело дня раскрыто и записано');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 5. Сохранение v1 мигрирует, дело дня на месте ===');
  {
    const v1 = { v: 1, t: Date.parse('2026-09-01T10:00:00Z'), data: { casesCompleted: ['tutorial-1'], inProgress: { caseId: 'second-1', marks: {}, hintsUsed: 0 }, onboardingSeen: true } };
    const { context, page } = await open(browser, { at: msk('2026-10-17T10:00:00'), save: v1 });
    assert((await page.locator('.daily-card:not(.past)').innerText()).includes('Грядки в ряд'), '17 октября — «Грядки в ряд»');
    assert((await page.locator('.case-card').first().innerText()).includes('Раскрыто'), 'раскрытое в v1 дело осталось раскрытым');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 6. До начала и после конца расписания — честное состояние ===');
  {
    const { context, page } = await open(browser, { at: msk('2026-10-13T10:00:00') });
    assert((await page.locator('.daily-empty').innerText()).includes('Дела дня начнутся 14 октября'), '13 октября: «Дела дня начнутся 14 октября»');
    assert((await page.locator('.daily-card').count()) === 0, 'будущих дел не видно');
    await context.close();
  }
  {
    const { context, page } = await open(browser, { at: msk('2026-10-21T10:00:00') });
    assert((await page.locator('.daily-empty').innerText()).includes('Новых дел дня пока нет'), '21 октября: «Новых дел дня пока нет»');
    assert((await page.locator('.daily-card:not(.past)').count()) === 0, 'старое дело не выдаётся как дело дня');
    assert((await page.locator('.daily-card.past').count()) === 2, 'видны два последних прошлых дня — список не уводит дела участка вниз');
    await page.getByRole('button', { name: 'Ещё 5 прошлых' }).click();
    const past = await page.locator('.daily-card.past').allInnerTexts();
    assert(past.length === 7 && past.every((t) => /\d+ октября · /.test(t)), 'по кнопке — все семь, с датами');
    assert(past[0].includes('20 октября') && past[6].includes('14 октября'), 'от новых к старым');
    await context.close();
  }
  {
    const { context, page } = await open(browser, { at: msk('2026-11-30T10:00:00') });
    assert((await page.locator('.daily-empty').innerText()).includes('Новых дел дня пока нет'), 'и через месяц — не по кругу, а «новых нет»');
    await context.close();
  }

  console.log('\n=== 7. Вёрстка: участок с делом дня и большое дело ===');
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const size = `${viewport.width}×${viewport.height}`;
    const { context, page } = await open(browser, { at: msk('2026-10-19T10:00:00'), viewport });
    const bad = await page.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('горизонтальная прокрутка');
      for (const card of document.querySelectorAll('.daily-card')) {
        const r = card.getBoundingClientRect();
        if (r.right > window.innerWidth + 1) out.push('карточка шире окна');
        if (r.height < 44) out.push('карточка ниже 44px');
      }
      const empty = [...document.querySelectorAll('.daily-section > *')];
      for (let i = 1; i < empty.length; i += 1) {
        if (empty[i].getBoundingClientRect().top < empty[i - 1].getBoundingClientRect().bottom - 1) out.push('наложение в блоке дела дня');
      }
      return out;
    });
    assert(bad.length === 0, `${size}: дело дня и прошлые дни без наложений` + (bad.length ? ': ' + bad.join('; ') : ''));
    const firstCase = await page.locator('.case-card').first().boundingBox();
    assert(firstCase.y < viewport.height * 1.6, `${size}: дела участка начинаются недалеко от первого экрана (${Math.round(firstCase.y)}px)`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/daily-plot-${size}.png` });
    await page.locator('.daily-card:not(.past)').click();
    await closeOnboarding(page);
    await page.waitForSelector('.case');
    assert((await page.locator('.case .topbar .title').innerText()).includes('Ярмарка варенья'), `${size}: 19 октября — «Ярмарка варенья» (4 категории)`);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1
      && [...document.querySelectorAll('.grid-block')].every((g) => g.getBoundingClientRect().right <= window.innerWidth + 1));
    assert(fits, `${size}: шесть таблиц дела помещаются по ширине`);
    assert((await page.locator('.grid-block').count()) === 6, `${size}: 4 категории — 6 таблиц`);
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
