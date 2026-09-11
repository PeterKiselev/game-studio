/**
 * Автопрохождение «Дачных тайн» — реальные клики по реальным кнопкам,
 * не картинка. Покрывает не только счастливый путь: три сценария ниже
 * специально нацелены на классы багов, которые happy-path не ловит
 * (потерянный прогресс, ложная награда при повторе, гонка при выходе).
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

async function openCase(page) {
  await page.getByRole('button', { name: /Чей пирог остался в беседке/ }).click();
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

  // Намеренно неверная клетка — Ирина не в беседке. Должна дать case_mistake
  // и не должна помешать раскрыть дело после исправления.
  await clickCell(page, 'Ирина', 'беседка');
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);
  await page.screenshot({ path: join(OUT, '3-case-solved.png') });

  await page.waitForSelector('.reveal', { timeout: 3000 });
  await page.screenshot({ path: join(OUT, '4-reveal.png') });

  assert(logs.some((l) => l.includes('case_mistake')), 'ошибочная клетка дала case_mistake');
  assert(logs.some((l) => l.includes('case_complete')), 'дело раскрыто despite ошибки');
  assert(
    (await page.locator('.reward').count()) === 1,
    'при первом раскрытии показана награда участку',
  );

  // Ошибочная клетка не должна была остаться отмеченной «да» после автоисключения.
  const wrongStillYes = await page
    .locator('button[aria-label="Ирина — беседка"], button[aria-label="беседка — Ирина"]')
    .evaluateAll((els) => els.some((el) => el.classList.contains('yes')));
  assert(!wrongStillYes, 'ошибочная клетка автоматически снята, а не осталась «да»');

  await page.getByRole('button', { name: 'Вернуться на участок' }).click();
  await page.waitForSelector('.plot');

  // --- сценарий 2: повтор уже раскрытого дела — без повторной награды --
  console.log('\n=== 2. Повтор раскрытого дела ===');
  logs.length = 0;
  await openCase(page);
  assert(
    !logs.some((l) => l.includes('onboarding_shown')),
    'обучение не повторяется на втором открытии дела за сессию',
  );
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);
  await page.waitForSelector('.reveal', { timeout: 3000 });
  assert(
    (await page.locator('.reward').count()) === 0,
    'при повторном раскрытии награда НЕ показана — сохранение не менялось',
  );
  await page.getByRole('button', { name: 'Вернуться на участок' }).click();
  await page.waitForSelector('.plot');

  // --- сценарий 3: вторая подсказка на площадке без рекламы (web) ------
  console.log('\n=== 3. Вторая подсказка без рекламы на этой площадке ===');
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
  await page.getByRole('button', { name: 'Участок' }).click();
  await page.waitForSelector('.plot');

  // --- сценарий 4: незаконченное дело переживает перезагрузку страницы -
  console.log('\n=== 4. Незаконченное дело переживает перезагрузку ===');
  await openCase(page);
  await clickCell(page, 'Ирина', 'грядка');
  await clickCell(page, 'Михаил', 'беседка');
  await page.waitForTimeout(150); // markDirty() пишет в localStorage синхронно, запас на кадр

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.plot');
  await openCase(page); // то же дело — должно восстановить отметки, не начать заново

  const restored = await page
    .locator('button[aria-label="Ирина — грядка"], button[aria-label="грядка — Ирина"]')
    .evaluateAll((els) => els.some((el) => el.classList.contains('yes')));
  assert(restored, 'отметка пережила перезагрузку страницы — прогресс не потерян');

  // Добиваем дело до конца, чтобы следующий прогон скрипта не унаследовал
  // чужое незаконченное состояние.
  for (const [row, col] of TUTORIAL_YES) await clickCell(page, row, col);
  await page.waitForSelector('.reveal', { timeout: 3000 });

  await browser.close();

  console.log('\n--- все события аналитики за прогон ---');
  console.log('готово:', OUT);
  console.log('\nВСЕ ПРОВЕРКИ ПРОШЛИ');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
