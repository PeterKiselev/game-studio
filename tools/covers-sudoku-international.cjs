/**
 * Обложки и Poki-thumbnail для международной подачи «Академии Sudoku».
 *
 * Отдельный макет от tools/banner-sudoku.html: тот баннер несёт слоган и
 * список фич — годится для VK-сниппета, но нарушает правило площадок
 * «на обложке только название игры» (docs.crazygames.com/requirements/game-covers/).
 * Poki требует для thumbnail вообще без текста — третий, ещё более
 * строгий вариант того же исходника.
 *
 * Источник — games/sudoku/store/promo/key-art-clean.png: та же генеративная
 * ключевая иллюстрация, что уже используется в VK-витрине
 * (store/promo/key-art.png), но с обрезанным водяным знаком генератора в
 * нижнем левом углу оригинала (см. историю коммита). Использовать
 * оригинал с водяным знаком на публичных обложках было бы нечестно и
 * рискованно для модерации — там могло быть что угодно.
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/covers-sudoku-international.cjs
 */
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const SOURCE = pathToFileURL(join(__dirname, 'covers-sudoku-international.html')).href;
const OUT = join(__dirname, '..', 'games', 'sudoku', 'store', 'international', 'covers');

const TARGETS = [
  { name: 'cover-1920x1080', width: 1920, height: 1080, bodyClass: '' }, // CrazyGames landscape 16:9
  { name: 'cover-800x1200', width: 800, height: 1200, bodyClass: 'narrow' }, // CrazyGames portrait 2:3
  { name: 'cover-800x800', width: 800, height: 800, bodyClass: 'narrow' }, // CrazyGames square 1:1
  { name: 'poki-thumbnail', width: 628, height: 628, bodyClass: 'narrow notext' }, // Poki, full-bleed, без текста
];

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const target of TARGETS) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(SOURCE, { waitUntil: 'load' });
    if (target.bodyClass) await page.evaluate((cls) => { document.body.className = cls; }, target.bodyClass);
    await page.waitForTimeout(150);

    const file = join(OUT, `${target.name}.png`);
    await page.screenshot({ path: file });
    console.log(`${file}  ${target.width}x${target.height}`);
    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error('Не удалось собрать обложки:', err.message);
  process.exit(1);
});
