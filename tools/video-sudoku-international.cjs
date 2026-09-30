/**
 * Немые превью-ролики «Академии Sudoku» для CrazyGames Basic Launch.
 *
 * Отдельный файл от tools/video.cjs (тот ролик — под Яндекс Игры, играет
 * ботом в гомоку и не подходит по формату: другая игра, другое разрешение,
 * другие требования к первому кадру).
 *
 * Требование площадки (docs.crazygames.com/requirements/game-covers/):
 * ролик должен начинаться с той же статичной обложки, что уже загружена
 * отдельным файлом — это даёт бесшовный переход обложка→видео на витрине.
 * Поэтому первые кадры — реально обложка (screenshot той же HTML-заготовки,
 * что рендерит tools/covers-sudoku-international.cjs), и только затем
 * начинается запись настоящего интерфейса игры.
 *
 * Указанные размеры (1920×1080 landscape, 720×1080 portrait 2:3) — из
 * официальных требований CrazyGames, проверены Codex 30 сентября 2026 и
 * подтверждены повторно в этом заходе (docs.crazygames.com/requirements/game-covers/:
 * «both landscape (1080p, 16:9) and portrait (1080p, 2:3) versions»).
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/video-sudoku-international.cjs [базовый-url]
 */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readdirSync, renameSync, rmSync, existsSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const BASE = process.argv[2] || 'http://127.0.0.1:4176/';
const OUT = join(__dirname, '..', 'games', 'sudoku', 'store', 'international', 'videos');
const TMP = join(OUT, '_raw');
const COVER_HTML = pathToFileURL(join(__dirname, 'covers-sudoku-international.html')).href;

const FFMPEG = require(join(process.env.NODE_PATH ?? '', 'ffmpeg-static'));

const LANDSCAPE = { width: 1920, height: 1080, coverClass: '' };
const PORTRAIT = { width: 720, height: 1080, coverClass: 'narrow' };
const COVER_HOLD_MS = 1500;
const MAX_MB = 50;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Первые кадры ролика — статичная обложка, снятая тем же макетом, что даёт PNG-обложку. */
async function recordCoverHold(context, viewport, coverClass) {
  const page = await context.newPage();
  await page.goto(COVER_HTML, { waitUntil: 'load' });
  if (coverClass) await page.evaluate((cls) => { document.body.className = cls; }, coverClass);
  await pause(COVER_HOLD_MS);
  await page.close();
}

/** Реальный геймплей: меню → урок за один клик → решение → практика. Не анимация, настоящий интерфейс. */
async function recordGameplay(context, viewport) {
  const page = await context.newPage();
  await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.menu');
  await pause(2000); // дать зрителю увидеть меню курса, а не сразу прыгать в урок

  await page.locator('.academy-card').click();
  await page.waitForSelector('.academy-lesson');
  await pause(2500); // время прочитать объяснение приёма

  const explanation = await page.locator('.lesson-feedback').innerText();
  const cells = [...explanation.matchAll(/row (\d+), column (\d+)\)/g)];
  const value = explanation.match(/can only be (\d+)/);
  if (cells.length && value) {
    const target = cells[cells.length - 1];
    const index = (Number(target[1]) - 1) * 9 + Number(target[2]) - 1;
    await page.locator('.sudoku-cell').nth(index).click();
    await pause(400);
    await page.locator('.digit-btn', { hasText: String(value[1]) }).click();
    await pause(2500); // задержаться на «Correct» и открывшейся кнопке перехода
  }

  await page.locator('.academy-lesson .topbar .btn').click();
  await page.waitForSelector('.academy');
  await pause(900);
  await page.locator('.topbar .btn').click();
  await page.waitForSelector('.menu');
  await pause(800);

  // Показываем и практику — второй самостоятельный режим, не только курс.
  await page.locator('.difficulty-card').first().click();
  await page.waitForSelector('.puzzle');
  await pause(1000);
  const empties = page.locator('.sudoku-cell:not(.given)');
  for (const [i, digit] of [[0, '4'], [1, '7'], [2, '2']]) {
    const cell = empties.nth(i);
    if (await cell.count()) {
      await cell.click();
      await page.locator('.digit-btn', { hasText: digit }).click();
      await pause(650);
    }
  }
  await pause(3000);

  await page.close();
}

function findLatestWebm(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('Playwright не сохранил видео: ' + dir);
  // Playwright пишет по одному файлу на страницу — их два (обложка, геймплей),
  // сортировка по времени изменения даёт правильный порядок склейки.
  return files
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

function concatToMp4(webmFiles, mp4, viewport) {
  const listFile = join(TMP, `${viewport.width}x${viewport.height}.txt`);
  require('node:fs').writeFileSync(listFile, webmFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync(FFMPEG, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-an', // немой ролик — требование площадки
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    mp4,
  ]);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();

  for (const [label, viewport] of [
    ['landscape', LANDSCAPE],
    ['portrait', PORTRAIT],
  ]) {
    const dir = join(TMP, label);
    mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({
      viewport,
      recordVideo: { dir, size: viewport },
      colorScheme: 'light',
      locale: 'en-US',
    });

    await recordCoverHold(context, viewport, viewport.coverClass);
    await recordGameplay(context, viewport);
    await context.close();

    const webmFiles = findLatestWebm(dir);
    const mp4 = join(OUT, `preview-${label}.mp4`);
    concatToMp4(webmFiles, mp4, viewport);

    const sizeMb = statSync(mp4).size / 1024 / 1024;
    console.log(`${mp4}  ${viewport.width}x${viewport.height}  ${sizeMb.toFixed(1)} MB`);
    if (sizeMb > MAX_MB) {
      console.error(`ПРЕВЫШЕН лимит площадки ${MAX_MB} MB: ${mp4}`);
      process.exitCode = 1;
    }
  }

  await browser.close();
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
})().catch((err) => {
  console.error('Не удалось записать ролик:', err.message);
  process.exit(1);
});
