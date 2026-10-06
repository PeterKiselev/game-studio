/**
 * Автопрохождение судоку — реальные клики по реальным кнопкам, не картинка.
 * По тому же принципу, что playtest.cjs у «Дачных тайн»: happy path сам по
 * себе не ловит самые интересные баги, поэтому сценарии специально целятся
 * в конкретные классы ошибок — ложную победу при нарушенном правиле,
 * потерю прогресса при перезагрузке, недетерминированность ежедневного
 * пазла между игроками.
 *
 * В отличие от «Дачных тайн», у судоку нет фиксированного контента с
 * заранее известным решением (пазлы генерируются процедурно) — поэтому
 * здесь нет сценария «ввели верные цифры и получили 3 звезды»: этот путь
 * невозможно проверить кликами без подглядывания в решение через отладочный
 * хук, который мы намеренно не добавляли. starsFor()/checkNewAchievements()
 * по чистой логике уже покрыты юнит-тестами в games/sudoku/test/ — здесь
 * проверяется то, что юнит-тесты не видят: реальный DOM и реальное
 * сохранение в localStorage.
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4176/';

/**
 * Язык в сценарии всегда задаётся явно. Без ?lang= игра берёт локаль
 * площадки (в headless-браузере это en-US), и проверка русской строки
 * начинает зависеть от настроек машины — то есть перестаёт быть проверкой.
 */
function url(lang, base = BASE) {
  return `${base}${base.includes('?') ? '&' : '?'}lang=${lang}`;
}

function assert(cond, message) {
  if (!cond) throw new Error('ПРОВАЛ: ' + message);
  console.log('  ok —', message);
}

function attachLogger(page, logs) {
  page.on('console', (msg) => {
    if (msg.text().startsWith('[analytics]')) logs.push(msg.text());
  });
}

async function newPage(browser, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 420, height: 800 }, ...opts });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  return page;
}

async function solveViaHints(page, maxSteps = 120) {
  for (let i = 0; i < maxSteps; i += 1) {
    if ((await page.locator('.reveal').count()) > 0) return true;
    try {
      // Переход на экран развязки идёт с 400мс задержкой (checkSolved()),
      // а не мгновенно — клик может застать сам момент смены экрана и
      // повиснуть на отсоединённой кнопке. Это не баг игры, а гонка в
      // самом сценарии клика; короткий таймаут + проверка .reveal на
      // следующем шаге цикла надёжнее, чем один клик без права на ошибку.
      await page.locator('.hint-btn').click({ timeout: 2000 });
    } catch {
      /* см. комментарий выше — реальный результат проверит следующая итерация */
    }
    await page.waitForTimeout(50);
  }
  return (await page.locator('.reveal').count()) > 0;
}

(async () => {
  const browser = await chromium.launch();

  // --- сценарий 0: академия — первый экран, урок и последовательная разблокировка ---
  console.log('\n=== 0. Академия логики ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    assert(await page.locator('.academy-card').isVisible(), 'академия — главный акцент первого экрана');

    // Продуктовый разбор vs опубликованных судоку на CrazyGames (передан
    // Codex): на свежем сохранении шесть одинаковых «🔒» в сетке
    // достижений — это только чтение без пользы; строка-тизер должна
    // стоять вместо сетки, пока не открыто ни одного значка.
    assert(await page.locator('.achievements-teaser').isVisible(), 'на свежем сохранении — строка-тизер вместо сетки достижений');
    assert((await page.locator('.achievements .achievement').count()) === 0, 'сама сетка достижений ещё не отрисована');

    // Главная кнопка ведёт СРАЗУ в урок, без промежуточного списка: на
    // портале первые секунды решают, попробует игрок игру или закроет.
    await page.locator('.academy-card').click();
    assert(await page.locator('.academy-lesson').isVisible(), 'первый урок открывается одним кликом с главного экрана');
    assert(await page.locator('.first-lesson-note').isVisible(), 'первый урок объясняет, что это один ход, а не целая головоломка');
    await page.locator('.academy-lesson .topbar .btn').click();

    assert((await page.locator('.lesson-card').count()) === 12, 'курс содержит 12 уроков');
    assert((await page.locator('.lesson-card:enabled').count()) === 1, 'сначала открыт только первый урок');
    await page.locator('.lesson-card').first().click();

    const explanation = await page.locator('.lesson-feedback').innerText();
    const target = explanation.match(/строка (\d+), столбец (\d+).*только (\d+)/);
    assert(!!target, 'объяснение называет клетку и доказанную цифру');
    assert(!(await page.locator('.academy-lesson .btn.primary').isVisible()), 'переход дальше скрыт до правильного ответа');
    const index = (Number(target[1]) - 1) * 9 + Number(target[2]) - 1;
    await page.locator('.sudoku-cell').nth(index).click();
    await page.locator('.digit-btn', { hasText: target[3] }).click();
    assert(await page.locator('.academy-lesson .btn.primary').isVisible(), 'верный ответ открывает следующий урок');
    assert(
      await page.locator('.sudoku-cell').nth(index).evaluate((el) => el.classList.contains('flash-correct')),
      'клетка вспыхивает сразу после верного хода (ещё до того, как класс снимется по таймеру)',
    );
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));

    // Эта же строка-объяснение — только у первого урока курса: у второго
    // игрок уже знает формат, повторять незачем (сама декларация задачи
    // продуктового разбора — не грузить лишним текстом не только первый
    // экран, но и сами уроки после первого).
    await page.locator('.academy-lesson .btn.primary').click();
    assert(await page.locator('.academy-lesson').isVisible(), 'переход на второй урок состоялся');
    assert((await page.locator('.first-lesson-note').count()) === 0, 'на втором уроке пояснение про «один ход» уже не повторяется');
    await page.close();
  }

  // --- сценарий 1: счастливый путь — решение через подсказки, звёзды и достижение ---
  console.log('\n=== 1. Счастливый путь: решение через подсказки ===');
  {
    const page = await newPage(browser);
    const logs = [];
    attachLogger(page, logs);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    assert(await page.locator('.menu h1').isVisible(), 'меню открывается');
    assert((await page.locator('.shop-btn').count()) === 0, 'кнопка магазина скрыта — caps.payments нет на web');

    await page.locator('.difficulty-card').first().click(); // Лёгкий
    await page.waitForSelector('.puzzle');
    assert(await solveViaHints(page), 'пазл решается до конца через подсказки');
    assert(await page.locator('.stars-big').isVisible(), 'экран развязки показывает звёзды');
    assert(await page.locator('.mastery-summary').isVisible(), 'развязка показывает логический профиль задачи');
    assert((await page.locator('.mastery-card').count()) === 3, 'профиль различает три изучаемых приёма');
    assert(
      logs.some((l) => l.includes('puzzle_complete')),
      'событие puzzle_complete отправлено',
    );
    assert(
      (await page.locator('.achievement-unlocked').count()) >= 1,
      'первое решение открывает хотя бы одно достижение (Первое судоку)',
    );

    await page.locator('.controls .btn').click();
    await page.waitForSelector('.menu');
    assert(
      (await page.locator('.achievement.unlocked').count()) >= 1,
      'меню показывает открытое достижение после решения',
    );
    assert(page.errors.length === 0, 'без ошибок в консоли за весь сценарий: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 2: конфликт подсвечивается и не даёт ложной победы ---
  console.log('\n=== 2. Конфликт двух одинаковых цифр не даёт ложной победы ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await page.locator('.difficulty-card').first().click();
    await page.waitForSelector('.puzzle');

    const empties = page.locator('.sudoku-cell:not(.given)');
    const a = empties.nth(0);
    const b = empties.nth(1);
    await a.click();
    await page.locator('.digit-btn', { hasText: '1' }).click();
    await b.click();
    await page.locator('.digit-btn', { hasText: '1' }).click();

    assert(await a.evaluate((el) => el.classList.contains('conflict')), 'первая клетка подсвечена как конфликтная');
    assert(await b.evaluate((el) => el.classList.contains('conflict')), 'вторая клетка подсвечена как конфликтная');
    assert((await page.locator('.reveal').count()) === 0, 'противоречивая сетка не считается решённой');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 3: заметки и прогресс переживают перезагрузку страницы ---
  console.log('\n=== 3. Прогресс и заметки переживают reload ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await page.locator('.difficulty-card').nth(1).click(); // Средний
    await page.waitForSelector('.puzzle');

    const cell = page.locator('.sudoku-cell:not(.given)').first();
    await cell.click();
    await page.locator('.tool-btn').click(); // режим заметок
    await page.locator('.digit-btn', { hasText: '3' }).click();
    await page.locator('.digit-btn', { hasText: '7' }).click();

    // Автосохранение дебаунсится на 1500мс (SaveStore.markDirty) — ждём с запасом.
    await page.waitForTimeout(1700);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.menu');

    const label = await page.locator('.difficulty-card').nth(1).locator('.best').textContent();
    assert(label === 'Продолжить', 'меню после перезагрузки честно показывает незаконченную партию, не «0 партий»');

    await page.locator('.difficulty-card').nth(1).click();
    await page.waitForSelector('.puzzle');
    const notes = await page.locator('.sudoku-cell:not(.given)').first().locator('.notes-grid').textContent();
    assert(notes.includes('3') && notes.includes('7'), 'заметки восстановились после перезагрузки: ' + JSON.stringify(notes));
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 4: ежедневный пазл одинаков в течение дня и меняется на следующий ---
  console.log('\n=== 4. Ежедневный пазл детерминирован по дате ===');
  {
    async function fingerprint(isoDateTime) {
      const page = await newPage(browser);
      await page.clock.install({ time: new Date(isoDateTime) });
      await page.goto(url('ru'), { waitUntil: 'networkidle' });
      await page.locator('.daily-card').click();
      await page.waitForSelector('.puzzle');
      const values = (await page.locator('.sudoku-cell').allTextContents()).join('');
      await page.close();
      return values;
    }

    const morning = await fingerprint('2026-09-23T09:00:00');
    const evening = await fingerprint('2026-09-23T20:00:00');
    const nextDay = await fingerprint('2026-09-24T09:00:00');

    assert(morning === evening, 'один и тот же день даёт один и тот же пазл независимо от времени суток');
    assert(morning !== nextDay, 'следующий день даёт другой пазл');
  }

  // --- сценарий 5: короткий горизонтальный экран остаётся полностью игровым ---
  console.log('\n=== 5. Горизонтальный мобильный экран ===');
  {
    const page = await newPage(browser, { viewport: { width: 800, height: 420 } });
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await page.locator('.difficulty-card').first().click();
    await page.waitForSelector('.puzzle');

    const gridBox = await page.locator('.sudoku-grid').boundingBox();
    const digitBox = await page.locator('.numpad').boundingBox();
    const hintBox = await page.locator('.hint-btn').boundingBox();
    assert(!!gridBox && gridBox.y >= 0 && gridBox.y + gridBox.height <= 420, 'поле целиком видно в landscape');
    assert(!!digitBox && digitBox.y >= 0 && digitBox.y + digitBox.height <= 420, 'цифровая панель доступна в landscape');
    assert(!!hintBox && hintBox.y >= 0 && hintBox.y + hintBox.height <= 420, 'кнопка подсказки доступна в landscape');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 6: русская версия по ?lang=ru не изменилась по смыслу ---
  console.log('\n=== 6. Русская локаль (?lang=ru) ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });

    assert((await page.locator('html').getAttribute('lang')) === 'ru', '<html lang> равен ru');
    assert((await page.title()) === 'Академия Sudoku', 'заголовок вкладки на русском');
    const menuText = await page.locator('.menu').innerText();
    assert(/Практика/.test(menuText), 'меню на русском: раздел «Практика»');
    assert(/Достижения/.test(menuText), 'меню на русском: раздел «Достижения»');

    await page.locator('.academy-card').click();
    await page.waitForSelector('.academy-lesson');
    const lessonText = await page.locator('.lesson-instruction').innerText();
    assert(/[А-Яа-яЁё]/.test(lessonText), 'объяснение урока на русском');

    const cellLabel = await page.locator('.sudoku-cell').first().getAttribute('aria-label');
    assert(/строка 1, столбец 1/.test(cellLabel), 'aria-label клетки на русском: ' + cellLabel);
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 7: английская версия играбельна и не содержит кириллицы ---
  console.log('\n=== 7. Английская локаль (?lang=en) ===');
  {
    const page = await newPage(browser);
    await page.goto(url('en'), { waitUntil: 'networkidle' });

    assert((await page.locator('html').getAttribute('lang')) === 'en', '<html lang> равен en');
    assert((await page.title()) === 'Sudoku Academy', 'заголовок вкладки на английском');

    const menuText = await page.locator('.menu').innerText();
    assert(/Practice/.test(menuText), 'меню на английском: раздел Practice');
    assert(/Achievements/.test(menuText), 'меню на английском: раздел Achievements');
    assert(!/[А-Яа-яЁё]/.test(menuText), 'на первом экране нет кириллицы: ' + menuText.replace(/\n/g, ' | '));

    // Один клик от первого экрана до интерактивного урока — требование карточки.
    await page.locator('.academy-card').click();
    assert(await page.locator('.academy-lesson').isVisible(), 'урок открывается одним кликом');

    const cellLabel = await page.locator('.sudoku-cell').first().getAttribute('aria-label');
    assert(/row 1, column 1/.test(cellLabel), 'aria-label клетки на английском: ' + cellLabel);

    const explanation = await page.locator('.lesson-feedback').innerText();
    assert(!/[А-Яа-яЁё]/.test(explanation), 'объяснение приёма на английском: ' + explanation);

    // Берём ПОСЛЕДНЮЮ названную клетку и доказанную цифру: у голой пары
    // первыми в тексте идут клетки самой пары, а ход делается в третью.
    const cells = [...explanation.matchAll(/row (\d+), column (\d+)\)/g)];
    const value = explanation.match(/can only be (\d+)/);
    assert(cells.length > 0 && !!value, 'английское объяснение называет клетку и цифру: ' + explanation);
    const targetCell = cells[cells.length - 1];

    // Делаем требуемый ход и доводим урок до конца — проверяем, что
    // английская версия не просто переведена, а действительно играется.
    const index = (Number(targetCell[1]) - 1) * 9 + Number(targetCell[2]) - 1;
    await page.locator('.sudoku-cell').nth(index).click();
    await page.locator('.digit-btn', { hasText: String(value[1]) }).click();
    assert(await page.locator('.academy-lesson .btn.primary').isVisible(), 'урок завершается и открывает переход дальше');

    const doneText = await page.locator('.lesson-feedback').innerText();
    assert(/Correct/.test(doneText), 'подтверждение урока на английском: ' + doneText);

    const screenText = await page.locator('.screen').innerText();
    assert(!/[А-Яа-яЁё]/.test(screenText), 'на экране урока не осталось кириллицы: ' + screenText.replace(/\n/g, ' | '));
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 8: официальный размер iframe CrazyGames 907×510 ---
  console.log('\n=== 8. Размер витрины CrazyGames 907×510 ===');
  {
    const page = await newPage(browser, { viewport: { width: 907, height: 510 } });
    await page.goto(url('en'), { waitUntil: 'networkidle' });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `нет горизонтального переполнения на первом экране (запас ${-overflow}px)`);

    await page.locator('.academy-card').click();
    await page.waitForSelector('.academy-lesson');
    const lessonOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(lessonOverflow <= 0, `нет горизонтального переполнения в уроке (запас ${-lessonOverflow}px)`);

    // Кнопки должны быть не просто отрисованы, а доступны внутри окна:
    // «видно, но нельзя нажать» — самый обидный класс дефекта на портале.
    for (const selector of ['.sudoku-grid', '.numpad', '.digit-btn']) {
      const box = await page.locator(selector).first().boundingBox();
      assert(!!box && box.x >= 0 && box.x + box.width <= 907, `${selector} помещается по ширине`);
      assert(!!box && box.y >= 0 && box.y + box.height <= 510, `${selector} помещается по высоте`);
    }
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 9: клавиатура и prefers-reduced-motion для вспышки на верном ходе ---
  console.log('\n=== 9. Клавиатура и reduced-motion ===');
  {
    const page = await newPage(browser);
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await page.locator('.academy-card').click();
    await page.waitForSelector('.academy-lesson');

    const explanation = await page.locator('.lesson-feedback').innerText();
    const target = explanation.match(/строка (\d+), столбец (\d+).*только (\d+)/);
    const index = (Number(target[1]) - 1) * 9 + Number(target[2]) - 1;
    const cell = page.locator('.sudoku-cell').nth(index);
    await cell.click();

    // Цифровая панель — обычные <button>, но это стоит подтвердить живьём:
    // Tab должен реально на неё попадать, а Enter/Space — нажимать, не
    // только клик мышью. focus() на конкретную кнопку, не блуждание Tab'ом
    // по всей странице — короче и не зависит от порядка остальных
    // интерактивных элементов на экране.
    const digitBtn = page.locator('.digit-btn', { hasText: target[3] });
    await digitBtn.focus();
    assert(await digitBtn.evaluate((el) => el === document.activeElement), 'кнопка цифры реально получает фокус по Tab/focus()');
    await page.keyboard.press('Enter');
    assert(await page.locator('.academy-lesson .btn.primary').isVisible(), 'Enter на сфокусированной кнопке активирует ход, не только клик мышью');

    // prefers-reduced-motion: сама вспышка (класс) должна остаться —
    // обратная связь на верный ход не пропадает для таких пользователей,
    // просто CSS-анимация выключена média-запросом (проверяем именно это,
    // а не наличие класса — класс ставит JS и ему не известно про media).
    const animationName = await cell.evaluate((el) => getComputedStyle(el).animationName);
    assert(animationName !== 'none', `без reduced-motion анимация подключена (animation-name: ${animationName})`);
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }
  {
    const page = await newPage(browser);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url('ru'), { waitUntil: 'networkidle' });
    await page.locator('.academy-card').click();
    await page.waitForSelector('.academy-lesson');

    const explanation = await page.locator('.lesson-feedback').innerText();
    const target = explanation.match(/строка (\d+), столбец (\d+).*только (\d+)/);
    const index = (Number(target[1]) - 1) * 9 + Number(target[2]) - 1;
    const cell = page.locator('.sudoku-cell').nth(index);
    await cell.click();
    await page.locator('.digit-btn', { hasText: target[3] }).click();

    const animationName = await cell.evaluate((el) => getComputedStyle(el).animationName);
    assert(animationName === 'none', `prefers-reduced-motion отключает CSS-анимацию вспышки (animation-name: ${animationName})`);
    assert(await cell.evaluate((el) => el.classList.contains('flash-correct')), 'класс всё равно ставится — реакция на верный ход не исчезает целиком, меняется только то, как она выглядит');
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 10: геометрия экрана партии (замечание модерации VK) ---
  // Модератор прислал скриншоты: на десктопе сетка перекрывала верхнюю
  // панель и цифры, после рекламы вёрстка ломалась. Отсутствие горизонтальной
  // прокрутки этого не ловит — проверяем сами прямоугольники элементов.
  console.log('\n=== 10. Геометрия: пересечения на разных окнах и после смены высоты ===');
  {
    const PAIRS = [
      ['.puzzle .topbar', '.sudoku-grid'],
      ['.stats-bar', '.sudoku-grid'],
      ['.sudoku-grid', '.numpad'],
      ['.sudoku-grid', '.hint-bar'],
      ['.numpad', '.hint-bar'],
    ];
    const measure = (page, pairs) =>
      page.evaluate((pairs) => {
        const rect = (sel) => {
          const n = document.querySelector(sel);
          if (!n) return null;
          const r = n.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
        };
        const out = [];
        for (const [a, b] of pairs) {
          const ra = rect(a);
          const rb = rect(b);
          if (!ra || !rb || ra.w === 0 || rb.w === 0) continue;
          const ix = Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l);
          const iy = Math.min(ra.b, rb.b) - Math.max(ra.t, rb.t);
          if (ix > 1 && iy > 1) out.push(`${a}×${b} на ${Math.round(iy)}px`);
        }
        const g = rect('.sudoku-grid');
        if (g && Math.abs(g.w - g.h) > 1.5) out.push(`сетка не квадратная ${Math.round(g.w)}×${Math.round(g.h)}`);
        if (g && (g.l < -1 || g.r > window.innerWidth + 1)) out.push('сетка выходит за окно по ширине');
        if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('горизонтальная прокрутка');
        return out;
      }, pairs);

    const sizes = [];
    for (const w of [360, 420, 620, 1000, 1280, 1600]) for (const h of [480, 540, 600, 700, 800, 1000]) sizes.push([w, h]);
    const bad = [];
    for (const [w, h] of sizes) {
      const page = await newPage(browser, { viewport: { width: w, height: h } });
      await page.goto(url('ru'), { waitUntil: 'networkidle' });
      await page.locator('.difficulty-card').first().click();
      await page.waitForSelector('.puzzle');
      const found = await measure(page, PAIRS);
      if (found.length) bad.push(`${w}×${h}: ${found.join('; ')}`);
      // Окно, где всё должно поместиться без прокрутки целиком: сетка и панель цифр видны.
      if (h >= 700) {
        const below = await page.evaluate(
          () => ['.sudoku-grid', '.numpad'].filter((s) => document.querySelector(s).getBoundingClientRect().bottom > window.innerHeight + 1),
        );
        if (below.length) bad.push(`${w}×${h}: ниже окна: ${below.join(', ')}`);
      }
      await page.close();
    }
    assert(bad.length === 0, `${sizes.length} размеров окна: нет пересечений блоков` + (bad.length ? '\n' + bad.join('\n') : ''));

    // Реклама: платформа меняет доступную высоту посреди партии и потом возвращает.
    for (const [w, h, shrunk] of [[1000, 760, 520], [420, 800, 560], [1280, 900, 600]]) {
      const page = await newPage(browser, { viewport: { width: w, height: h } });
      await page.goto(url('ru'), { waitUntil: 'networkidle' });
      await page.locator('.difficulty-card').first().click();
      await page.waitForSelector('.puzzle');
      await page.locator('.sudoku-cell').nth(40).click();
      for (const height of [shrunk, h, shrunk + 40, h]) {
        await page.setViewportSize({ width: w, height });
        await page.waitForTimeout(120);
        const found = await measure(page, PAIRS);
        assert(found.length === 0, `${w}×${h}: после смены высоты окна на ${height} блоки не пересекаются` + (found.length ? ': ' + found.join('; ') : ''));
      }
      assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
      await page.close();
    }

    // Тот же контейнер у урока Академии.
    for (const [w, h] of [[1000, 700], [420, 640]]) {
      const page = await newPage(browser, { viewport: { width: w, height: h } });
      await page.goto(url('ru'), { waitUntil: 'networkidle' });
      await page.locator('.academy-card').click();
      await page.waitForSelector('.academy-lesson');
      const found = await measure(page, [['.sudoku-grid', '.numpad'], ['.sudoku-grid', '.lesson-feedback']]);
      assert(found.length === 0, `урок Академии ${w}×${h}: без пересечений` + (found.length ? ': ' + found.join('; ') : ''));
      await page.close();
    }
  }

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
