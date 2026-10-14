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
  // На новом сохранении сначала кадры вступления — их проверяет сценарий 7.
  try {
    await page.locator('.story').getByRole('button', { name: 'Пропустить' }).click({ timeout: 1000 });
  } catch {
    /* вступление уже видели или его нет */
  }
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
// С префиксом главы: запертое дело 3 в статусе тоже называет «Чей ключ».
const KEY_TITLE = /Глава 1\. Чей ключ/;
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
    for (const sel of ['.case-intro', '.clues', '.finding', '.reveal-text', '.story-frame', '.story-caption']) {
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
    assert((await cards.count()) === 9, 'на участке девять дел');
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
    assert((await cards.count()) === 9, 'девять дел после миграции v1');
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
    assert(finding.includes('Правление') && finding.includes('Дальше — дело «Свет над прудом»'), 'находка — кольцо «Правление», ведёт к делу 3');
    assert(await page.locator('.next-case').isVisible(), 'на развязке дела 2 — кнопка «Следующее дело»');
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

  console.log('\n=== 7. Вступление дела 1: кадры, пропуск, повтор, без повторного навязывания ===');
  {
    const { context, page } = await openWithSave(browser, null);
    await page.getByRole('button', { name: TITLE }).click();
    const story = page.locator('.story');
    await story.waitFor();
    assert((await page.locator('.dialog').count()) === 0, 'сначала кадры, обучение — после них');
    const captions = [];
    for (let i = 1; i <= 3; i += 1) {
      assert((await story.locator('.story-counter').innerText()).trim() === `${i} / 3`, `кадр ${i} из 3`);
      await page.waitForFunction(() => {
        const img = document.querySelector('.story-image');
        return img && img.complete && img.naturalWidth > 0;
      });
      assert((await story.locator('.story-image').getAttribute('alt')).length > 10, `у кадра ${i} есть описание`);
      captions.push(await story.locator('.story-caption').innerText());
      const btn = story.locator('.story-controls .btn');
      assert((await btn.innerText()).trim() === (i < 3 ? 'Дальше' : 'К расследованию'), `кнопка кадра ${i}: «${await btn.innerText()}»`);
      await btn.click();
    }
    assert(captions[0].includes('убывает вода') && captions[1].includes('брошенный шланг') && captions[2].includes('Валентина Петровна'), 'подписи по сюжету');
    assert(!/Рома|9:00|бирк/i.test(captions.join(' ')), 'в подписях нет ответа и находки');
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click();
    await page.waitForSelector('.case');
    assert((await page.locator('.story').count()) === 0, 'после кадров — экран дела');
    const intro = await page.locator('.case-intro').innerText();
    assert(intro.includes('в 6, 7, 8 и 9 часов') && intro.includes('Кто принёс шланг?'), 'условия задачи на экране дела');

    // Ручной повтор поверх дела: отметки не теряются, экран дела тот же.
    await clickYes(page, 'Зоя', 'ведро');
    await page.getByRole('button', { name: '📖 Вступление' }).click();
    await story.waitFor();
    assert((await story.locator('.story-counter').innerText()).trim() === '1 / 3', 'повтор начинается с первого кадра');
    await page.keyboard.press('Escape');
    assert((await page.locator('.story').count()) === 0, 'Escape закрывает вступление');
    assert((await page.locator('button[aria-label="Зоя — ведро"].yes').count()) === 1, 'после повтора отметка на месте');

    let saved = await saveOf(page);
    assert(saved.data.storySeen?.includes('ch1-hose'), 'просмотр записан в сохранение');
    await page.locator('.case .topbar .btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.case-list');
    await page.getByRole('button', { name: TITLE }).click();
    await page.waitForSelector('.case');
    assert((await page.locator('.story').count()) === 0, 'второй раз кадры сами не показываются');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  {
    const { context, page } = await openWithSave(browser, null);
    await page.getByRole('button', { name: TITLE }).click();
    await page.locator('.story').getByRole('button', { name: 'Пропустить' }).click();
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click();
    await page.waitForSelector('.case');
    const saved = await saveOf(page);
    assert(saved.data.storySeen?.includes('ch1-hose'), '«Пропустить» тоже считается просмотром');
    await context.close();
  }
  // Старые игроки: кадры показываются один раз и им, прогресс и покупки не трогаются.
  for (const [label, envelope, expectMark, finishBy] of [
    ['раскрывшему дело 1 до появления кадров', (() => {
      const e = JSON.parse(JSON.stringify(HOSE_DONE));
      e.data.purchases = { noAds: true };
      return e;
    })(), null, 'skip'],
    ['начавшему дело 1 до появления кадров', (() => {
      const e = JSON.parse(JSON.stringify(HOSE_DONE));
      e.data.casesCompleted = [];
      e.data.stars = {};
      e.data.progress['ch1-hose'] = { marks: { 'ноша|ведро~персонажи|Зоя': 'yes' }, hintsUsed: 1 };
      return e;
    })(), 'Зоя — ведро', 'done'],
  ]) {
    const { context, page } = await openWithSave(browser, envelope);
    const before = await saveOf(page);
    await page.getByRole('button', { name: TITLE }).click();
    const story = page.locator('.story');
    await story.waitFor();
    assert((await story.locator('.story-counter').innerText()).trim() === '1 / 3', `${label}: кадры показаны при открытии дела`);
    if (finishBy === 'skip') {
      await story.getByRole('button', { name: 'Пропустить' }).click();
    } else {
      for (let i = 0; i < 3; i += 1) await story.locator('.story-controls .btn').click();
    }
    await page.waitForSelector('.case');
    if (expectMark) {
      assert((await page.locator(`button[aria-label="${expectMark}"].yes`).count()) === 1, `${label}: незаконченные отметки на месте`);
    }
    const after = await saveOf(page);
    assert(after.data.storySeen?.includes('ch1-hose'), `${label}: просмотр записан`);
    assert(JSON.stringify(after.data.casesCompleted) === JSON.stringify(before.data.casesCompleted), `${label}: раскрытые дела не изменились`);
    assert(JSON.stringify(after.data.stars) === JSON.stringify(before.data.stars), `${label}: звёзды не изменились`);
    assert(JSON.stringify(after.data.purchases) === JSON.stringify(before.data.purchases), `${label}: покупки не изменились`);
    assert(
      JSON.stringify(after.data.progress['ch1-hose'] ?? null) === JSON.stringify(before.data.progress['ch1-hose'] ?? null),
      `${label}: прогресс дела не изменился`,
    );
    // Второй раз — уже без кадров, но с кнопкой повтора.
    await page.locator('.case .topbar .btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.case-list');
    await page.getByRole('button', { name: TITLE }).click();
    await page.waitForSelector('.case');
    assert((await story.count()) === 0, `${label}: второй раз кадры сами не показываются`);
    assert((await page.getByRole('button', { name: '📖 Вступление' }).count()) === 1, `${label}: повтор по кнопке доступен`);
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 7б. Вступление модально: клавиатура не достаёт до карточек и клеток под ним ===');
  {
    const focusInStory = (page) => page.evaluate(() => !!document.activeElement?.closest('.story'));
    const { context, page } = await openWithSave(browser, null);
    await page.getByRole('button', { name: TITLE }).click();
    const story = page.locator('.story');
    await story.waitFor();
    assert(await page.evaluate(() => document.getElementById('app').inert === true), 'фон (участок) inert, пока открыто вступление');
    for (const [key, n] of [['Tab', 8], ['Shift+Tab', 8]]) {
      for (let i = 0; i < n; i += 1) {
        await page.keyboard.press(key);
        assert(await focusInStory(page), `${key} ×${i + 1}: фокус внутри вступления`);
      }
    }
    // Прямая попытка: карточка под окном не получает фокус и не нажимается.
    const card = page.locator('.case-card').first();
    await card.evaluate((n) => n.focus());
    assert(!(await card.evaluate((n) => n === document.activeElement)), 'карточку «Чей пирог…» под вступлением нельзя сфокусировать');
    await page.keyboard.press('Enter'); // фокус в окне — Enter листает кадр, а не открывает дело
    assert((await story.count()) === 1 && (await page.locator('.case').count()) === 0, 'Enter не открыл дело из-под вступления');
    const saved = await saveOf(page);
    assert(!saved?.data?.progress?.['tutorial-1'], 'обучающее дело не начато');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click();
    await page.waitForSelector('.case');
    assert((await page.locator('.case .topbar .title').innerText()).includes('Шланг у водокачки'), 'после вступления открыто именно дело 1');
    assert(await page.evaluate(() => document.getElementById('app').inert === false), 'после закрытия фон снова доступен');

    // Ручной повтор поверх дела: клетки недоступны, после закрытия фокус на кнопке повтора.
    const replay = page.getByRole('button', { name: '📖 Вступление' });
    await replay.focus();
    await page.keyboard.press('Enter');
    await story.waitFor();
    const cell = page.locator('button[aria-label="Зоя — ведро"]');
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      assert(await focusInStory(page), `повтор, Tab ×${i + 1}: фокус внутри вступления`);
    }
    await cell.evaluate((n) => n.focus());
    assert(!(await cell.evaluate((n) => n === document.activeElement)), 'клетку под вступлением нельзя сфокусировать');
    await page.keyboard.press('ArrowRight');
    assert((await story.locator('.story-counter').innerText()).trim() === '2 / 3', 'стрелка вправо листает и в модальном окне');
    await page.keyboard.press('ArrowLeft');
    assert((await story.locator('.story-counter').innerText()).trim() === '1 / 3', 'стрелка влево листает назад');
    await page.keyboard.press('Escape');
    assert((await story.count()) === 0, 'Escape закрывает повтор');
    assert(await replay.evaluate((n) => n === document.activeElement), 'фокус вернулся на кнопку «Вступление»');
    assert((await page.locator('.cell.yes, .cell.no').count()) === 0, 'ни одна клетка не изменилась, пока было открыто вступление');
    await page.keyboard.press('Shift+Tab');
    await cell.click();
    assert((await cell.evaluate((n) => n.classList.contains('yes'))), 'после закрытия клетки снова работают');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 8. Вступление: вёрстка ===');
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const { context, page } = await openWithSave(browser, null, viewport);
    const size = `${viewport.width}×${viewport.height}`;
    await page.getByRole('button', { name: TITLE }).click();
    await page.locator('.story').waitFor();
    await page.waitForFunction(() => document.querySelector('.story-image')?.complete);
    for (let i = 1; i <= 3; i += 1) {
      const issues = await geometry(page, [
        ['.story .topbar', '.story-frame'],
        ['.story-frame', '.story-caption'],
        ['.story-caption', '.story-controls'],
      ]);
      assert(issues.length === 0, `${size}, кадр ${i}: без наложений` + (issues.length ? ': ' + issues.join('; ') : ''));
      const box = await page.locator('.story-controls .btn').boundingBox();
      assert(box && box.y + box.height <= viewport.height && box.height >= 44, `${size}, кадр ${i}: кнопка видна без прокрутки и не меньше 44px`);
      const frame = await page.locator('.story-frame').boundingBox();
      assert(Math.abs(frame.width / frame.height - 4 / 3) < 0.02, `${size}, кадр ${i}: пропорция 4:3 без искажений`);
      const font = await page.locator('.story-caption').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
      assert(font >= 15, `${size}: подпись ${font}px`);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/story-${i}-${size}.png` });
      await page.locator('.story-controls .btn').click();
    }
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 9. Первые два дела: обложки карточек, по одному кадру, клавиатура, сохранения ===');
  {
    // Старый игрок: обучающее дело раскрыто на 3 звезды, второе начато, есть покупка.
    const old = JSON.parse(JSON.stringify(HOSE_DONE));
    old.data.casesCompleted = ['tutorial-1', 'ch1-hose'];
    old.data.stars = { 'tutorial-1': 3, 'ch1-hose': 2 };
    old.data.progress['second-1'] = { marks: { 'места|забор~персонажи|Пётр': 'no' }, hintsUsed: 1 };
    old.data.purchases = { unlimitedHints: true };
    const { context, page } = await openWithSave(browser, old);
    const before = await saveOf(page);
    const cardOf = (re) => page.locator('.case-card', { hasText: re });
    assert((await page.locator('.case-card .cover-image').count()) === 3, 'обложки у трёх дел с картинками');
    await page.waitForFunction(() => [...document.querySelectorAll('.cover-image')].every((i) => i.complete && i.naturalWidth > 0));
    const pie = cardOf(/Чей пирог/);
    assert((await pie.innerText()).includes('Раскрыто · ⭐⭐⭐') && (await pie.locator('.stamp.badge').innerText()).trim() === '✓', 'обучающее дело: статус, звёзды и печать ✓ на обложке');
    assert((await cardOf(/Чей велосипед/).innerText()).includes('Ждёт расследования'), 'начатое второе дело — прежний статус');
    assert((await cardOf(/Шланг у водокачки/).innerText()).includes('Раскрыто · ⭐⭐'), 'дело главы: статус и звёзды на месте');
    assert((await cardOf(/Чей самовар/).locator('.cover').count()) === 0 && (await cardOf(/Чей самовар/).locator('.stamp').count()) === 1, 'дела без картинки — прежняя печать без обложки');
    const key = cardOf(/Глава 1\. Чей ключ/);
    assert((await key.locator('.cover').count()) === 0 && (await key.locator('.stamp').innerText()).trim() === '?' && (await key.innerText()).includes('Ждёт расследования'), 'дело 2 главы (открыто после дела 1) — прежняя печать «?» и статус');

    // Второе дело: один кадр, клавиатура заперта в окне, прогресс цел.
    await cardOf(/Чей велосипед/).click();
    const story = page.locator('.story');
    await story.waitFor();
    assert((await story.locator('.story-counter').innerText()).trim() === '', 'один кадр — без счётчика «1 / 1»');
    assert((await story.locator('.story-controls .btn').innerText()).trim() === 'К расследованию', 'единственная кнопка — «К расследованию»');
    const caption = await story.locator('.story-caption').innerText();
    assert(caption.includes('велосипед') && !/Настя|Пётр|Женя/.test(caption), 'подпись без имён: ' + caption);
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => !!document.activeElement?.closest('.story')), `Tab ×${i + 1}: фокус внутри кадра`);
    }
    await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(() => !!document.activeElement?.closest('.story')), 'Shift+Tab: фокус внутри кадра');
    await story.locator('.story-controls .btn').click();
    await page.waitForSelector('.case');
    assert((await page.locator('button[aria-label="Пётр — забор"].no').count()) === 1, 'незаконченная отметка второго дела на месте');
    const replay = page.getByRole('button', { name: '📖 Вступление' });
    assert((await replay.count()) === 1, 'у дела без текста вступления есть кнопка повтора');
    await replay.focus();
    await page.keyboard.press('Enter');
    await story.waitFor();
    await page.keyboard.press('Escape');
    assert(await replay.evaluate((n) => n === document.activeElement), 'после повтора фокус на кнопке «Вступление»');

    let saved = await saveOf(page);
    assert(saved.data.storySeen?.includes('second-1') && !saved.data.storySeen.includes('tutorial-1'), 'просмотр записан только для второго дела');
    assert(JSON.stringify(saved.data.progress['second-1']) === JSON.stringify(before.data.progress['second-1']), 'прогресс второго дела не изменился');
    assert(JSON.stringify(saved.data.stars) === JSON.stringify(before.data.stars) && saved.data.purchases.unlimitedHints === true, 'звёзды и покупка не изменились');

    // Раскрытое обучающее дело: кадр показывается один раз и ему (по storySeen), «Пропустить».
    await page.locator('.case .topbar .btn').click();
    await cardOf(/Чей пирог/).click();
    await story.waitFor();
    assert((await story.locator('.story-counter').innerText()).trim() === '1 / 4', 'вступление обучающего дела — книжка из четырёх страниц');
    await story.getByRole('button', { name: 'Пропустить' }).click();
    await page.waitForSelector('.case');
    await page.locator('.case .topbar .btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.case-list');
    for (const re of [/Чей пирог/, /Чей велосипед/]) {
      await cardOf(re).click();
      await page.waitForSelector('.case');
      assert((await story.count()) === 0, `${re}: второй раз кадр сам не показывается`);
      await page.locator('.case .topbar .btn').click();
    }
    saved = await saveOf(page);
    assert(JSON.stringify(saved.data.casesCompleted) === JSON.stringify(before.data.casesCompleted), 'раскрытые дела не изменились');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  {
    // Новый игрок: кадр обучающего дела — первым, потом обучение, потом дело.
    const { context, page } = await openWithSave(browser, null);
    await page.locator('.case-card', { hasText: /Чей пирог/ }).click();
    await page.locator('.story').waitFor();
    assert((await page.locator('.dialog').count()) === 0, 'новый игрок: сначала кадр, потом обучение');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Enter'); // «Дальше» ×3, «К расследованию»
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click();
    await page.waitForSelector('.case');
    assert((await page.locator('.case .topbar .title').innerText()).includes('Чей пирог'), 'открыто обучающее дело');
    await context.close();
  }

  console.log('\n=== 10. Обложки и одиночный кадр: мобильная вёрстка ===');
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const size = `${viewport.width}×${viewport.height}`;
    const { context, page } = await openWithSave(browser, null, viewport);
    const bad = await page.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('горизонтальная прокрутка');
      for (const card of document.querySelectorAll('.case-card')) {
        const c = card.getBoundingClientRect();
        const mark = (card.querySelector('.cover') || card.querySelector('.stamp')).getBoundingClientRect();
        const text = card.querySelector('.text').getBoundingClientRect();
        const name = card.querySelector('b').textContent;
        if (c.right > window.innerWidth + 1) out.push(`${name}: шире окна`);
        if (mark.right > text.left + 1) out.push(`${name}: обложка наезжает на текст`);
        if (mark.top < c.top - 1 || mark.bottom > c.bottom + 1) out.push(`${name}: обложка выходит из карточки`);
      }
      return out;
    });
    assert(bad.length === 0, `${size}: карточки с обложками без наложений` + (bad.length ? ': ' + bad.join('; ') : ''));
    const hit = await page.locator('.case-card').first().boundingBox();
    assert(hit.height >= 44, `${size}: карточка не ниже 44px`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/plot-covers-${size}.png` });

    await page.locator('.case-card', { hasText: /Чей велосипед/ }).click();
    await page.locator('.story').waitFor();
    await page.waitForFunction(() => document.querySelector('.story-image')?.naturalWidth > 0);
    await page.evaluate(() => document.querySelector('.story-image').decode());
    assert(await page.evaluate(() => document.querySelector('.story-image').naturalWidth === 1080), `${size}: картинка кадра загружена`);
    const issues = await geometry(page, [
      ['.story .topbar', '.story-frame'],
      ['.story-frame', '.story-caption'],
      ['.story-caption', '.story-controls'],
    ]);
    assert(issues.length === 0, `${size}: одиночный кадр без наложений` + (issues.length ? ': ' + issues.join('; ') : ''));
    const btn = await page.locator('.story-controls .btn').boundingBox();
    assert(btn.y + btn.height <= viewport.height && btn.height >= 44, `${size}: «К расследованию» видна без прокрутки`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/story-bike-${size}.png` });
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 11. «Пирог»: книжка из четырёх страниц, новая редакция показывается один раз ===');
  {
    // Игрок видел и одиночный кадр, и трёхстраничную книжку (ред. 2), начал «Пирог», есть покупка и звёзды.
    const old = JSON.parse(JSON.stringify(HOSE_DONE));
    old.data.casesCompleted = ['ch1-hose'];
    old.data.storySeen = ['tutorial-1', 'tutorial-1#2', 'second-1', 'ch1-hose'];
    old.data.progress['tutorial-1'] = { marks: { 'места|калитка~персонажи|Ирина': 'no' }, hintsUsed: 1 };
    old.data.purchases = { noAds: true };
    const { context, page } = await openWithSave(browser, old);
    const before = await saveOf(page);
    const pie = page.locator('.case-card', { hasText: /Чей пирог/ });
    assert((await pie.locator('.cover-image').getAttribute('src')).includes('cover-tutorial-pie'), 'обложка «Пирога» прежняя');
    await pie.click();
    const story = page.locator('.story');
    await story.waitFor();
    const captions = [];
    const images = [];
    for (let i = 1; i <= 4; i += 1) {
      assert((await story.locator('.story-counter').innerText()).trim() === `${i} / 4`, `страница ${i} из 4`);
      await page.waitForFunction(() => document.querySelector('.story-image')?.naturalWidth > 0);
      captions.push(await story.locator('.story-caption').innerText());
      images.push(await story.locator('.story-image').evaluate((n) => n.src.split('/').pop().split('.')[0]));
      if (i < 4) await story.getByRole('button', { name: 'Дальше' }).click();
    }
    assert(
      JSON.stringify(images) === JSON.stringify(['tutorial-pie-book-1', 'tutorial-pie-book-2-garden', 'tutorial-pie-book-umbrella', 'tutorial-pie-1']),
      'порядок страниц: двор → лейка у грядки → зонт → пирог в беседке: ' + images.join(', '),
    );
    assert(
      captions[0].includes('Михаил, Ирина и Олег') && captions[1].includes('полная лейка') && captions[2].includes('был зонт') && captions[3].includes('Чей он?'),
      'подписи книжки по порядку',
    );
    assert(!captions.join(' ').includes('пирог, зонт или лейка'), 'белой страницы с отдельными предметами больше нет');
    // «Пропустить» с последней страницы: дальше — дело с условиями и фактами.
    await story.getByRole('button', { name: 'Пропустить' }).click();
    await page.waitForSelector('.case');
    const intro = await page.locator('.case-intro').innerText();
    assert(intro.includes('по одному в каждом') && intro.includes('у всех разные') && intro.includes('Чей пирог остался в беседке?'), 'после пропуска условия на экране дела');
    assert((await page.locator('.clues .clue').count()) === 5 && (await page.locator('.clues-title').innerText()).trim() === 'Факты', 'после пропуска факты на экране дела');
    assert((await page.locator('button[aria-label="Ирина — калитка"].no').count()) === 1, 'незаконченная отметка «Пирога» на месте');
    let saved = await saveOf(page);
    assert(saved.data.storySeen.includes('tutorial-1#3'), 'новая редакция записана отдельным ключом');
    assert(['tutorial-1', 'tutorial-1#2', 'second-1', 'ch1-hose'].every((k) => saved.data.storySeen.includes(k)), 'прежние отметки просмотра (обеих прежних редакций и других дел) не стёрты');
    assert(JSON.stringify(saved.data.progress['tutorial-1']) === JSON.stringify(before.data.progress['tutorial-1']), 'прогресс «Пирога» не изменился');
    assert(saved.data.purchases.noAds === true && JSON.stringify(saved.data.stars) === JSON.stringify(before.data.stars), 'покупка и звёзды на месте');

    // Повтор из блока условий: все три страницы, фокус возвращается на кнопку.
    const replay = page.locator('.case-intro').getByRole('button', { name: '📖 Вступление' });
    await replay.focus();
    await page.keyboard.press('Enter');
    await story.waitFor();
    assert((await story.locator('.story-counter').innerText()).trim() === '1 / 4', 'повтор — с первой страницы книжки');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
    assert((await story.locator('.story-counter').innerText()).trim() === '4 / 4', 'стрелки листают книжку до конца');
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
      assert(await page.evaluate(() => !!document.activeElement?.closest('.story')), `повтор, ${i % 2 ? 'Shift+Tab' : 'Tab'}: фокус внутри книжки`);
    }
    assert(await page.evaluate(() => document.getElementById('app').inert === true), 'фон под книжкой заблокирован');
    await page.keyboard.press('Escape');
    assert(await replay.evaluate((n) => n === document.activeElement), 'после повтора фокус на кнопке «Вступление»');

    // Второй раз сам не показывается; «Велосипед» по-прежнему не показывается (его кадр не менялся).
    await page.locator('.case .topbar .btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.case-list');
    for (const re of [/Чей пирог/, /Чей велосипед/]) {
      await page.locator('.case-card', { hasText: re }).click();
      await page.waitForSelector('.case');
      assert((await story.count()) === 0, `${re}: вступление само не показывается`);
      await page.locator('.case .topbar .btn').click();
    }
    saved = await saveOf(page);
    assert(JSON.stringify(saved.data.casesCompleted) === JSON.stringify(before.data.casesCompleted), 'раскрытые дела не изменились');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const size = `${viewport.width}×${viewport.height}`;
    const { context, page } = await openWithSave(browser, null, viewport);
    await page.locator('.case-card', { hasText: /Чей пирог/ }).click();
    const story = page.locator('.story');
    await story.waitFor();
    for (let i = 1; i <= 4; i += 1) {
      await page.waitForFunction(() => document.querySelector('.story-image')?.naturalWidth > 0);
      await page.evaluate(() => document.querySelector('.story-image').decode());
      const whole = await page.evaluate(() => {
        const img = document.querySelector('.story-image');
        const box = img.getBoundingClientRect();
        const fit = getComputedStyle(img).objectFit;
        // При contain картинка целиком; при пропорции рамки = пропорции картинки полей нет.
        return fit === 'contain' && Math.abs(box.width / box.height - img.naturalWidth / img.naturalHeight) < 0.02;
      });
      assert(whole, `${size}, страница ${i}: картинка целиком, без обрезки и полей`);
      const issues = await geometry(page, [
        ['.story .topbar', '.story-frame'],
        ['.story-frame', '.story-caption'],
        ['.story-caption', '.story-controls'],
      ]);
      assert(issues.length === 0, `${size}, страница ${i}: без наложений` + (issues.length ? ': ' + issues.join('; ') : ''));
      const btn = await story.locator('.story-controls .btn').boundingBox();
      assert(btn.y + btn.height <= viewport.height && btn.height >= 44, `${size}, страница ${i}: кнопка видна без прокрутки`);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/pie-book-${i}-${size}.png` });
      await story.locator('.story-controls .btn').click();
    }
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click();
    await page.waitForSelector('.case');
    const caseIssues = await geometry(page, [
      ['.case-intro', '.clues'],
      ['.clues', '.grids-stack'],
    ]);
    assert(caseIssues.length === 0, `${size}: условия, факты и таблицы «Пирога» без наложений` + (caseIssues.length ? ': ' + caseIssues.join('; ') : ''));
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/pie-case-${size}.png` });
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  console.log('\n=== 12. Дело 3 «Свет над прудом»: таблицы, выбор версии, сохранение шага, развязка главы ===');
  const POND_YES = [
    ['Геннадий Ильич', '1:00'], ['Зоя', '0:00'], ['Игорь', '2:00'], ['Настя', '23:00'], ['Рома', '3:00'],
    ['Геннадий Ильич', 'кадр Насти'], ['Зоя', 'лай собаки'], ['Игорь', 'свет фонарика'], ['Настя', 'скрип калитки'], ['Рома', 'следы сапог'],
  ];
  const POND_TITLE = /Свет над прудом/;
  const KEY_DONE = JSON.parse(JSON.stringify(HOSE_DONE));
  KEY_DONE.data.casesCompleted = ['ch1-hose', 'ch1-key'];
  KEY_DONE.data.stars = { 'ch1-hose': 3, 'ch1-key': 2 };
  KEY_DONE.data.purchases = { noAds: true };
  {
    // Заперто, пока не раскрыто дело 2.
    const { context, page } = await openWithSave(browser, HOSE_DONE);
    const card = page.getByRole('button', { name: POND_TITLE });
    assert(await card.isDisabled() && (await card.innerText()).includes('Сначала раскройте «Чей ключ»'), 'дело 3 заперто до раскрытия дела 2');
    await context.close();
  }
  {
    const { context, page } = await openWithSave(browser, KEY_DONE);
    await page.getByRole('button', { name: POND_TITLE }).click();
    await page.waitForSelector('.case');
    assert((await page.locator('.story').count()) === 0, 'у дела 3 нет кадров вступления');
    const intro = await page.locator('.case-intro').innerText();
    assert(intro.includes('Кольцо с биркой «Правление»') && intro.includes('Кто был у водокачки в 1:00?'), 'условия связаны с находкой дела 2 и задают вопрос');
    assert((await page.locator('.clues .clue').count()) === 9, 'девять фактов');
    assert((await page.locator('.evidence').count()) === 0, 'факты главы до таблиц не показаны');
    assert(!(await page.locator('.case-scroll').innerText()).includes('след шланга'), 'след шланга до таблиц не упоминается');
    const labels = (await page.locator('.grid-block .label').allInnerTexts()).map((t) => t.trim().toLowerCase());
    assert(labels.length === 3 && labels[0] === 'соседи — час у водокачки' && labels[1] === 'соседи — что выдало', 'таблицы: ' + labels.join(' | '));
    assert((await page.locator('.grids-goal').innerText()).includes('останется выбрать версию'), 'цель говорит, что после таблиц — выбор версии');
    await page.locator('.hint-btn').click();
    const hint = await page.locator('.hint-text').innerText();
    assert(hint.length > 20 && !/Геннадий Ильич[^.]*1:00/.test(hint), 'первая подсказка объясняет шаг, не выдавая ответ');

    await solve(page, POND_YES, '.step');
    assert((await page.locator('.reveal').count()) === 0, 'таблицы решены — дело ещё не раскрыто');
    const evidence = await page.locator('.evidence').innerText();
    assert(evidence.includes('включали один раз — ровно в 1:00') && evidence.includes('у насоса один человек') && evidence.includes('след шланга') && evidence.includes('к 1 августа') && evidence.includes('«Правление»'), 'после таблиц — факты главы: начало расхода и единственный человек у рычага, след, мотив, ключ');
    assert(!/Геннадий|председател/.test((await page.locator('.evidence .clue').nth(0).innerText()) + (await page.locator('.evidence .clue').nth(1).innerText())), 'факты о самописце и кадре не называют имени');
    assert((await page.locator('.step-question').innerText()).includes('прошлой ночью'), 'вопрос — только про прошлую ночь');
    assert((await page.locator('.step-options.versions .btn').allInnerTexts()).every((t) => t.trim().startsWith('Прошлой ночью')), 'все версии — про прошлую ночь');
    const summary = await page.locator('.step .case-file-row:not(.case-file-head)').allInnerTexts();
    assert(summary.some((r) => /Геннадий Ильич[\s\S]*1:00[\s\S]*кадр Насти/.test(r)), 'итог таблиц на экране шага');
    const versions = page.locator('.step-options.versions .btn');
    assert((await versions.count()) === 3, 'три версии');

    // Неверная версия с клавиатуры: опровержение часом из таблиц и фактом главы.
    await versions.filter({ hasText: 'Зоя' }).focus();
    await page.keyboard.press('Enter');
    let fb = await page.locator('.step-feedback').innerText();
    assert(fb.startsWith('Не сходится') && fb.includes('Зоя — час у водокачки: 0:00') && fb.includes('включили один раз — в 1:00') && fb.includes('не к пасеке'), 'версия про Зою опровергнута: ' + fb);
    assert(await versions.filter({ hasText: 'Зоя' }).isDisabled(), 'отброшенная версия погашена');
    let saved = await saveOf(page);
    assert(saved.data.progress['ch1-pond']?.gridSolved === true && JSON.stringify(saved.data.progress['ch1-pond'].wrongChoices) === '["Зоя"]', 'в сохранении: таблицы решены, версия про Зою отброшена');
    assert(!saved.data.casesCompleted.includes('ch1-pond'), 'дело ещё не раскрыто');

    // Уход и перезагрузка: возвращаемся прямо к выбору версии, Зоя по-прежнему погашена.
    await page.locator('.step .topbar .btn').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.case-list');
    assert((await page.getByRole('button', { name: POND_TITLE }).innerText()).includes('осталось выбрать версию'), 'карточка: осталось выбрать версию');
    await page.getByRole('button', { name: POND_TITLE }).click();
    await page.waitForSelector('.step');
    assert((await page.locator('.grid-block').count()) === 0, 'возврат сразу на выбор версии');
    assert(await versions.filter({ hasText: 'Зоя' }).isDisabled(), 'после перезагрузки версия про Зою всё ещё отброшена');

    await versions.filter({ hasText: 'Рома' }).click();
    fb = await page.locator('.step-feedback').innerText();
    assert(fb.includes('Рома — час у водокачки: 3:00') && fb.includes('одолжил'), 'версия про Рому опровергнута часом и ключом: ' + fb);
    await versions.filter({ hasText: 'Геннадий Ильич' }).click();
    const ok = await page.locator('.step-feedback.correct').innerText();
    assert(ok.startsWith('Верно') && ok.includes('включили один раз — в 1:00') && ok.includes('кадр Насти') && ok.includes('По таблицам это Геннадий Ильич') && ok.includes('1 августа'), 'верная версия: момент → кадр → таблицы → человек, след, мотив');
    await page.getByRole('button', { name: 'К развязке' }).click();
    await page.waitForSelector('.reveal');
    const reveal = await page.locator('.reveal-text').innerText();
    assert(reveal.startsWith('Доказано про прошлую ночь') && reveal.indexOf('доказательств нет') < reveal.indexOf('признаётся') && reveal.includes('позапрошлой ночью'), 'развязка: доказанное про прошлую ночь отдельно от признания о двух предыдущих');
    assert(reveal.includes('Зою больше никто не подозревает'), 'развязка снимает подозрения с Зои');
    const finding = await page.locator('.finding').innerText();
    assert(finding.includes('лодку') && finding.includes('Продолжение следует'), 'крючок на следующую главу');
    assert((await page.locator('.next-case').count()) === 0, 'дела после 3 нет — кнопки «Следующее дело» нет');
    saved = await saveOf(page);
    assert(saved.data.casesCompleted.includes('ch1-pond') && !saved.data.progress['ch1-pond'], 'дело 3 раскрыто, незаконченный шаг удалён');
    assert(saved.data.stars['ch1-pond'] === 2, 'звёзды по подсказкам таблиц (одна подсказка → 2)');
    assert(saved.data.purchases.noAds === true && saved.data.stars['ch1-key'] === 2, 'покупка и прежние звёзды на месте');
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1000, height: 700 },
  ]) {
    const size = `${viewport.width}×${viewport.height}`;
    const { context, page } = await openWithSave(browser, KEY_DONE, viewport);
    await page.getByRole('button', { name: POND_TITLE }).click();
    await page.waitForSelector('.case');
    const caseIssues = await geometry(page, [
      ['.case-intro', '.clues'],
      ['.clues', '.grids-stack'],
    ]);
    assert(caseIssues.length === 0, `${size}: условия, факты и таблицы 5×5 без наложений и прокрутки вбок` + (caseIssues.length ? ': ' + caseIssues.join('; ') : ''));
    const gridFits = await page.evaluate(() => [...document.querySelectorAll('.grid-block')].every((g) => g.getBoundingClientRect().right <= window.innerWidth + 1));
    assert(gridFits, `${size}: таблицы 5×5 помещаются по ширине`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/pond-case-${size}.png` });
    await solve(page, POND_YES, '.step');
    await page.locator('.step-options.versions .btn').filter({ hasText: 'Рома' }).click();
    const stepIssues = await geometry(page, [
      ['.step .case-file', '.evidence'],
      ['.evidence', '.step-question'],
      ['.step-options', '.step-feedback'],
    ]);
    assert(stepIssues.length === 0, `${size}: выбор версии без наложений` + (stepIssues.length ? ': ' + stepIssues.join('; ') : ''));
    const heights = await page.locator('.step-options.versions .btn').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().height));
    assert(heights.every((h) => h >= 44), `${size}: версии не ниже 44px`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/pond-step-${size}.png`, fullPage: true });
    assert(page.errors.length === 0, 'без ошибок: ' + page.errors.join('; '));
    await context.close();
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
