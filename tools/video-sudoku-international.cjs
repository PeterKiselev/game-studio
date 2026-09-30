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
 * === Повторное ревью Codex 30 сентября 2026 нашло рваные кадры на стыке ===
 *
 * Portrait-ролик на 1,659с и 1,860с (около границы заставка/геймплей на
 * 1,5с) показывал вертикально разорванные/сдвинутые кадры при обычном
 * воспроизведении — не артефакт перемотки, воспроизводится стабильно.
 * Причина: `concat`-фильтр требует монотонно растущих таймстампов от
 * каждого входа, а `-loop 1 -t 1.5 -i cover.png` и записанный Playwright
 * `.webm` начинают PTS не с нуля независимо друг от друга. Без явного
 * `setpts=PTS-STARTPTS` на обоих входах декодер стыкует кадры по чужим
 * таймстампам, из-за чего энкодер иногда обсчитывает межкадровую
 * интерполяц/выравнивание по кадру, которого фактически ещё/уже нет —
 * это и есть визуальный разрыв. Добавлено `setpts=PTS-STARTPTS` в оба
 * плеча фильтра ниже; проверено автоматической выборкой нескольких
 * кадров вокруг стыка (не только frame 0), см.
 * tools/pack-sudoku-international.mjs, раздел «Превью-ролики».
 *
 * === Повторное ревью Codex 30 сентября 2026, ещё одна находка (не в списке
 * блокеров, но всплыла при проверке предыдущих трёх) ===
 *
 * Ролик писался с обычного `npm run dev`/preview-сервера — то есть с
 * той же сборки, что открыта на GitHub Pages, с русской HTML-оболочкой
 * по умолчанию (`<html lang="ru">`, «Загружаем…» до того, как отработает
 * JS). `?lang=en` в URL переключает язык уже ПОСЛЕ маунта — сам этот
 * самый первый кадр загрузки успевал попасть в запись и по SSIM-проверке
 * стыка (см. tools/pack-sudoku-international.mjs) выглядел как «разрыв»:
 * не битый кадр, а честный короткий русский флэш экрана загрузки.
 * Исправление — записывать ролик с того же самого уже упакованного и
 * англизированного HTML, что уходит в ZIP (tools/lib/stage-sudoku-international.cjs),
 * а не с отдельной dev-сборки: свой статический сервер над `release/_international-stage`
 * вместо внешнего `http://127.0.0.1:4176/`.
 *
 * === Первое ревью Codex 30 сентября 2026 нашло два дефекта, оба исправлены здесь ===
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
 * Запуск (сначала собрать сборку, дальше скрипт сам стейджит и поднимает
 * сервер под упакованный HTML):
 *   npm run build -w @studio/sudoku -- --mode web
 *   node tools/video-sudoku-international.cjs [базовый-url — необязательно, для ручной отладки против другого сервера]
 *
 * ffmpeg-static и playwright — обычные devDependencies этого репозитория
 * (package.json), обычный require() находит их сам после `npm install`,
 * без NODE_PATH — см. пункт 2 ревью Codex 30 сентября 2026 выше.
 */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readdirSync, rmSync, existsSync, statSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createServer } = require('node:http');
const { stageSudokuInternational } = require('./lib/stage-sudoku-international.cjs');

const EXPLICIT_BASE = process.argv[2];
const BUILD = join(__dirname, '..', 'games', 'sudoku', 'dist', 'web');
const DIST = join(__dirname, '..', 'release', '_international-stage');
const OUT = join(__dirname, '..', 'games', 'sudoku', 'store', 'international', 'videos');
const COVERS = join(__dirname, '..', 'games', 'sudoku', 'store', 'international', 'covers');
const TMP = join(OUT, '_raw');

const FFMPEG = require('ffmpeg-static');

/** Тот же статический сервер-заглушка, что и в tools/pack-sudoku-international.mjs — сервит уже упакованный (англизированный) HTML, не dev-сборку. */
function serveDirOnce(dir, port) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const server = createServer((req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') path = '/index.html';
    const file = join(dir, path);
    let body;
    try {
      body = readFileSync(file);
    } catch {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = Object.keys(mime).find((e) => file.endsWith(e));
    res.writeHead(200, { 'Content-Type': mime[ext] ?? 'application/octet-stream' });
    res.end(body);
  });
  server.listen(port, '127.0.0.1');
  return server;
}

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
async function recordGameplay(context, base) {
  const page = await context.newPage();
  // Упакованный DIST уже англизирован (window.__SUDOKU_FORCE_LOCALE__ + сам
  // HTML) сам по себе, но ?lang=en оставлен — при ручном запуске с
  // EXPLICIT_BASE (обычная dev-сборка) он всё ещё нужен.
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}lang=en`, { waitUntil: 'networkidle' });
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
    `[0:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=disable,fps=${FPS},format=yuv420p,setsar=1[v0];` +
    `[1:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=disable,fps=${FPS},format=yuv420p,setsar=1[v1];` +
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

  let server = null;
  let base = EXPLICIT_BASE;
  if (!base) {
    if (!stageSudokuInternational(BUILD, DIST)) {
      throw new Error(`нет сборки ${BUILD} — сначала npm run build -w @studio/sudoku -- --mode web`);
    }
    const PORT = 4882;
    server = serveDirOnce(DIST, PORT);
    base = `http://127.0.0.1:${PORT}/`;
  }

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

    await recordGameplay(context, base);
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
  if (server) server.close();
})().catch((err) => {
  console.error('Не удалось записать ролик:', err.message);
  process.exit(1);
});
