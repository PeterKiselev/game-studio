/**
 * Упаковка и валидация международных пакетов «Академии Sudoku».
 *
 * Одна и та же English-по-умолчанию web-сборка идёт под двумя именами —
 * `sudoku-crazygames-basic.zip` и `sudoku-poki-playtest.zip`. Это не
 * лень, а следствие явного решения этапа: SDK ни для Basic Launch
 * CrazyGames, ни для первого Playtest Poki не подключаем (см. карточку
 * этапа в WORK_QUEUE.md), значит нет и причины различать содержимое —
 * оба портала получают один и тот же нейтральный билд.
 *
 * Отдельный скрипт от tools/pack.mjs: тот просто зовёт Compress-Archive
 * и проверяет единственность index.html — здесь дополнительно проверяются
 * требования именно международной подачи (без sourcemap/dev-файлов,
 * без внешних запросов, вес обложек/роликов, initial bundle).
 *
 * Запуск:
 *   npm run build -w @studio/sudoku -- --mode web   (один раз, до этого скрипта)
 *   node tools/pack-sudoku-international.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const { stageSudokuInternational } = createRequire(import.meta.url)('./lib/stage-sudoku-international.cjs');

// Повторное ревью Codex 30 сентября 2026: ffmpeg-static раньше был только
// в глобальных пакетах (NODE_PATH среды Claude), поэтому обычная команда
// `node tools/pack-sudoku-international.mjs` после чистого `npm install`
// падала с `Cannot find module 'ffmpeg-static'`. Теперь пакет — обычная
// devDependency этого репозитория (`package.json`), и обычный require()
// находит его сам, без переменных окружения. В ESM нет require() —
// createRequire(import.meta.url) даёт его аналог.
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');

const ROOT = join(import.meta.dirname, '..');
const BUILD = join(ROOT, 'games', 'sudoku', 'dist', 'web');
const DIST = join(ROOT, 'release', '_international-stage');
const RELEASE = join(ROOT, 'release');
const COVERS = join(ROOT, 'games', 'sudoku', 'store', 'international', 'covers');
const VIDEOS = join(ROOT, 'games', 'sudoku', 'store', 'international', 'videos');

/**
 * Стейджинг международной копии — в tools/lib/stage-sudoku-international.cjs, общий
 * с tools/video-sudoku-international.cjs. Раньше эта функция жила только здесь,
 * и ролик писался с обычной (русской по умолчанию) dev-сборки,
 * и в кадре мелькало русское «Загружаем…» — повторное ревью
 * Codex 30 сентября 2026, пункт 3. Теперь оба инструмента показывают один и
 * тот же уже англизированный HTML — точно то, что увидит игрок
 * площадки. Содержимое функции (убрать VK/Яндекс-чанки,
 * подставить window.__SUDOKU_FORCE_LOCALE__, англизировать оболочку)
 * не повторены здесь второй раз — см. комментарий в самом модуле.
 */
stageSudokuInternational(BUILD, DIST);

const issues = [];
const ok = (msg) => console.log('  ok —', msg);
const fail = (msg) => {
  issues.push(msg);
  console.error('  ПРОВАЛ —', msg);
};

function allFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(full, base));
    else out.push(full);
  }
  return out;
}

// --- 1. Сборка: без sourcemap/dev-файлов, ровно один index.html в корне ---
console.log('\n=== Сборка games/sudoku/dist/web ===');
if (!existsSync(DIST)) {
  fail(`нет сборки ${BUILD} — сначала npm run build -w @studio/sudoku -- --mode web`);
} else {
  const files = allFiles(DIST).map((f) => f.slice(DIST.length + 1).replace(/\\/g, '/'));
  if (files.includes('index.html')) ok('index.html лежит в корне сборки');
  else fail('index.html не найден в корне сборки');

  const stray = files.filter((f) => /\.map$|\.ts$|\.tsx$|README/i.test(f));
  if (stray.length === 0) ok('нет sourcemap/README/исходников .ts в сборке');
  else fail('найдены посторонние файлы: ' + stray.join(', '));

  // Требование площадок «без внешних запросов» — проверяем сам код на
  // абсолютные http(s)-ссылки за пределами наших же файлов.
  const jsFiles = files.filter((f) => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css'));
  const external = [];
  for (const rel of jsFiles) {
    const text = readFileSync(join(DIST, rel), 'utf8');
    const matches = text.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
    for (const m of matches) if (!m.includes('peterkiselev.github.io')) external.push(`${rel}: ${m}`);
  }
  if (external.length === 0) ok('нет внешних запросов в коде сборки (кроме наших же ссылок на privacy/terms)');
  else fail('найдены внешние ссылки: ' + external.slice(0, 5).join('; '));

  const totalBytes = files.reduce((sum, rel) => sum + statSync(join(DIST, rel)).size, 0);
  const mainChunk = files
    .filter((f) => f.startsWith('assets/index.') && f.endsWith('.js'))
    .map((f) => ({ f, size: statSync(join(DIST, f)).size }))
    .sort((a, b) => b.size - a.size)[0];

  console.log(`  файлов: ${files.length}, суммарный размер: ${(totalBytes / 1024).toFixed(1)} КБ`);
  if (mainChunk) {
    console.log(`  основной чанк игры: ${mainChunk.f} — ${(mainChunk.size / 1024).toFixed(1)} КБ`);
  }
  if (totalBytes < 20 * 1024 * 1024) ok(`initial bundle меньше ориентира CrazyGames в 20 МБ (${(totalBytes / 1024 / 1024).toFixed(2)} МБ)`);
  else fail(`initial bundle превышает ориентир 20 МБ: ${(totalBytes / 1024 / 1024).toFixed(2)} МБ`);
  if (totalBytes < 50 * 1024 * 1024) ok('initial bundle меньше жёсткого лимита 50 МБ');
  else fail(`initial bundle превышает жёсткий лимит 50 МБ: ${(totalBytes / 1024 / 1024).toFixed(2)} МБ`);
}

// --- 1a. Статическая HTML-оболочка ДО исполнения JavaScript ---
// Повторное ревью Codex 30 сентября 2026, пункт 3: живой браузерный тест
// ниже смотрит на страницу уже после того, как отработал наш JS — он не
// мог поймать то, что видно до этого (сырой HTML, или площадка с
// отключённым/медленным JS). Читаем файл напрямую, без браузера.
console.log('\n=== Статическая HTML-оболочка (до JavaScript) ===');
if (existsSync(DIST)) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  if (html.includes('<html lang="en">')) ok('<html lang="en"> в самом HTML, не только после JS');
  else fail('<html lang="ru"> или другое значение в сыром HTML — площадка увидит русский до JavaScript');

  if (html.includes('<title>Sudoku Academy</title>')) ok('<title>Sudoku Academy</title> в сыром HTML');
  else fail('заголовок страницы в сыром HTML не "Sudoku Academy"');

  if (html.includes('Loading…') && !html.includes('Загружаем…')) ok('текст загрузки в сыром HTML — "Loading…"');
  else fail('текст загрузки в сыром HTML не англизирован (ожидался "Loading…", не "Загружаем…")');
} else {
  fail('нет DIST для проверки статической оболочки — сборка не найдена');
}

// --- 1b. Локаль по умолчанию в упакованном ZIP, живым браузером ---
// Именно то, что поймало ревью Codex: раньше это утверждалось в README,
// но не проверялось. Контекст с locale: 'ru-RU' воспроизводит настоящего
// ru-RU игрока (packages/platform/src/adapters/web.ts берёт язык из
// navigator.language, который Playwright здесь и подставляет).
async function serveDirOnce(dir, port) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const server = createServer((req, res) => {
    // Баг был именно тут: запрос "/?lang=ru" не равен "/" целиком, поэтому
    // условие ниже раньше сравнивало req.url ДО отрезания query — путь
    // "/" после split('?') не подменялся на index.html, и сервер отдавал
    // 404 на сам HTML-документ. Playwright это тихо проглатывал (страница
    // формально "загрузилась" с пустым телом), а html.lang оказывался
    // null — из-за чужого бага в тестовом сервере, а не в игре.
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') path = '/index.html';
    const file = join(dir, path);
    // Файл читаем ДО первого writeHead: если readFileSync бросит (файла
    // нет), заголовки ещё не отправлены и можно честно ответить 404.
    // Другой порядок сам поймал себя — с 200 уже отправленным catch
    // пытался писать 404 повторно и падал ERR_HTTP_HEADERS_SENT.
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
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return () => server.close();
}

console.log('\n=== Локаль по умолчанию в упакованном ZIP (живой браузер) ===');
if (existsSync(DIST)) {
  const PORT = 4881;
  const closeServer = await serveDirOnce(DIST, PORT);
  try {
    const browser = await chromium.launch();

    const bareContext = await browser.newContext({ locale: 'ru-RU' });
    const barePage = await bareContext.newPage();
    await barePage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    const bareLang = await barePage.locator('html').getAttribute('lang');
    const bareTitle = await barePage.title();
    if (bareLang === 'en' && bareTitle === 'Sudoku Academy') {
      ok(`голый URL в контексте ru-RU всё равно даёт английский (<html lang>=${bareLang}, title="${bareTitle}")`);
    } else {
      fail(`голый URL в контексте ru-RU дал <html lang>=${bareLang}, title="${bareTitle}" — должен быть английский`);
    }
    await bareContext.close();

    const ruContext = await browser.newContext({ locale: 'ru-RU' });
    const ruPage = await ruContext.newPage();
    await ruPage.goto(`http://127.0.0.1:${PORT}/?lang=ru`, { waitUntil: 'networkidle' });
    const ruLang = await ruPage.locator('html').getAttribute('lang');
    if (ruLang === 'ru') ok('?lang=ru по-прежнему работает внутри международного ZIP');
    else fail(`?lang=ru дал <html lang>=${ruLang} вместо ru — сломан явный выбор языка`);
    await ruContext.close();

    await browser.close();
  } finally {
    closeServer();
  }
} else {
  fail('нет DIST для проверки локали — сборка не найдена');
}

// --- 2. Упаковка двух ZIP ---
console.log('\n=== Упаковка ===');
mkdirSync(RELEASE, { recursive: true });

function packAs(name) {
  const out = join(RELEASE, `${name}.zip`);
  const script = `
    $ErrorActionPreference = 'Stop'
    if (Test-Path '${out}') { Remove-Item '${out}' -Force }
    Compress-Archive -Path '${DIST}\\*' -DestinationPath '${out}' -CompressionLevel Optimal
  `;
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'inherit' });

  const listScript = `
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead('${out}')
    $names = $zip.Entries | ForEach-Object { $_.FullName }
    $zip.Dispose()
    $names -join "\`n"
  `;
  const entries = execFileSync('powershell.exe', ['-NoProfile', '-Command', listScript]).toString().trim().split(/\r?\n/);
  const indexCount = entries.filter((e) => e === 'index.html').length;
  const size = statSync(out).size;

  console.log(`${out}  ${(size / 1024).toFixed(1)} КБ, ${entries.length} файлов`);
  if (indexCount === 1) ok(`${name}.zip: ровно один index.html в корне`);
  else fail(`${name}.zip: ${indexCount} файлов index.html вместо одного`);
  if (size < 50 * 1024 * 1024) ok(`${name}.zip меньше лимита 50 МБ`);
  else fail(`${name}.zip превышает лимит 50 МБ`);

  return { name, size, entries: entries.length };
}

if (existsSync(DIST)) { packAs('sudoku-crazygames-basic'); packAs('sudoku-poki-playtest'); }

// --- 3. Обложки CrazyGames ---
console.log('\n=== Обложки CrazyGames ===');
const COVER_SPECS = [
  { file: 'cover-1920x1080.png', width: 1920, height: 1080 },
  { file: 'cover-800x1200.png', width: 800, height: 1200 },
  { file: 'cover-800x800.png', width: 800, height: 800 },
];

async function pngSize(path) {
  // Размер PNG читается напрямую из IHDR-чанка (байты 16..24) — не нужен
  // отдельный пакет для проверки того, что и так пишет наш собственный
  // генератор; если формат когда-нибудь сменится на не-PNG, это явно
  // упадёт здесь же, а не пройдёт молча.
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG: ' + path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const spec of COVER_SPECS) {
  const path = join(COVERS, spec.file);
  if (!existsSync(path)) { fail(`нет файла обложки ${spec.file}`); continue; }
  const { width, height } = await pngSize(path);
  if (width === spec.width && height === spec.height) ok(`${spec.file}: ${width}×${height}`);
  else fail(`${spec.file}: ${width}×${height} вместо ${spec.width}×${spec.height}`);
  const kb = statSync(path).size / 1024;
  console.log(`    вес: ${kb.toFixed(0)} КБ`);
}

// --- 4. Poki thumbnail ---
console.log('\n=== Poki thumbnail ===');
{
  const path = join(COVERS, 'poki-thumbnail.png');
  if (!existsSync(path)) {
    fail('нет poki-thumbnail.png');
  } else {
    const { width, height } = await pngSize(path);
    if (width === height) ok(`квадрат ${width}×${height}`);
    else fail(`не квадрат: ${width}×${height}`);
    if (width >= 628 && height >= 628) ok('не меньше минимума 628×628');
    else fail(`меньше минимума 628×628: ${width}×${height}`);
  }
}

// --- 5. Ролики ---
// Ревью Codex 30 сентября 2026: отчёт заявлял разрешение, длительность и
// отсутствие звука, но валидатор проверял только вес и расширение — эти
// свойства никто не сверял автоматически, и битый стык кадров (см.
// tools/video-sudoku-international.cjs) прошёл бы здесь молча. Теперь
// проверяется каждое заявленное свойство, включая первый кадр против
// соответствующей обложки — то есть дефект, который был, здесь бы поймался.
console.log('\n=== Превью-ролики ===');
const VIDEO_TMP = join(RELEASE, '_video-check');
mkdirSync(VIDEO_TMP, { recursive: true });

/**
 * Разбирает вывод ffmpeg по stderr. Намеренно `spawnSync`, не
 * `execFileSync`: у `-i` без выходного файла код выхода ненулевой, и
 * `execFileSync` даёт stderr только через исключение — но у `ssimAgainstCover`
 * ниже (`-f null -`) команда завершается штатно, кодом 0, и та же уловка
 * с `catch` молча ничего не ловит. Первая версия так и потеряла весь вывод
 * SSIM — не «похоже на брак», а форменный провал через `н/д`, который сам
 * себя разоблачил на первом же прогоне. `spawnSync` отдаёт stderr в обоих
 * случаях одинаково, независимо от кода выхода.
 */
function runFfmpeg(args) {
  return spawnSync(FFMPEG, args, { encoding: 'utf8' }).stderr ?? '';
}

function probeVideo(path) {
  const stderr = runFfmpeg(['-i', path]);
  const duration = stderr.match(/Duration: (\d\d):(\d\d):(\d\d\.\d\d)/);
  const durationSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null;
  const video = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  const hasAudio = /Stream #0:1.*Audio/.test(stderr) || /: Audio:/.test(stderr);
  return {
    durationSec,
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
    hasAudio,
  };
}

/** Первый кадр ролика → PNG, тем же ffmpeg, что и вся остальная обработка видео в проекте. */
function extractFirstFrame(videoPath, outPng) {
  execFileSync(FFMPEG, ['-y', '-i', videoPath, '-frames:v', '1', '-update', '1', outPng], { stdio: 'ignore' });
}

/** Кадр в произвольный момент времени → PNG. `-ss` перед `-i` — точная перемотка по timestamp'у, не по ключевым кадрам. */
function extractFrameAt(videoPath, timeSec, outPng) {
  execFileSync(FFMPEG, ['-y', '-ss', String(timeSec), '-i', videoPath, '-frames:v', '1', '-update', '1', outPng], { stdio: 'ignore' });
}

/** SSIM двух PNG одного разрешения — без приведения масштаба, в отличие от ssimAgainstCover. */
function ssimBetween(pngA, pngB) {
  const stderr = runFfmpeg(['-i', pngA, '-i', pngB, '-lavfi', 'ssim', '-f', 'null', '-']);
  const match = stderr.match(/All:([\d.]+)/g);
  if (!match) return null;
  return Number(match[match.length - 1].split(':')[1]);
}

/**
 * Повторное ревью Codex 30 сентября 2026: portrait-ролик на 1,659с и
 * 1,860с показывал вертикально разорванные/сдвинутые кадры при обычном
 * воспроизведении — прежняя проверка смотрела только на frame 0 и
 * закономерно это пропускала. Причина (см. tools/video-sudoku-international.cjs)
 * — отсутствие `setpts=PTS-STARTPTS` перед `concat`; исправлено там,
 * здесь — проверка, что дефект не вернётся незамеченным.
 *
 * Стык заставка/геймплей ровно на 1,5с — сразу после него идёт пауза
 * ~2с на экране меню перед первым кликом (recordGameplay в
 * video-sudoku-international.cjs), то есть контент в окне 1,55–1,95с
 * почти статичен по построению записи, не по совпадению. Битый/сдвинутый
 * кадр внутри этого окна резко отличается от соседних стабильных кадров —
 * SSIM между соседними кадрами в этом окне должен быть высоким везде,
 * не только в среднем. Проверяем каждую соседнюю пару, а не общий разброс,
 * чтобы один испорченный кадр между двумя нормальными не размылся в
 * среднем по сэмплам. Сэмплы начинаются с 1,52с (не с 1,5с ровно) и идут
 * с шагом ~0,06с: первая пара после самого стыка (где кадр закономерно
 * и легитимно меняется — заставка становится геймплеем) — самое частое
 * место дефекта на практике, подтверждено негативным контролем на
 * реальной регрессии без `setpts` (см. HANDOFF.md): там разрыв ловился
 * именно в первой паре после стыка, 0,52–0,56с после начала геймплея,
 * а не только там, где его увидело ревью на своей записи (1,659с/1,860с) —
 * значит частый шаг важнее совпадения с конкретными секундами того прогона.
 */
function checkSeamIntegrity(videoPath, label) {
  const times = [1.52, 1.58, 1.64, 1.70, 1.76, 1.82, 1.88, 1.94, 2.0];
  const frames = times.map((t, i) => {
    const png = join(VIDEO_TMP, `${label}-seam-${i}.png`);
    extractFrameAt(videoPath, t, png);
    return png;
  });
  const pairSsims = [];
  for (let i = 0; i < frames.length - 1; i += 1) {
    pairSsims.push(ssimBetween(frames[i], frames[i + 1]));
  }
  const worst = Math.min(...pairSsims.map((v) => v ?? 0));
  if (pairSsims.every((v) => v !== null) && worst >= 0.95) {
    ok(`${label}: стык заставка/геймплей чист — все соседние кадры в окне 1,55–1,95с согласованы (мин. SSIM ${worst.toFixed(4)})`);
  } else {
    fail(`${label}: разрыв/скачок кадра около стыка — соседние кадры в окне 1,55–1,95с разошлись (SSIM: ${pairSsims.map((v) => v?.toFixed(4) ?? 'н/д').join(', ')})`);
  }
}

/** SSIM первого кадра против обложки, приведённой к его разрешению. 1.0 — идентичны, площадкам этого не объяснить словами — только числом. */
function ssimAgainstCover(framePng, coverPng, width, height) {
  const stderr = runFfmpeg([
    '-i', framePng,
    '-i', coverPng,
    '-lavfi', `[1:v]scale=${width}:${height}[cov];[0:v][cov]ssim`,
    '-f', 'null', '-',
  ]);
  const match = stderr.match(/All:([\d.]+)/g);
  if (!match) return null;
  return Number(match[match.length - 1].split(':')[1]); // последнее значение — итог по всему сравнению
}

const VIDEO_SPECS = [
  {
    file: 'preview-landscape.mp4',
    width: 1920,
    height: 1080,
    cover: join(COVERS, 'cover-1920x1080.png'),
  },
  {
    file: 'preview-portrait.mp4',
    width: 720,
    height: 1080,
    cover: join(COVERS, 'cover-800x1200.png'), // обложка 800×1200 (2:3), видео 720×1080 (тот же 2:3) — сравнение со скейлом внутри ssimAgainstCover
  },
];

for (const spec of VIDEO_SPECS) {
  const path = join(VIDEOS, spec.file);
  if (!existsSync(path)) { fail(`нет ролика ${spec.file}`); continue; }

  const sizeMb = statSync(path).size / 1024 / 1024;
  console.log(`  ${spec.file}: ${sizeMb.toFixed(1)} МБ`);
  if (sizeMb < 50) ok(`${spec.file} меньше лимита 50 МБ`);
  else fail(`${spec.file} превышает лимит 50 МБ: ${sizeMb.toFixed(1)} МБ`);

  const info = probeVideo(path);
  if (info.width === spec.width && info.height === spec.height) ok(`${spec.file}: разрешение ${info.width}×${info.height}`);
  else fail(`${spec.file}: разрешение ${info.width}×${info.height} вместо ${spec.width}×${spec.height}`);

  if (info.durationSec !== null && info.durationSec >= 15 && info.durationSec <= 20) {
    ok(`${spec.file}: длительность ${info.durationSec.toFixed(2)}с — в требуемом окне 15–20с`);
  } else {
    fail(`${spec.file}: длительность ${info.durationSec} вне окна 15–20с`);
  }

  if (!info.hasAudio) ok(`${spec.file}: без звука`);
  else fail(`${spec.file}: обнаружена аудиодорожка — ролик должен быть немым`);

  const framePng = join(VIDEO_TMP, spec.file.replace('.mp4', '-frame0.png'));
  extractFirstFrame(path, framePng);
  const ssim = ssimAgainstCover(framePng, spec.cover, spec.width, spec.height);
  // Порог 0.97, не 1.0: первый кадр перекодирован через h264 (libx264,
  // crf 20) из исходного PNG, а не побитовая копия — небольшие потери
  // сжатия неизбежны и не значат, что кадр «другой». Именно этот порог
  // и поймал бы прежний дефект: там на 0–0.6с шёл белый/пустой кадр, а не
  // обложка, SSIM был бы далёк от единицы.
  if (ssim !== null && ssim >= 0.97) {
    ok(`${spec.file}: первый кадр совпадает с обложкой (SSIM ${ssim.toFixed(4)})`);
  } else {
    fail(`${spec.file}: первый кадр НЕ совпадает с обложкой (SSIM ${ssim ?? 'н/д'})`);
  }

  checkSeamIntegrity(path, spec.file);
}
rmSync(VIDEO_TMP, { recursive: true, force: true });

// Временная копия сборки без неиспользуемых адаптеров нужна была только
// для упаковки/проверки — в release/ остаются только два ZIP.
rmSync(DIST, { recursive: true, force: true });

// --- Итог ---
console.log('\n' + '='.repeat(60));
if (issues.length === 0) {
  console.log('ВСЕ ПРОВЕРКИ ПРОШЛИ');
} else {
  console.error(`ПРОВАЛОВ: ${issues.length}`);
  for (const i of issues) console.error(' - ' + i);
  process.exitCode = 1;
}
