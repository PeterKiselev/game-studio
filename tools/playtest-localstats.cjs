/**
 * Локальный учёт статистики «Дачных тайн» (этап 1 аналитики) в настоящем браузере.
 *
 * Две сборки web:
 *  - обычная — проверяем, что она не создаёт ключ статистики и не делает запросов;
 *  - тестовая (VITE_LOCAL_STATS=1) — визит раз в московский день (перезапуск,
 *    две вкладки, смена дня), первый старт/раскрытие, дела до учёта, белый
 *    список, лимит очереди, отсутствие navigator.locks (учёт выключен, игра
 *    работает), отсутствие сети.
 *
 * Запуск: node tools/playtest-localstats.cjs <url-обычной> <url-тестовой>
 */
const { chromium } = require('playwright');

const PLAIN = process.argv[2] || 'http://127.0.0.1:4175/';
const STATS = process.argv[3] || 'http://127.0.0.1:4176/';
const SAVE_KEY = 'studio:dachnye-tainy';
const STATS_KEY = 'studio:dachnye-tainy:local-stats';
const OLD_SIX = ['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1'];
const WHITELIST = {
  visit: ['days_since_first', 'days_since_prev_visit', 'first_day', 'platform', 'build'],
  case_first_start: ['case_id', 'kind'],
  case_first_complete: ['case_id', 'kind', 'stars', 'hints', 'last_session_duration', 'step_wrong'],
  case_attempt: ['case_id', 'kind', 'phase'],
  next_case: ['from', 'to'],
  daily_open: ['case_id', 'when', 'ago'],
};
const msk = (local) => new Date(`${local}+03:00`);

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

/** Все запросы страницы: разрешены только GET к своему адресу (файлы сборки). */
function watchNetwork(page, base) {
  const bad = [];
  const origin = new URL(base).origin;
  page.on('request', (r) => {
    if (r.method() !== 'GET' || !r.url().startsWith(origin)) bad.push(`${r.method()} ${r.url()}`);
  });
  return bad;
}

async function newPage(context, { at, save, noLocks = false } = {}) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  if (at) await page.clock.install({ time: at });
  if (noLocks) await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
  if (save) {
    await page.addInitScript(([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, [SAVE_KEY, JSON.stringify(save)]);
  }
  return page;
}

async function open(page, base) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.case-list');
}

const stats = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STATS_KEY);
/** Учёт пишет под блокировкой асинхронно — ждём, пока запись дойдёт до хранилища. */
async function settle(page) {
  await page.evaluate(() => navigator.locks?.request('studio:dachnye-tainy:local-stats', () => undefined));
}
const visits = (st) => st.queue.filter((e) => e.name === 'visit');
const named = (st, name) => st.queue.filter((e) => e.name === name);

async function skipIntro(page) {
  try {
    await page.locator('.story').getByRole('button', { name: 'Пропустить' }).click({ timeout: 800 });
  } catch {
    /* нет вступления */
  }
  try {
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 800 });
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

async function solve(page, pairs) {
  for (const [a, b] of pairs) await clickYes(page, a, b);
  await page.clock.runFor(1000);
  await page.waitForSelector('.reveal', { timeout: 5000 });
}

const GLASSES = [['Майя', 'веранда'], ['Борис', 'сарай'], ['Лёня', 'теплица'], ['Майя', 'ключи'], ['Борис', 'телефон'], ['Лёня', 'очки']];
const PIE = [['Ирина', 'грядка'], ['Михаил', 'беседка'], ['Олег', 'калитка'], ['Ирина', 'лейка'], ['Михаил', 'пирог'], ['Олег', 'зонт']];

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== 1. Обычная сборка: ни ключа статистики, ни запросов ===');
  {
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-14T10:00:00') });
    const bad = watchNetwork(page, PLAIN);
    await open(page, PLAIN);
    await page.locator('.daily-card:not(.past)').click();
    await skipIntro(page);
    await page.waitForSelector('.case');
    await clickYes(page, 'Майя', 'веранда');
    await page.locator('.case .topbar .btn').click();
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.case-list');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(!keys.includes(STATS_KEY) && keys.every((k) => !k.includes('stats')), 'ключа статистики нет: ' + keys.join(', '));
    assert(bad.length === 0, 'ни одного запроса, кроме файлов сборки: ' + bad.join('; '));
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 2. Тестовая сборка: визит раз в день — перезапуск и смена дня ===');
  {
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-14T10:00:00') });
    const bad = watchNetwork(page, STATS);
    await open(page, STATS);
    await settle(page);
    let st = await stats(page);
    assert(st && visits(st).length === 1, 'первый запуск — один визит');
    assert(visits(st)[0].props.days_since_first === 0 && st.firstDay === '2026-10-14', 'визит дня 0, дата первого визита по Москве');
    for (let i = 0; i < 2; i += 1) {
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('.case-list');
    }
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await settle(page);
    st = await stats(page);
    assert(visits(st).length === 1, 'два перезапуска и возврат на вкладку в тот же день — всё ещё один визит');
    await page.clock.setSystemTime(msk('2026-10-15T00:00:30'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.case-list');
    await settle(page);
    st = await stats(page);
    const v = visits(st);
    assert(v.length === 2 && v[1].props.days_since_first === 1 && v[1].props.days_since_prev_visit === 1, 'после полуночи МСК — второй визит: 1 день с первого и с прошлого');
    assert(bad.length === 0, 'ни одного запроса: ' + bad.join('; '));
    await context.close();
  }

  console.log('\n=== 3. Две вкладки одновременно: один визит, ни одна запись не потеряна ===');
  for (let run = 1; run <= 3; run += 1) {
    // Без подмены часов: нужны настоящие таймеры. Тестовая задержка между
    // чтением и записью (только в тестовой сборке) делает гонку вкладок
    // реальной: без общей блокировки вкладки читали бы одно и то же состояние
    // и затирали записи друг друга. Ждём по времени, а не через блокировку,
    // чтобы проверка не зависела от того, что проверяет.
    const context = await browser.newContext();
    await context.addInitScript(([key]) => {
      globalThis.__statsTestDelayMs = 400;
      // Обучение уже видели — иначе окно обучения задержало бы начало дела.
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify({ v: 3, t: Date.now(), data: { casesCompleted: [], progress: {}, stars: {}, achievements: [], purchases: {}, onboardingSeen: true } }));
      }
    }, [SAVE_KEY]);
    const [a, b] = await Promise.all([newPage(context), newPage(context)]);
    await Promise.all([open(a, STATS), open(b, STATS)]);
    await a.waitForTimeout(1500);
    // Обе вкладки одновременно открывают дело дня.
    await Promise.all([a.locator('.daily-card:not(.past)').click(), b.locator('.daily-card:not(.past)').click()]);
    await a.waitForTimeout(3000);
    const st = await stats(a);
    const summary = st
      ? `визитов ${visits(st).length}, открытий ${named(st, 'daily_open').length}, попыток ${named(st, 'case_attempt').length}, первых стартов ${named(st, 'case_first_start').length}`
      : 'статистики нет';
    assert(
      !!st && visits(st).length === 1 && named(st, 'daily_open').length === 2 && named(st, 'case_attempt').length === 2 && named(st, 'case_first_start').length === 1,
      `прогон ${run}: один визит, два открытия и две попытки (ничего не потеряно), один первый старт — ${summary}`,
    );
    await context.close();
  }

  console.log('\n=== 4. Первый старт и первое раскрытие, дело дня, белый список ===');
  {
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-15T10:00:00') });
    const bad = watchNetwork(page, STATS);
    await open(page, STATS);
    await page.locator('.daily-card.past', { hasText: 'Где очки?' }).click();
    await skipIntro(page);
    await page.waitForSelector('.case');
    // Ошибочная отметка: событие case_mistake с ключом клетки не должно попасть в очередь.
    await clickYes(page, 'Майя', 'сарай');
    await page.locator('.case .topbar .btn').click();
    await page.locator('.daily-card.past', { hasText: 'Где очки?' }).click();
    await page.waitForSelector('.case');
    await clickYes(page, 'Майя', 'веранда');
    await solve(page, GLASSES);
    await page.getByRole('button', { name: 'Вернуться на участок' }).click();
    // Повтор раскрытого дела — только попытки.
    await page.locator('.daily-card.past', { hasText: 'Где очки?' }).click();
    await page.waitForSelector('.case');
    await solve(page, GLASSES);
    await settle(page);
    const st = await stats(page);
    assert(named(st, 'daily_open').length === 3 && named(st, 'daily_open')[0].props.when === 'past' && named(st, 'daily_open')[0].props.ago === '1', 'открытие дела дня: прошлое, 1 день назад');
    assert(named(st, 'case_first_start').length === 1 && named(st, 'case_first_start')[0].props.case_id === 'daily-glasses', 'первый старт — один, хотя открывали трижды');
    const fc = named(st, 'case_first_complete');
    assert(fc.length === 1 && fc[0].props.kind === 'daily' && fc[0].props.last_session_duration === '<2' && fc[0].props.hints === '0', 'первое раскрытие — одно, поля корзинами');
    const attempts = named(st, 'case_attempt').map((e) => e.props.phase).join(',');
    assert(attempts === 'start,start,complete,start,complete', 'попытки считаются все: ' + attempts);
    assert(st.queue.every((e) => e.name in WHITELIST && Object.keys(e.props).every((k) => WHITELIST[e.name].includes(k))), 'в очереди только события и поля белого списка');
    assert(!JSON.stringify(st).includes('сарай') && !JSON.stringify(st).includes('~'), 'ответов и ключей клеток в статистике нет');
    assert(st.queue.every((e) => e.beforeConsent === true) && new Set(st.queue.map((e) => e.id)).size === st.queue.length, 'все события «до согласия», номера не повторяются');
    const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
    assert(!JSON.stringify(save).includes('firstStarted') && !JSON.stringify(save).includes('queue'), 'статистика не попала в игровое сохранение');
    assert(bad.length === 0, 'ни одного запроса: ' + bad.join('; '));
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 5. Старое сохранение: дела, тронутые до учёта, не попадают в первые ===');
  {
    const v3 = {
      v: 3,
      t: Date.parse('2026-10-01T10:00:00Z'),
      data: {
        casesCompleted: OLD_SIX,
        progress: { 'ch1-hose': { marks: { 'ноша|ведро~персонажи|Зоя': 'yes' }, hintsUsed: 0 } },
        stars: Object.fromEntries(OLD_SIX.map((id) => [id, 3])),
        achievements: ['first_case', 'all_cases'],
        purchases: { noAds: true },
        onboardingSeen: true,
        storySeen: ['tutorial-1#3', 'ch1-hose'],
      },
    };
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-14T10:00:00'), save: v3 });
    await open(page, STATS);
    await page.getByRole('button', { name: /Чей пирог/ }).click();
    await skipIntro(page);
    await page.waitForSelector('.case');
    await solve(page, PIE);
    await page.getByRole('button', { name: 'Вернуться на участок' }).click();
    await page.getByRole('button', { name: /Глава 1\. Шланг/ }).click();
    await skipIntro(page);
    await page.waitForSelector('.case');
    await settle(page);
    const st = await stats(page);
    assert(st.preexisting.includes('tutorial-1') && st.preexisting.includes('ch1-hose'), 'раскрытые и начатые дела помечены «было до учёта»');
    assert(named(st, 'case_first_start').length === 0 && named(st, 'case_first_complete').length === 0, 'ни первого старта, ни первого раскрытия для них');
    assert(named(st, 'case_attempt').length === 3, 'попытки при этом учтены (старт, раскрытие, старт)');
    const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
    assert(JSON.stringify(save.data.casesCompleted) === JSON.stringify(OLD_SIX) && save.data.purchases.noAds === true, 'сохранение игры не изменилось');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  {
    const v1 = { v: 1, t: Date.parse('2026-09-01T10:00:00Z'), data: { casesCompleted: ['tutorial-1'], inProgress: { caseId: 'second-1', marks: {}, hintsUsed: 0 }, onboardingSeen: true } };
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-14T10:00:00'), save: v1 });
    await open(page, STATS);
    await settle(page);
    const st = await stats(page);
    assert(visits(st).length === 1 && st.preexisting.includes('tutorial-1'), 'v1: учёт создан, раскрытое в v1 дело — «было до учёта»');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 6. Лимит очереди ===');
  {
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-16T10:00:00') });
    const full = {
      v: 1,
      firstDay: '2026-10-14',
      prevVisitDay: '2026-10-15',
      preexisting: [],
      firstStarted: [],
      firstCompleted: [],
      queue: Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, name: 'next_case', props: { from: `f${i}`, to: 't' }, day: '2026-10-15', beforeConsent: true })),
    };
    await page.addInitScript(([k, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    }, [STATS_KEY, JSON.stringify(full)]);
    await open(page, STATS);
    await page.locator('.daily-card:not(.past)').click();
    await skipIntro(page);
    await page.waitForSelector('.case');
    await settle(page);
    const st = await stats(page);
    assert(st.queue.length === 200, 'очередь не больше 200');
    assert(st.queue[0].id !== 'old-0' && st.queue.at(-1).name !== 'next_case', 'старые события вытеснены новыми');
    assert(visits(st).length === 1 && visits(st)[0].props.days_since_prev_visit === 1, 'визит 16-го учтён при полной очереди');
    await context.close();
  }

  console.log('\n=== 7. Без navigator.locks учёт выключен, игра работает ===');
  {
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-14T10:00:00'), noLocks: true });
    const bad = watchNetwork(page, STATS);
    await open(page, STATS);
    await page.locator('.daily-card:not(.past)').click();
    await skipIntro(page);
    await page.waitForSelector('.case');
    await solve(page, GLASSES);
    assert(await page.locator('.reveal').isVisible(), 'дело проходится до развязки');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(!keys.includes(STATS_KEY), 'ключа статистики нет — учёт честно выключен');
    const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
    assert(save.data.dailySolved['daily-glasses'], 'игровое сохранение работает');
    assert(bad.length === 0 && page.errors.length === 0, 'без запросов и ошибок');
    await context.close();
  }

  console.log('\n=== 8. Ошибка на шаге → перезагрузка → верный ответ: ошибка учтена ===');
  {
    const POND = [
      ['Геннадий Ильич', '1:00'], ['Зоя', '0:00'], ['Игорь', '2:00'], ['Настя', '23:00'], ['Рома', '3:00'],
      ['Геннадий Ильич', 'кадр Насти'], ['Зоя', 'лай собаки'], ['Игорь', 'свет фонарика'], ['Настя', 'скрип калитки'], ['Рома', 'следы сапог'],
    ];
    const keyDone = { v: 3, t: Date.parse('2026-10-10T10:00:00Z'), data: { casesCompleted: ['ch1-hose', 'ch1-key'], progress: {}, stars: { 'ch1-hose': 3, 'ch1-key': 3 }, achievements: [], purchases: {}, onboardingSeen: true } };
    const context = await browser.newContext();
    const page = await newPage(context, { at: msk('2026-10-14T10:00:00'), save: keyDone });
    await open(page, STATS);
    await page.getByRole('button', { name: /Глава 1. Свет над прудом/ }).click();
    await skipIntro(page); // у дела 3 есть книжка вступления
    await page.waitForSelector('.case');
    for (const [a, b] of POND) await clickYes(page, a, b);
    await page.clock.runFor(1000);
    await page.waitForSelector('.step');
    await page.locator('.step-options.versions .btn', { hasText: 'Зоя' }).click();
    // Перезагрузка посреди шага: отброшенная версия сохранена.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.case-list');
    await page.getByRole('button', { name: /Глава 1. Свет над прудом/ }).click();
    await page.waitForSelector('.step');
    assert(await page.locator('.step-options.versions .btn', { hasText: 'Зоя' }).isDisabled(), 'после перезагрузки версия про Зою отброшена');
    await page.locator('.step-options.versions .btn', { hasText: 'Геннадий Ильич' }).click();
    await page.getByRole('button', { name: 'К развязке' }).click();
    await page.waitForSelector('.reveal');
    await settle(page);
    const st = await stats(page);
    const fc = named(st, 'case_first_complete').find((e) => e.props.case_id === 'ch1-pond');
    assert(fc && fc.props.step_wrong === '1', 'первое раскрытие: неверный выбор до перезагрузки учтён (step_wrong = 1), а не обнулён — ' + JSON.stringify(fc && fc.props));
    assert('last_session_duration' in fc.props && !('duration' in fc.props), 'длительность названа длительностью последнего сеанса');
    assert(named(st, 'case_first_start').filter((e) => e.props.case_id === 'ch1-pond').length === 1, 'первый старт — один, хотя дело открывали дважды');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
