/**
 * Автопрохождение «Дачных тайн» — реальные клики по реальным кнопкам,
 * не картинка. Покрывает не только счастливый путь: сценарии 2-6
 * специально нацелены на классы багов, которые happy-path не ловит
 * (ложная победа при противоречивой сетке, потерянный прогресс при
 * повторе и при переключении между делами, гонка при выходе).
 * Сценарий 7 — контентная регрессия: дела 2-6 раскрываются до конца
 * через тот же интерфейс, не только validateCase() в тестах.
 */
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:4175/';
const OUT = join(__dirname, '_playtest');

const TUTORIAL_YES = [
  ['Ирина', 'грядка'],
  ['Михаил', 'беседка'],
  ['Олег', 'калитка'],
  ['Ирина', 'лейка'],
  ['Михаил', 'пирог'],
  ['Олег', 'зонт'],
];

/**
 * Второе и третье дело добавлены параллельно с подготовкой к первой
 * подаче — не как отдельная фича, а как проверка, что движок и интерфейс
 * держат больше одного дела содержательно, а не только технически.
 * Правильные клетки посчитаны вручную по source в cases/second.ts
 * и cases/third.ts и перепроверены через countSolutions()===1 в
 * games/dachnye-tainy/test/cases.test.ts — здесь просто воспроизводится
 * то же решение кликами по настоящему интерфейсу.
 */
const OTHER_CASES = [
  {
    title: /Чей велосипед прислонён к забору/,
    id: 'second-1',
    yes: [
      ['Настя', 'забор'],
      ['Пётр', 'колодец'],
      ['Женя', 'крыльцо'],
      ['Настя', 'велосипед'],
      ['Пётр', 'ведро'],
      ['Женя', 'книга'],
    ],
  },
  {
    title: /Кто был в теплице третьим/,
    id: 'third-1',
    yes: [
      ['Аня', 'чердак'],
      ['Борис', 'погреб'],
      ['Вика', 'теплица'],
      ['Гриша', 'курятник'],
      ['Аня', 'первой'],
      ['Борис', 'вторым'],
      ['Вика', 'третьей'],
      ['Гриша', 'четвёртым'],
    ],
  },
  {
    title: /Чей самовар кипел в огороде/,
    id: 'fourth-1',
    yes: [
      ['Валя', 'сарай'],
      ['Гоша', 'огород'],
      ['Люда', 'банька'],
      ['Тимофей', 'качели'],
      ['Валя', 'лопата'],
      ['Гоша', 'самовар'],
      ['Люда', 'гамак'],
      ['Тимофей', 'фонарь'],
    ],
  },
  {
    title: /Кто вернулся с рынка третьим/,
    id: 'fifth-1',
    yes: [
      ['Зоя', 'семена'],
      ['Игорь', 'гвозди'],
      ['Настя', 'мёд'],
      ['Рома', 'творог'],
      ['Зоя', 'первой'],
      ['Игорь', 'вторым'],
      ['Настя', 'третьей'],
      ['Рома', 'четвёртым'],
    ],
  },
  {
    title: /Кто сидел на раскладушке у костра/,
    id: 'sixth-1',
    yes: [
      ['Ксюша', 'у бревна'],
      ['Влад', 'на траве'],
      ['Оля', 'на раскладушке'],
      ['Митя', 'на камне'],
      ['Ксюша', 'первой'],
      ['Влад', 'вторым'],
      ['Оля', 'третьей'],
      ['Митя', 'четвёртым'],
    ],
  },
];

function attachLogger(page, logs) {
  page.on('console', (msg) => {
    if (msg.text().startsWith('[analytics]')) logs.push(msg.text());
  });
}

function findCellLocator(page, rowLabel, colLabel) {
  const direct = page.locator(`button[aria-label="${rowLabel} — ${colLabel}"]`).first();
  return direct;
}

/**
 * Кликает клетку до состояния «да». Цикл — пусто → да → нет → пусто,
 * поэтому если клетка уже «нет» (например, автоисключение сработало
 * из-за более раннего неверного клика по той же строке), один клик
 * только очистит её — нужен второй, чтобы дойти до «да». Так вело бы
 * себя и живое исправление ошибки игроком, не только тест.
 */
async function clickCell(page, rowLabel, colLabel) {
  let locator = findCellLocator(page, rowLabel, colLabel);
  if ((await locator.count()) === 0) locator = findCellLocator(page, colLabel, rowLabel);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await locator.evaluate((el) => el.classList.contains('yes'))) return;
    await locator.click();
  }
}

/** Клетка ищется в любом порядке строка/столбец — сетки рисуются по-разному. */
function cellLocator(page, rowLabel, colLabel) {
  return page.locator(
    `button[aria-label="${rowLabel} — ${colLabel}"], button[aria-label="${colLabel} — ${rowLabel}"]`,
  );
}

async function isYes(page, rowLabel, colLabel) {
  return cellLocator(page, rowLabel, colLabel).evaluateAll(
    (els) => els.length > 0 && els.some((el) => el.classList.contains('yes')),
  );
}

async function openCase(page, title = /Чей пирог остался в беседке/) {
  await page.getByRole('button', { name: title }).click();
  // Первое открытие дела за сессию показывает обучающий диалог (см.
  // maybeShowOnboarding в main.ts) — если он есть на экране, закрываем его,
  // как это сделал бы игрок. На повторных вызовах в этом же прогоне
  // диалога уже не будет: onboardingSeen сохраняется в save. Короткий
  // таймаут вместо count() — click() синхронно вставляет overlay ДО
  // await внутри maybeShowOnboarding, но ждать явно надёжнее, чем гонка.
  try {
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 1000 });
  } catch {
    /* обучение уже показано в этом прогоне — диалога нет, и это ожидаемо */
  }
  await page.waitForSelector('.case');
}

async function backToPlot(page, label = 'Участок') {
  await page.getByRole('button', { name: label }).click();
  await page.waitForSelector('.plot');
}

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const logs = [];
  attachLogger(page, logs);

  // --- сценарий 1: счастливый путь + ошибочная отметка -----------------
  console.log('\n=== 1. Счастливый путь, с намеренной ошибкой ===');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.plot');
  await page.screenshot({ path: join(OUT, '1-plot.png') });

  await openCase(page);
  assert(
    logs.some((l) => l.includes('onboarding_shown')),
    'первое дело в жизни показывает обучение цели и жеста ✓/✕',
  );
  await page.screenshot({ path: join(OUT, '2-case-empty.png') });

  // Намеренно неверная клетка — Ирина не в беседке, но это пара внутри
  // ТОЙ ЖЕ сетки (персонажи×места), где потом будет верно поставлено
  // «Ирина — грядка» — автоисключение обязано её перекрыть.
  await clickCell(page, 'Ирина', 'беседка');
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);

  // Проверяем ДО перехода на развязку, пока клетка ещё существует в DOM.
  // Раньше эта проверка стояла после waitForSelector('.reveal') — экран
  // уже был заменён, локатор находил ноль элементов, .some() на пустом
  // массиве давал false, и «ошибка не осталась» засчитывалось не
  // проверив вообще ничего. Явно требуем, чтобы клетка была найдена —
  // иначе тест был бы «зелёным» и без единой реальной проверки.
  const wrongCell = cellLocator(page, 'Ирина', 'беседка');
  assert((await wrongCell.count()) > 0, 'ошибочная клетка «Ирина — беседка» найдена в DOM для проверки');
  assert(!(await isYes(page, 'Ирина', 'беседка')), 'ошибочная клетка автоматически снята, а не осталась «да»');
  await page.screenshot({ path: join(OUT, '3-case-solved.png') });

  await page.waitForSelector('.reveal', { timeout: 3000 });
  await page.screenshot({ path: join(OUT, '4-reveal.png') });

  assert(logs.some((l) => l.includes('case_mistake')), 'ошибочная клетка дала case_mistake');
  assert(logs.some((l) => l.includes('case_complete')), 'дело раскрыто despite ошибки');
  assert(
    (await page.locator('.stars-reward').count()) === 1,
    'при первом раскрытии показана награда участку',
  );
  // Самое первое дело в жизни: без подсказок (no_hints), первое вообще
  // (first_case) и с намеренной ошибкой по пути (comeback) — три
  // достижения разом, у каждого свой блок '.reward.achievement-unlocked'.
  assert(
    (await page.locator('.achievement-unlocked').count()) === 3,
    'первое дело с ошибкой и без подсказок открывает сразу три достижения',
  );

  await backToPlot(page, 'Вернуться на участок');

  // --- сценарий 2: противоречивая неякорная пара не даёт ложной победы -
  console.log('\n=== 2. Противоречивая сетка не даёт ложной победы ===');
  logs.length = 0;
  await openCase(page);
  // Ошибочное «да» здесь не в паре с персонажем, а в паре «места×предметы»
  // (беседка — зонт): автоисключение чистит только свою собственную
  // сетку и никак не связано с тем, что мы дальше верно заполним
  // персонажей. Это ровно репродукция Кодекса: заполнить всех соседей
  // правильно, но оставить одну неякорную клетку неверной.
  await clickCell(page, 'беседка', 'зонт');
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);
  await page.waitForTimeout(700); // дать шанс 500-мс таймауту завершения сработать, если бы он сработал неверно

  assert((await page.locator('.case').count()) === 1, 'экран дела остаётся — раскрытия не произошло');
  assert(
    !logs.some((l) => l.includes('case_complete')),
    'case_complete не отправлен, пока в сетке остаётся противоречие',
  );
  assert(
    await isYes(page, 'беседка', 'зонт'),
    'противоречивая клетка «беседка — зонт» остаётся видимой, а не тихо стирается сама',
  );

  // Правильный ответ здесь — «нет»: один клик по «да» циклит именно туда.
  await cellLocator(page, 'беседка', 'зонт').first().click();
  await page.waitForSelector('.reveal', { timeout: 3000 });
  assert(
    logs.some((l) => l.includes('case_complete') && l.includes('tutorial-1')),
    'после исправления противоречия дело раскрывается штатно',
  );

  await backToPlot(page, 'Вернуться на участок');

  // --- сценарий 3: повтор уже раскрытого дела — без повторной награды --
  console.log('\n=== 3. Повтор раскрытого дела ===');
  logs.length = 0;
  await openCase(page);
  assert(
    !logs.some((l) => l.includes('onboarding_shown')),
    'обучение не повторяется на втором открытии дела за сессию',
  );
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);
  await page.waitForSelector('.reveal', { timeout: 3000 });
  assert(
    (await page.locator('.stars-reward').count()) === 0,
    'при повторном раскрытии награда НЕ показана — сохранение не менялось',
  );
  assert(
    (await page.locator('.achievement-unlocked').count()) === 0,
    'при повторном раскрытии новых достижений тоже нет',
  );
  await backToPlot(page, 'Вернуться на участок');

  // --- сценарий 4: вторая подсказка на площадке без рекламы (web) ------
  console.log('\n=== 4. Вторая подсказка без рекламы на этой площадке ===');
  logs.length = 0;
  await openCase(page);
  const hintButton = page.locator('.hint-btn');
  await hintButton.click();
  await page.waitForTimeout(150);
  const labelAfterFirst = await hintButton.textContent();
  assert(
    /за рекламу/.test(labelAfterFirst || '') === false,
    `после первой подсказки на web кнопка не обещает рекламу, которой тут нет (текст: «${labelAfterFirst}»)`,
  );
  await hintButton.click();
  await page.waitForTimeout(150);
  assert(
    !logs.some((l) => l.includes('реклама') || l.includes('не загрузилась')),
    'вторая подсказка на web выдана бесплатно, а не заблокирована навсегда',
  );
  // Подсказка не продвигается, пока игрок не применит предыдущую —
  // движок честно повторяет тот же шаг, это не баг. Проверяем не текст
  // (он ожидаемо тот же), а что событие всё же дошло до аналитики дважды.
  const hintEvents = logs.filter((l) => l.includes('case_hint')).length;
  assert(hintEvents === 2, `оба обращения к подсказке засчитаны аналитикой (получено: ${hintEvents})`);
  await backToPlot(page);

  // --- сценарий 5: незаконченное дело переживает перезагрузку страницы -
  console.log('\n=== 5. Незаконченное дело переживает перезагрузку ===');
  await openCase(page);
  await clickCell(page, 'Ирина', 'грядка');
  await clickCell(page, 'Михаил', 'беседка');
  await page.waitForTimeout(150); // markDirty() пишет в localStorage синхронно, запас на кадр

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.plot');
  await openCase(page); // то же дело — должно восстановить отметки, не начать заново

  assert(await isYes(page, 'Ирина', 'грядка'), 'отметка пережила перезагрузку страницы — прогресс не потерян');

  // Добиваем дело до конца, чтобы следующий сценарий не унаследовал
  // чужое незаконченное состояние.
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);
  await page.waitForSelector('.reveal', { timeout: 3000 });
  await backToPlot(page, 'Вернуться на участок');

  // --- сценарий 6: переключение между двумя незаконченными делами ------
  console.log('\n=== 6. Прогресс двух дел не перезаписывается при переключении ===');
  // Точная репродукция Кодекса: отметка в одном деле, ход в другом,
  // возврат в первое — прогресс должен остаться, а не стереться, потому
  // что раньше вся игра хранила только одно inProgress на все дела сразу.
  const [second, third] = OTHER_CASES;

  await openCase(page, second.title);
  await clickCell(page, ...second.yes[0]);
  await backToPlot(page);

  await openCase(page, third.title);
  await clickCell(page, ...third.yes[0]);
  await backToPlot(page);

  await openCase(page, second.title);
  assert(
    await isYes(page, ...second.yes[0]),
    `прогресс ${second.id} не стёрся, пока мы ходили в ${third.id}`,
  );
  await backToPlot(page);

  await openCase(page, third.title);
  assert(
    await isYes(page, ...third.yes[0]),
    `прогресс ${third.id} не стёрся, пока мы достраивали ${second.id}`,
  );
  await backToPlot(page);

  // --- сценарий 7: второе и третье дело решаются до конца через интерфейс -
  console.log('\n=== 7. Второе и третье дело — полный путь через интерфейс ===');
  for (const { title, id, yes } of OTHER_CASES) {
    logs.length = 0;
    // Открываем заново — на part своих клеток уже стоит верное «да» из
    // сценария 6 (clickCell идемпотентен для уже верной клетки), это
    // не мешает: остальное дозаполняем тут же.
    await openCase(page, title);
    for (const [row, col] of yes) await clickCell(page, row, col);
    await page.waitForSelector('.reveal', { timeout: 3000 });
    assert(
      logs.some((l) => l.includes('case_complete') && l.includes(id)),
      `дело ${id} раскрывается кликами, посчитанными по source (не догадкой)`,
    );
    await backToPlot(page, 'Вернуться на участок');
    const stamp = await page
      .locator('.case-card', { hasText: title })
      .locator('.stamp')
      .textContent();
    assert(stamp === '✓', `карточка дела ${id} на участке помечена раскрытой после прохождения`);
  }

  await browser.close();

  console.log('\n--- все события аналитики за прогон ---');
  console.log('готово:', OUT);
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
