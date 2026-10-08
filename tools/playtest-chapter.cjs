/**
 * Глава 1 «Тихая вода», дела 1 «Шланг у водокачки» и 2 «Чей ключ» — в настоящем браузере.
 *
 * Что проверяем: старые сохранения (v3 и v1) загружаются, шесть прежних дел и
 * покупки на месте, новое дело появляется седьмым; дело проходится подсказками
 * до развязки с находкой; вступление, факты, сетки и развязка не ломают вёрстку
 * на телефоне и на десктопе (геометрия, а не только отсутствие прокрутки).
 * Дело 2: заперто до раскрытия дела 1, открывается кнопкой с развязки дела 1,
 * показания отдельно от фактов, шаг «противоречие» (неверный ответ объясняется,
 * прогресс шага переживает перезагрузку), развязка с находкой.
 *
 * Запуск: node tools/playtest-chapter.cjs <url-web-сборки>
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4175/';
const KEY = 'studio:dachnye-tainy';
const OLD_SIX = ['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1'];
const TITLE = /Глава 1\. Шланг у водокачки/;

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
    if ((await page.locator('.reveal, .step').count()) > 0 || (await cell.count()) === 0) return;
    if (await cell.evaluate((el) => el.classList.contains('yes')).catch(() => true)) return;
    await cell.click({ timeout: 2000 }).catch(() => {});
  }
}

async function solve(page, pairs = SOLUTION_YES, doneSel = '.reveal') {
  for (const [a, b] of pairs) {
    if ((await page.locator(doneSel).count()) > 0) return;
    await clickYes(page, a, b);
  }
  await page.waitForSelector(doneSel, { timeout: 5000 });
}

/** Дело 2: таблицы ответа «соседи — где в 20:00» и «соседи — чем подтверждено». */
const KEY_SOLUTION_YES = [
  ['Геннадий Ильич', 'правление'], ['Игорь', 'баня'], ['Настя', 'речка'], ['Рома', 'склад'],
  ['Геннадий Ильич', 'журнал склада'], ['Игорь', 'сосед'], ['Настя', 'прокат лодки'], ['Рома', 'видео Насти'],
];
const KEY_TITLE = /Чей ключ/;
const HOSE_DONE = {
  v: 3,
  t: Date.now(),
  data: { casesCompleted: ['ch1-hose'], progress: {}, stars: { 'ch1-hose': 3 }, achievements: ['first_case'], purchases: {}, onboardingSeen: true },
};

async function openKeyCase(page) {
  await page.getByRole('button', { name: KEY_TITLE }).click();
  await page.waitForSelector('.case');
}

const saveOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

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
    assert((await cards.count()) === 8, 'на участке восемь дел');
    for (let i = 0; i < 6; i += 1) {
      assert((await cards.nth(i).innerText()).includes('Раскрыто'), `прежнее дело ${i + 1} осталось раскрытым`);
    }
    assert((await cards.nth(6).innerText()).includes('Ждёт расследования'), 'новое дело седьмым и ждёт расследования');
    assert((await cards.nth(7).innerText()).includes('Сначала раскройте «Шланг у водокачки»'), 'дело 2 восьмым и заперто до дела 1');
    assert(await cards.nth(7).isDisabled(), 'запертую карточку нельзя нажать');
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
    assert((await cards.count()) === 8, 'восемь дел после миграции v1');
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
    assert((await finding.innerText()).includes('Дальше — дело «Чей ключ»'), 'находка называет следующее дело');
    assert(await page.locator('.next-case').isVisible(), 'на развязке есть кнопка «Следующее дело»');
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

  console.log('\n=== 5. Дело 2 «Чей ключ»: переход с развязки дела 1, противоречие, сохранение шага ===');
  {
    const { context, page } = await openWithSave(browser, null);
    assert(await page.getByRole('button', { name: KEY_TITLE }).isDisabled(), 'на новом сохранении дело 2 заперто');
    await openChapterCase(page);
    await solve(page);
    await page.locator('.next-case').click();
    await page.waitForSelector('.case');
    assert((await page.locator('.case .topbar .title').innerText()).includes('Чей ключ'), 'кнопка «Следующее дело» открывает дело 2');
    assert((await page.locator('.case-intro').innerText()).includes('Кто был у склада в 20:00?'), 'вступление дела 2 с вопросом');
    assert((await page.locator('.clues .clue').count()) === 10, 'десять фактов');
    const facts = await page.locator('.clues').innerText();
    assert(!/чек|магазин/.test(facts), 'чека магазина больше нет');
    assert(facts.includes('прокат лодки подтверждает того, кто в 20:00 был на речке'), 'связь «прокат лодки — речка в 20:00» объяснена явно');
    assert(facts.includes('запись с подписью, сделанная ровно в 20:00'), 'журнал склада доказывает присутствие записью в 20:00, а не тем, где он лежит');
    assert(await page.locator('.testimonies').isVisible(), 'показания на экране дела');
    assert((await page.locator('.clues .testimonies, .clues .testimony').count()) === 0, 'показания не внутри блока фактов');
    assert((await page.locator('.testimonies-title').innerText()).includes('Показания — проверьте по фактам'), 'показания подписаны отдельно от фактов');
    assert((await page.locator('.testimonies .testimony').count()) === 4, 'по показанию от каждого из четверых');
    const chairman = await page.locator('.testimonies .testimony').first().innerText();
    assert(chairman.includes('«В 20:00 я был в правлении»') && !/весь вечер/i.test(chairman), 'председатель говорит о 20:00, а не о «весь вечер»');
    assert((await page.locator('.grids-goal').innerText()).includes('останется сверить показания'), 'цель над таблицами говорит, что после них будет шаг');
    assert(!(await page.locator('.clues').innerText()).includes('спросите кого хотите'), 'слова Ромы не попали в факты');

    await page.locator('.hint-btn').click();
    const hint = await page.locator('.hint-text').innerText();
    assert(hint.length > 20 && !/Рома[^.]*склад/.test(hint), 'первая подсказка дела 2 объясняет шаг, не выдавая ответ');

    await solve(page, KEY_SOLUTION_YES, '.step');
    assert((await page.locator('.reveal').count()) === 0, 'решённые таблицы ещё не раскрывают дело — впереди сверка показаний');
    assert((await page.locator('.step-question').innerText()).includes('чьи слова расходятся с фактами'), 'вопрос шага на экране');
    const summary = await page.locator('.step .case-file-row:not(.case-file-head)').allInnerTexts();
    assert(summary.some((r) => /Рома[\s\S]*склад[\s\S]*видео Насти/.test(r)), 'на шаге виден итог таблиц');
    let saved = await saveOf(page);
    assert(saved.data.progress['ch1-key']?.gridSolved === true && !saved.data.casesCompleted.includes('ch1-key'), 'в сохранении: таблицы решены, дело ещё не раскрыто');

    await page.getByRole('button', { name: 'Игорь', exact: true }).click();
    const fb = await page.locator('.step-feedback').innerText();
    assert(fb.includes('Слова о месте в 20:00 совпадают с таблицами: Игорь — баня'), 'неверный ответ: совпадает только место в 20:00: ' + fb);
    assert(fb.includes('Остальное в этих словах таблицы не проверяют') && !fb.includes('сходится с фактами') && !fb.includes('сосед'), 'реплика целиком не подтверждается (ключ в кармане таблица не устанавливает)');
    assert(await page.getByRole('button', { name: 'Игорь', exact: true }).isDisabled(), 'проверенный вариант погашен');
    assert((await page.locator('.reveal').count()) === 0, 'неверный ответ — не проигрыш и не развязка');

    // Уход и перезагрузка: шаг не теряется, таблицы не надо заполнять заново.
    await page.locator('.step .topbar .btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.case-list');
    assert((await page.getByRole('button', { name: KEY_TITLE }).innerText()).includes('осталось сверить показания'), 'после перезагрузки карточка говорит, что осталось');
    await page.getByRole('button', { name: KEY_TITLE }).click();
    await page.waitForSelector('.step');
    assert((await page.locator('.grid-block').count()) === 0, 'возврат сразу на шаг «противоречие», без таблиц');

    await page.getByRole('button', { name: 'Рома', exact: true }).click();
    const ok = await page.locator('.step-feedback.correct').innerText();
    assert(ok.startsWith('Верно') && ok.includes('видео Насти'), 'верный ответ с объяснением');
    await page.getByRole('button', { name: 'К развязке' }).click();
    await page.waitForSelector('.reveal');
    assert((await page.locator('.reveal-text').innerText()).includes('копии'), 'развязка дела 2: у Ромы копии ключей');
    const finding = await page.locator('.finding').innerText();
    assert(finding.includes('Правление') && finding.includes('Продолжение следует'), 'находка — кольцо «Правление», продолжение впереди');
    assert((await page.locator('.next-case').count()) === 0, 'кнопки следующего дела нет — дела 3 пока нет');
    saved = await saveOf(page);
    assert(saved.data.casesCompleted.includes('ch1-key') && !saved.data.progress['ch1-key'], 'дело 2 раскрыто, незаконченный прогресс удалён');
    assert(saved.data.stars['ch1-key'] === 2, 'звёзды дела 2 — по подсказкам таблиц (одна подсказка → 2)');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 5б. Дело 2: незаконченный прогресс со старым значением «чек магазина» ===');
  for (const gridSolved of [false, true]) {
    const stale = JSON.parse(JSON.stringify(HOSE_DONE));
    stale.data.progress['ch1-key'] = {
      marks: {
        'место|склад~персонажи|Рома': 'yes',
        'персонажи|Настя~подтверждение|чек магазина': 'yes',
      },
      hintsUsed: 1,
      ...(gridSolved ? { gridSolved: true } : {}),
    };
    const { context, page } = await openWithSave(browser, stale);
    const label = gridSolved ? 'с флагом «таблицы решены»' : 'частичные отметки';
    const card = await page.getByRole('button', { name: KEY_TITLE }).innerText();
    assert(!card.includes('осталось сверить показания'), `${label}: карточка не обещает шаг по старым таблицам`);
    await openKeyCase(page);
    assert((await page.locator('.step').count()) === 0 && (await page.locator('.grid-block').count()) === 3, `${label}: открываются таблицы, а не шаг «противоречие»`);
    assert((await page.locator('.grid-block .cell.yes').count()) === 0, `${label}: старые отметки сброшены, сетка чистая`);
    const saved = await saveOf(page);
    assert(!saved.data.progress['ch1-key'] || !JSON.stringify(saved.data.progress['ch1-key']).includes('чек'), `${label}: в сохранении не осталось старых ключей`);
    assert(saved.data.casesCompleted.includes('ch1-hose'), `${label}: раскрытое дело 1 не затронуто`);
    await solve(page, KEY_SOLUTION_YES, '.step');
    assert(await page.locator('.step-question').isVisible(), `${label}: после сброса дело проходится до шага`);
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 5в. Теплица: позиции 1–4 и перенос старых отметок «первой/третьей» ===');
  {
    const old = JSON.parse(JSON.stringify(HOSE_DONE));
    old.data.progress['third-1'] = {
      marks: { 'время|первой~персонажи|Аня': 'yes', 'места|чердак~время|третьей': 'no' },
      hintsUsed: 0,
    };
    const { context, page } = await openWithSave(browser, old);
    await page.getByRole('button', { name: /Кто был в теплице/ }).click();
    await page.waitForSelector('.case');
    const heads = await page.locator('.grid-block').first().innerText();
    assert(!/первой|вторым|третьей|четвёртым/.test(heads), 'в таблицах нет позиций с родовыми окончаниями');
    const facts = await page.locator('.clues').innerText();
    assert(!/Вышедшая|Тот, кто|одна за другим/.test(facts), 'улики о порядке без указания пола');
    assert(await page.locator('button[aria-label="Аня — 1"].yes, button[aria-label="1 — Аня"].yes').count() === 1, 'старая отметка «Аня — первой» перенесена в «Аня — 1»');
    assert(await page.locator('button[aria-label="чердак — 3"].no, button[aria-label="3 — чердак"].no').count() === 1, 'старая отметка «чердак — третьей» перенесена в «чердак — 3»');
    const saved = await saveOf(page);
    assert(!JSON.stringify(saved.data.progress['third-1']).includes('первой'), 'в сохранении ключи уже новые');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 6. Дело 2: вёрстка экрана дела и шага ===');
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const { context, page } = await openWithSave(browser, HOSE_DONE, viewport);
    await openKeyCase(page);
    const size = `${viewport.width}×${viewport.height}`;
    const caseIssues = await geometry(page, [
      ['.case-intro', '.clues'],
      ['.clues', '.testimonies'],
      ['.testimonies', '.grids-stack'],
    ]);
    assert(caseIssues.length === 0, `${size}: факты, показания и таблицы без наложений` + (caseIssues.length ? ': ' + caseIssues.join('; ') : ''));
    await solve(page, KEY_SOLUTION_YES, '.step');
    await page.getByRole('button', { name: 'Настя', exact: true }).click();
    const stepIssues = await geometry(page, [
      ['.step .case-file', '.testimonies'],
      ['.testimonies', '.step-question'],
      ['.step-options', '.step-feedback'],
    ]);
    assert(stepIssues.length === 0, `${size}: шаг «противоречие» без наложений` + (stepIssues.length ? ': ' + stepIssues.join('; ') : ''));
    const heights = await page.locator('.step-options .btn').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().height));
    assert(heights.every((h) => h >= 44), `${size}: варианты ответа не меньше 44px`);
    await page.getByRole('button', { name: 'Рома', exact: true }).click();
    const next = page.getByRole('button', { name: 'К развязке' });
    await next.scrollIntoViewIfNeeded();
    assert(await next.isVisible(), `${size}: кнопка «К развязке» достижима`);
    // Снимок для просмотра глазами — только если явно задана папка.
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/key-step-${size}.png`, fullPage: true });
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
