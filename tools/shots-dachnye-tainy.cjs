/**
 * Скриншоты «Дачных тайн» для витрин площадок.
 *
 * Запуск (playwright стоит глобально, поэтому нужен NODE_PATH):
 *   NODE_PATH="$(npm root -g)" node tools/shots-dachnye-tainy.cjs [базовый-url]
 *
 * По умолчанию снимает веб-сборку с GitHub Pages. Кадры кладёт
 * в games/dachnye-tainy/store/shots/. Отдельный скрипт от shots.cjs —
 * там экраны (.menu/.board/.cell гомоку) и порядок кликов специфичны
 * для крестиков-ноликов, здесь своя последовательность (участок →
 * дело → развязка) с обучающим диалогом, которого у гомоку нет.
 */

const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'https://peterkiselev.github.io/game-studio/dachnye-tainy/';
const OUT = join(__dirname, '..', 'games', 'dachnye-tainy', 'store', 'shots');

const PHONE = { width: 390, height: 780, deviceScaleFactor: 3 };
// Точный размер, который просит витрина VK/OK под скриншоты (общая инфраструктура).
const VK_STORE = { width: 1200, height: 600, deviceScaleFactor: 1 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function openGame(browser, viewport, colorScheme) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    colorScheme,
    locale: 'ru-RU',
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.plot', { timeout: 15000 });
  return { context, page };
}

async function openCase(page, title) {
  await page.getByRole('button', { name: title }).click();
  try {
    await page.getByRole('button', { name: 'Понятно, начинаем' }).click({ timeout: 1000 });
  } catch {
    /* обучение уже показано раньше в этом контексте — это нормально */
  }
  await page.waitForSelector('.case');
}

async function clickCell(page, rowLabel, colLabel) {
  const direct = page.locator(`button[aria-label="${rowLabel} — ${colLabel}"]`).first();
  const locator = (await direct.count()) > 0
    ? direct
    : page.locator(`button[aria-label="${colLabel} — ${rowLabel}"]`).first();
  await locator.click();
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // 1. Участок — начальный экран, светлая тема
  {
    const { context, page } = await openGame(browser, PHONE, 'light');
    await shot(page, 'phone-plot-light');
    await context.close();
  }

  // 2. Дело в процессе — несколько верных отметок, светлая тема
  {
    const { context, page } = await openGame(browser, PHONE, 'light');
    await openCase(page, /Чей пирог остался в беседке/);
    await clickCell(page, 'Ирина', 'грядка');
    await clickCell(page, 'Михаил', 'беседка');
    await pause(200);
    await shot(page, 'phone-case-light');
    await context.close();
  }

  // 3. Развязка — тёмная тема, показываем и второй режим оформления
  {
    const { context, page } = await openGame(browser, PHONE, 'dark');
    await openCase(page, /Чей пирог остался в беседке/);
    await clickCell(page, 'Ирина', 'грядка');
    await clickCell(page, 'Михаил', 'беседка');
    await clickCell(page, 'Олег', 'калитка');
    await clickCell(page, 'Ирина', 'лейка');
    await clickCell(page, 'Михаил', 'пирог');
    await clickCell(page, 'Олег', 'зонт');
    await page.waitForSelector('.reveal', { timeout: 3000 });
    await pause(200);
    await shot(page, 'phone-reveal-dark');
    await context.close();
  }

  // 4. Участок — тёмная тема
  {
    const { context, page } = await openGame(browser, PHONE, 'dark');
    await shot(page, 'phone-plot-dark');
    await context.close();
  }

  // 5-6. Ровно 1200x600 — размер, который просит витрина VK/OK
  {
    const { context, page } = await openGame(browser, VK_STORE, 'light');
    await shot(page, 'vk-store-plot');
    await openCase(page, /Чей пирог остался в беседке/);
    await clickCell(page, 'Ирина', 'грядка');
    await clickCell(page, 'Михаил', 'беседка');
    await pause(200);
    await shot(page, 'vk-store-case');
    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error('Не удалось снять кадры:', err.message);
  process.exit(1);
});
