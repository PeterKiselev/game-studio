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

/**
 * Три кадра на тип холста — как в VK: меню, партия в крестики-нолики,
 * большое поле в тёмной теме. Витрина показывает игру с разных сторон,
 * а не один случайный кадр.
 */
const CANVASES = [
  { key: 'desktop-16x9', canvas: { width: 1920, height: 1080 }, frame: { w: 720, h: 900 } },
  { key: 'mobile-9x16', canvas: { width: 900, height: 1600 }, frame: { w: 620, h: 1160 } },
];

const SCENES = [
  { key: 'menu', scheme: 'light', play: null },
  { key: 'tic', scheme: 'light', play: 'Крестики-нолики' },
  { key: 'five-dark', scheme: 'dark', play: 'Пять в ряд' },
];

async function setupScene(page, scene) {
  const inner = page.frameLocator('#game');
  await inner.locator('.menu').waitFor({ timeout: 15000 });
  if (!scene.play) return;

  await inner.getByRole('button', { name: scene.play }).click();
  await inner.locator('.board').waitFor();
  await pause(200);

  const isFive = scene.play === 'Пять в ряд';
  const size = isFive ? 15 : 3;
  const centre = Math.floor((size * size) / 2);
  const moves = isFive
    ? [centre, centre - size, centre + 1, centre - size + 1]
    : [centre, 0, size - 1];

  for (const index of moves) {
    const cell = inner.locator('.cell').nth(index);
    if (await cell.isEnabled()) {
      await cell.click();
      await pause(300);
    }
  }
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const canvasDef of CANVASES) {
    for (const scene of SCENES) {
      const context = await browser.newContext({
        viewport: canvasDef.canvas,
        deviceScaleFactor: 1,
        colorScheme: scene.scheme,
        locale: 'ru-RU',
      });
      const page = await context.newPage();

      const url =
        `${TEMPLATE}?src=${encodeURIComponent(GAME_URL)}` +
        `&w=${canvasDef.frame.w}&h=${canvasDef.frame.h}`;
      await page.goto(url, { waitUntil: 'load' });

      await setupScene(page, scene);

      const file = join(OUT, `yandex-${canvasDef.key}-${scene.key}.png`);
      await page.screenshot({ path: file });
      console.log(file);

      await context.close();
    }
  }

  await browser.close();
})().catch((err) => {
  console.error('Не удалось собрать витринные кадры:', err.message);
  process.exit(1);
});
