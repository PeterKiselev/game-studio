/**
 * Реальная запись геймплея для витрин, требующих видео (Яндекс Игры).
 *
 * Playwright сам умеет писать видео сессии (WebM), а системного ffmpeg
 * на машине нет — используем портативный бинарник из пакета ffmpeg-static,
 * его не нужно ничего "устанавливать" в системном смысле.
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/video.cjs [базовый-url]
 *
 * Результат: static/video/gameplay-landscape.mp4 (десктоп, 16:9)
 *            static/video/gameplay-portrait.mp4  (телефон, 9:16)
 */

const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readdirSync, renameSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'https://peterkiselev.github.io/game-studio/';
const OUT = join(__dirname, '..', 'static', 'video');
const TMP = join(OUT, '_raw');

const FFMPEG = require(join(process.env.NODE_PATH ?? '', 'ffmpeg-static'));

const LANDSCAPE = { width: 1280, height: 720 };
const PORTRAIT = { width: 480, height: 854 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Живой отрезок геймплея: заходим в меню, играем реальную партию с ботом. */
async function recordGameplay(browser, viewport, dir) {
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir, size: viewport },
    colorScheme: 'light',
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.menu');
  await pause(700); // дать зрителю увидеть меню, а не сразу прыгать в игру

  await page.getByRole('button', { name: 'Пять в ряд' }).click();
  await page.waitForSelector('.board');
  await pause(400);

  // Реальные ходы против бота — не заскриптованная анимация, а живая партия.
  const size = 15;
  const centre = Math.floor((size * size) / 2);
  const moves = [
    centre,
    centre - size,
    centre + 1,
    centre - size + 1,
    centre + 2,
    centre - size - 1,
  ];

  for (const index of moves) {
    const cell = page.locator('.cell').nth(index);
    if (await cell.isEnabled()) {
      await cell.click();
      await pause(750); // видно и ход игрока, и ответ бота
    }
  }

  await pause(1200); // финальный кадр задерживается, чтобы ролик не обрывался резко

  await context.close();
}

function findLatestWebm(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('Playwright не сохранил видео: ' + dir);
  return join(dir, files[0]);
}

function toMp4(webm, mp4) {
  execFileSync(FFMPEG, [
    '-y',
    '-i', webm,
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
  const browser = await chromium.launch();

  for (const [label, viewport] of [
    ['landscape', LANDSCAPE],
    ['portrait', PORTRAIT],
  ]) {
    const dir = join(TMP, label);
    mkdirSync(dir, { recursive: true });

    await recordGameplay(browser, viewport, dir);

    const webm = findLatestWebm(dir);
    const mp4 = join(OUT, `gameplay-${label}.mp4`);
    toMp4(webm, mp4);
    console.log(mp4);
  }

  await browser.close();
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
})().catch((err) => {
  console.error('Не удалось записать видео:', err.message);
  process.exit(1);
});
