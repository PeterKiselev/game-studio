/**
 * Промо-баннер для витрин площадок.
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/banner.cjs
 *
 * Рендерит tools/banner.html в PNG нужных размеров. Размеры площадок
 * добавляются одной строкой в SIZES — макет резиновый и подстраивается.
 */

const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const SOURCE = pathToFileURL(join(__dirname, 'banner.html')).href;
const OUT = join(__dirname, '..', 'static', 'promo');

const SIZES = [
  { name: 'snippet-1120x630', width: 1120, height: 630 }, // большой сниппет VK
  { name: 'promo-1590x400', width: 1590, height: 400 }, // широкая шапка про запас
  { name: 'cover-800x470', width: 800, height: 470 }, // обложка Яндекс Игр
];

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      locale: 'ru-RU',
    });
    const page = await context.newPage();
    await page.goto(SOURCE, { waitUntil: 'load' });
    await page.waitForTimeout(300); // даём шрифтам примениться
    const file = join(OUT, `${size.name}.png`);
    await page.screenshot({ path: file });
    console.log(`${file}  ${size.width}x${size.height}`);
    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error('Не удалось собрать баннер:', err.message);
  process.exit(1);
});
