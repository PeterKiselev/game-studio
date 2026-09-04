/**
 * Скриншоты игры для магазинов площадок.
 *
 * Запуск (playwright стоит глобально, поэтому нужен NODE_PATH):
 *   NODE_PATH="$(npm root -g)" node tools/shots.cjs [базовый-url]
 *
 * По умолчанию снимает веб-сборку с GitHub Pages. Кадры кладёт
 * в static/shots/ — оттуда их и загружаем в кабинеты площадок.
 *
 * Скрипт не привязан к этой игре: он ходит по общим селекторам
 * дизайн-системы (.menu, .board, .cell), поэтому подойдёт любой
 * следующей игре студии без правок.
 */

const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'https://peterkiselev.github.io/game-studio/';
const OUT = join(__dirname, '..', 'static', 'shots');

// Телефон: снимаем в портрете с тройной плотностью — площадки любят крупные кадры.
const PHONE = { width: 380, height: 760, deviceScaleFactor: 3 };
// Десктоп: так игру видят во ВКонтакте в браузере.
const DESKTOP = { width: 1000, height: 620, deviceScaleFactor: 2 };
// Точный размер, который просит витрина VK под скриншоты.
const VK_STORE = { width: 1200, height: 600, deviceScaleFactor: 1 };
// Яндекс Игры: десктопные скриншоты строго 16:9.
const YANDEX_DESKTOP = { width: 1920, height: 1080, deviceScaleFactor: 1 };
// Мобильные — на случай, если форма всё же требует альбомную 16:9...
const YANDEX_MOBILE_LANDSCAPE = { width: 1600, height: 900, deviceScaleFactor: 1 };
// ...и на случай портретной 9:16, которая куда честнее для вертикальной игры.
const YANDEX_MOBILE_PORTRAIT = { width: 900, height: 1600, deviceScaleFactor: 1 };

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
  await page.waitForSelector('.menu', { timeout: 15000 });
  return { context, page };
}

/** Разыгрывает несколько ходов, чтобы на кадре была живая партия, а не пустое поле. */
async function playMoves(page, cells) {
  for (const index of cells) {
    const cell = page.locator('.cell').nth(index);
    if (await cell.isEnabled()) {
      await cell.click();
      await pause(450); // бот думает 260 мс, даём запас на анимацию
    }
  }
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // 1. Меню, светлая тема, телефон
  {
    const { context, page } = await openGame(browser, PHONE, 'light');
    await shot(page, 'phone-menu-light');
    await context.close();
  }

  // 2. Крестики-нолики в разгаре, светлая тема
  {
    const { context, page } = await openGame(browser, PHONE, 'light');
    await page.getByRole('button', { name: 'Крестики-нолики' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [4, 0, 8]);
    await shot(page, 'phone-tic-light');
    await context.close();
  }

  // 3. Пять в ряд, тёмная тема — показываем большое поле и второй режим
  {
    const { context, page } = await openGame(browser, PHONE, 'dark');
    await page.getByRole('button', { name: 'Пять в ряд' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [112, 113, 127, 98]);
    await shot(page, 'phone-five-dark');
    await context.close();
  }

  // 4. Меню в тёмной теме — так игра выглядит внутри ночного VK
  {
    const { context, page } = await openGame(browser, PHONE, 'dark');
    await shot(page, 'phone-menu-dark');
    await context.close();
  }

  // 5. Десктопный вид для сниппета и карточки
  {
    const { context, page } = await openGame(browser, DESKTOP, 'light');
    await page.getByRole('button', { name: 'Крестики-нолики' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [4, 0]);
    await shot(page, 'desktop-tic-light');
    await context.close();
  }

  // 6-8. Ровно 1200x600 — размер, который просит витрина VK
  {
    const { context, page } = await openGame(browser, VK_STORE, 'light');
    await shot(page, 'vk-store-menu');
    await page.getByRole('button', { name: 'Крестики-нолики' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [4, 0, 8]);
    await shot(page, 'vk-store-tic');
    await context.close();
  }
  {
    const { context, page } = await openGame(browser, VK_STORE, 'dark');
    await page.getByRole('button', { name: 'Пять в ряд' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [112, 113, 127, 98, 129]);
    await shot(page, 'vk-store-five-dark');
    await context.close();
  }

  // 9. Яндекс Игры: десктоп, строго 16:9
  {
    const { context, page } = await openGame(browser, YANDEX_DESKTOP, 'light');
    await page.getByRole('button', { name: 'Крестики-нолики' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [4, 0, 8]);
    await shot(page, 'yandex-desktop-16x9');
    await context.close();
  }

  // 10-11. Яндекс Игры: мобильный тип, оба варианта ориентации про запас
  {
    const { context, page } = await openGame(browser, YANDEX_MOBILE_LANDSCAPE, 'light');
    await page.getByRole('button', { name: 'Пять в ряд' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [112, 113, 127, 98]);
    await shot(page, 'yandex-mobile-landscape-16x9');
    await context.close();
  }
  {
    const { context, page } = await openGame(browser, YANDEX_MOBILE_PORTRAIT, 'light');
    await page.getByRole('button', { name: 'Пять в ряд' }).click();
    await page.waitForSelector('.board');
    await playMoves(page, [112, 113, 127, 98]);
    await shot(page, 'yandex-mobile-portrait-9x16');
    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error('Не удалось снять кадры:', err.message);
  process.exit(1);
});
