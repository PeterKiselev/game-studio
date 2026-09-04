/**
 * Витринные скриншоты фиксированного холста (Яндекс Игры требуют строго
 * 16:9 или другое заданное соотношение сторон). Открывает игру внутри
 * store-shot.html — сама игра остаётся узкой колонкой на белой карточке
 * поверх фирменного градиента, вместо пустого поля вокруг неё.
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/store-shot.cjs [базовый-url]
 */

const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const GAME_URL = process.argv[2] || 'https://peterkiselev.github.io/game-studio/';
const TEMPLATE = pathToFileURL(join(__dirname, 'store-shot.html')).href;
const OUT = join(__dirname, '..', 'static', 'shots');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** name — файл на выходе; canvas — размер всего кадра; frame — размер карточки с игрой внутри. */
const SHOTS = [
  {
    name: 'yandex-desktop-16x9',
    canvas: { width: 1920, height: 1080 },
    frame: { w: 720, h: 900 },
  },
  {
    name: 'yandex-mobile-landscape-16x9',
    canvas: { width: 1600, height: 900 },
    frame: { w: 460, h: 820 },
  },
  {
    name: 'yandex-mobile-portrait-9x16',
    canvas: { width: 900, height: 1600 },
    frame: { w: 620, h: 1160 },
  },
];

async function playAndShoot(page, screen) {
  const inner = page.frameLocator('#game');
  await inner.locator('.menu').waitFor({ timeout: 15000 });
  await inner.getByRole('button', { name: 'Пять в ряд' }).click();
  await inner.locator('.board').waitFor();
  await pause(200);

  const size = 15;
  const centre = Math.floor((size * size) / 2);
  for (const index of [centre, centre - size, centre + 1, centre - size + 1]) {
    const cell = inner.locator('.cell').nth(index);
    if (await cell.isEnabled()) {
      await cell.click();
      await pause(300);
    }
  }

  const file = join(OUT, `${screen.name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const screen of SHOTS) {
    const context = await browser.newContext({
      viewport: screen.canvas,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      locale: 'ru-RU',
    });
    const page = await context.newPage();

    const url = `${TEMPLATE}?src=${encodeURIComponent(GAME_URL)}&w=${screen.frame.w}&h=${screen.frame.h}`;
    await page.goto(url, { waitUntil: 'load' });

    await playAndShoot(page, screen);
    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error('Не удалось собрать витринные кадры:', err.message);
  process.exit(1);
});
