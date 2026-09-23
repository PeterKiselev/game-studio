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
    await page.goto(BASE, { waitUntil: 'networkidle' });
    assert(await page.locator('.academy-card').isVisible(), 'академия — главный акцент первого экрана');
    await page.locator('.academy-card').click();
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
    assert(page.errors.length === 0, 'без ошибок в консоли: ' + page.errors.join('; '));
    await page.close();
  }

  // --- сценарий 1: счастливый путь — решение через подсказки, звёзды и достижение ---
  console.log('\n=== 1. Счастливый путь: решение через подсказки ===');
  {
    const page = await newPage(browser);
    const logs = [];
    attachLogger(page, logs);
    await page.goto(BASE, { waitUntil: 'networkidle' });
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
    await page.goto(BASE, { waitUntil: 'networkidle' });
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
    await page.goto(BASE, { waitUntil: 'networkidle' });
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
      await page.goto(BASE, { waitUntil: 'networkidle' });
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
    await page.goto(BASE, { waitUntil: 'networkidle' });
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

  await browser.close();
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
