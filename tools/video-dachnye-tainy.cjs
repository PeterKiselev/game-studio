/**
 * Запись геймплея «Дачных тайн» для витрин, у которых есть слот под видео
 * (вкладка «Видео» в «Оформлении» у приложений типа «Игра» в VK; Яндекс Игры).
 *
 * Отдельный скрипт от tools/video.cjs — там сценарий гомоку (.menu, «Пять
 * в ряд», ходы по .cell). Здесь свой путь: участок → дело → обучающий
 * диалог → отметки → подсказка → развязка. Playwright пишет WebM,
 * системного ffmpeg на машине нет — берём портативный из ffmpeg-static
 * (стоит глобально, как и playwright, поэтому нужен NODE_PATH).
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/video-dachnye-tainy.cjs [базовый-url]
 *
 * Результат: games/dachnye-tainy/store/video/gameplay-landscape.mp4 (16:9)
 *            games/dachnye-tainy/store/video/gameplay-portrait.mp4  (9:16)
 *
 * Каждая запись — в свежем контексте браузера (пустой localStorage), поэтому
 * обучающий диалог показывается всегда: это и есть «первый запуск» глазами
 * зрителя ролика.
 */

const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readdirSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'https://peterkiselev.github.io/game-studio/dachnye-tainy/';
const OUT = join(__dirname, '..', 'games', 'dachnye-tainy', 'store', 'video');
const TMP = join(OUT, '_raw');

const FFMPEG = require(join(process.env.NODE_PATH ?? '', 'ffmpeg-static'));

const LANDSCAPE = { width: 1280, height: 720 };
const PORTRAIT = { width: 480, height: 854 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Клетка ищется в любом порядке строка/столбец — сетки рисуются по-разному. */
async function clickCell(page, rowLabel, colLabel) {
  const direct = page.locator(`button[aria-label="${rowLabel} — ${colLabel}"]`).first();
  const locator = (await direct.count()) > 0
    ? direct
    : page.locator(`button[aria-label="${colLabel} — ${rowLabel}"]`).first();
  await locator.click();
}

/**
 * Живой отрезок: реальные клики по реальному интерфейсу, не смонтированная
 * анимация. Паузы — чтобы зритель успевал прочитать улику и увидеть, что
 * именно изменилось после клика.
 */
async function recordGameplay(browser, viewport, dir) {
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir, size: viewport },
    colorScheme: 'light',
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.plot');
  await pause(1000); // участок и список дел — зритель понимает, где он

  await page.getByRole('button', { name: /Чей пирог остался в беседке/ }).click();
  // Обучающий диалог: показать, что игра сама объясняет цель и жест ✓/✕.
  const onboarding = page.getByRole('button', { name: 'Понятно, начинаем' });
  try {
    await onboarding.waitFor({ timeout: 2000 });
    await pause(1600); // дать прочитать текст диалога
    await onboarding.click();
  } catch {
    /* диалога нет — контекст не пустой, чего быть не должно, но ролик не ломаем */
  }
  await page.waitForSelector('.case');
  await pause(900); // улики и пустые сетки

  // Половина решения — видно, как автоисключение гасит строку и столбец.
  for (const [row, col] of [
    ['Ирина', 'грядка'],
    ['Михаил', 'беседка'],
    ['Олег', 'калитка'],
  ]) {
    await clickCell(page, row, col);
    await pause(700);
  }

  // Подсказка — главное отличие игры: объясняет шаг, а не открывает ответ.
  await page.locator('.hint-btn').click();
  await pause(1800); // текст подсказки читается, клетка подсвечена

  for (const [row, col] of [
    ['Ирина', 'лейка'],
    ['Михаил', 'пирог'],
    ['Олег', 'зонт'],
  ]) {
    await clickCell(page, row, col);
    await pause(700);
  }

  await page.waitForSelector('.reveal', { timeout: 3000 });
  await pause(2200); // развязка, печать и награда — финальный кадр не обрывается

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
