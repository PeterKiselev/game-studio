/**
 * Немые превью-ролики «Академии Sudoku» для CrazyGames Basic Launch.
 *
 * Отдельный файл от tools/video.cjs (тот ролик — под Яндекс Игры, играет
 * ботом в гомоку и не подходит по формату: другая игра, другое разрешение,
 * другие требования к первому кадру).
 *
 * Указанные размеры (1920×1080 landscape, 720×1080 portrait 2:3) — из
 * официальных требований CrazyGames, проверены Codex 30 сентября 2026 и
 * подтверждены повторно в этом заходе (docs.crazygames.com/requirements/game-covers/:
 * «both landscape (1080p, 16:9) and portrait (1080p, 2:3) versions»).
 *
 * === Ревью Codex 30 сентября 2026 нашло два дефекта, оба исправлены здесь ===
 *
 * 1. Первые кадры роликов были белыми/пустыми, а не обложкой. Первая версия
 *    снимала «заставку» отдельной страницей с живым скринкастом (открыть
 *    HTML обложки → подождать → закрыть страницу), а затем склеивала её
 *    .webm с .webm геймплея через демультиплексор `-f concat`. Проблема
 *    была не в подходе, а в реализации: у отдельно записанного видео
 *    первые кадры códec'а действительно недоопределены (Chromium начинает
 *    писать WebM чуть раньше, чем страница реально прокрашена), и это
 *    видно только при покадровом просмотре, не на глаз при первом обзоре.
 *    Исправление — не «подождать подольше», а убрать саму запись живой
 *    страницы для заставки: заставка теперь рендерится напрямую из уже
 *    готового PNG обложки через `ffmpeg -loop 1 -i cover.png`, тем самым
 *    первый кадр ролика побитово тот же материал, что и статичная обложка.
 *
 * 2. Геймплей практики показывал ошибки игрока: скрипт вслепую вводил
 *    цифры 4/7/2 в первые свободные клетки, что на реальном пазле почти
 *    всегда даёт конфликт (красная подсветка, растущий счётчик Mistakes).
 *    Для витрины это не «настоящий геймплей», а реклама провала.
 *    Исправление — практика тоже играется через кнопку подсказки
 *    (`.hint-btn`), как и урок: подсказка по построению всегда даёт
 *    доказанно верный ход, конфликтов не бывает в принципе.
 *
 * Запуск:
 *   NODE_PATH="$(npm root -g)" node tools/video-sudoku-international.cjs [базовый-url]
 */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readdirSync, rmSync, existsSync, statSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.argv[2] || 'http://127.0.0.1:4176/';
const OUT = join(__dirname, '..', 'games', 'sudoku', 'store', 'international', 'videos');
const COVERS = join(__dirname, '..', 'games', 'sudoku', 'store', 'international', 'covers');
const TMP = join(OUT, '_raw');

const FFMPEG = require(join(process.env.NODE_PATH ?? '', 'ffmpeg-static'));

const LANDSCAPE = { label: 'landscape', width: 1920, height: 1080, cover: join(COVERS, 'cover-1920x1080.png') };
const PORTRAIT = { label: 'portrait', width: 720, height: 1080, cover: join(COVERS, 'cover-800x1200.png') };
const COVER_HOLD_S = 1.5;
const FPS = 25;
const MAX_MB = 50;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Реальный геймплей: меню → урок за один клик → решение → практика.
 * Обе задачи решаются через кнопку подсказки — доказанно верные ходы,
 * без единого конфликта или ошибки на экране (см. пункт 2 выше).
 */
async function recordGameplay(context) {
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

  // Практика — второй самостоятельный режим, не только курс. Играется
  // подсказками: каждый ход доказуемо верен, ошибок на экране не будет.
  await page.locator('.difficulty-card').first().click();
  await page.waitForSelector('.puzzle');
  await pause(1000);
  for (let i = 0; i < 3; i += 1) {
    const hintBtn = page.locator('.hint-btn');
    if ((await hintBtn.count()) === 0) break;
    await hintBtn.click();
    await pause(900); // видно, как заполняется клетка и меняется объяснение
  }
  await pause(2500);

  await page.close();
}

function findGameplayWebm(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.webm'));
  if (files.length !== 1) throw new Error(`ожидался один .webm геймплея, найдено ${files.length}: ` + dir);
  return join(dir, files[0]);
}

/**
 * Заставка + геймплей — одним вызовом ffmpeg через `concat`-фильтр, а не
 * склейкой готовых контейнеров через `-f concat`. Фильтр decode’ит оба
 * входа и нормализует масштаб/fps/цветовой формат ПЕРЕД склейкой, поэтому
 * не зависит от того, совпадают ли параметры кодеков между «картинкой» и
 * «живой записью» — то самое рассогласование и дало битый кадр на стыке
 * в прошлой версии.
 */
function buildVideo({ label, width, height, cover }, gameplayWebm, outMp4) {
  const filter =
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=disable,fps=${FPS},format=yuv420p,setsar=1[v0];` +
    `[1:v]scale=${width}:${height}:force_original_aspect_ratio=disable,fps=${FPS},format=yuv420p,setsar=1[v1];` +
    `[v0][v1]concat=n=2:v=1:a=0[outv]`;

  execFileSync(FFMPEG, [
    '-y',
    '-loop', '1', '-t', String(COVER_HOLD_S), '-i', cover,
    '-i', gameplayWebm,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-an', // немой ролик — требование площадки
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outMp4,
  ]);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();

  for (const spec of [LANDSCAPE, PORTRAIT]) {
    if (!existsSync(spec.cover)) {
      throw new Error(`нет обложки ${spec.cover} — сначала node tools/covers-sudoku-international.cjs`);
    }

    const dir = join(TMP, spec.label);
    mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      recordVideo: { dir, size: { width: spec.width, height: spec.height } },
      colorScheme: 'light',
      locale: 'en-US',
    });

    await recordGameplay(context);
    await context.close();

    const gameplayWebm = findGameplayWebm(dir);
    const mp4 = join(OUT, `preview-${spec.label}.mp4`);
    buildVideo(spec, gameplayWebm, mp4);

    const sizeMb = statSync(mp4).size / 1024 / 1024;
    console.log(`${mp4}  ${spec.width}x${spec.height}  ${sizeMb.toFixed(1)} MB`);
    if (sizeMb > MAX_MB) {
      console.error(`ПРЕВЫШЕН лимит площадки ${MAX_MB} MB: ${mp4}`);
      process.exitCode = 1;
    }
  }

  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
})().catch((err) => {
  console.error('Не удалось записать ролик:', err.message);
  process.exit(1);
});
