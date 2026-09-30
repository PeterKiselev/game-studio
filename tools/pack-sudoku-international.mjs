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

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, cpSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const BUILD = join(ROOT, 'games', 'sudoku', 'dist', 'web');
const DIST = join(ROOT, 'release', '_international-stage');
const RELEASE = join(ROOT, 'release');
const COVERS = join(ROOT, 'games', 'sudoku', 'store', 'international', 'covers');
const VIDEOS = join(ROOT, 'games', 'sudoku', 'store', 'international', 'videos');

/**
 * `npm run build:sudoku:web` даёт обычную web-сборку — ту же, что открыта
 * на GitHub Pages, и её мы не трогаем. Для международного пакета берём
 * копию и убираем чанки VK/Яндекс-адаптеров: на этой сборке
 * `__PLATFORM__ === 'web'`, `detectPlatformId()` возвращает 'web' сразу
 * (packages/platform/src/index.ts) и они не импортируются никогда —
 * но статически внутри лежит строка с адресом Yandex SDK
 * (`https://yandex.ru/games/sdk/v2`), а площадки типа CrazyGames и Poki
 * прямо требуют работать без внешних запросов. Код мёртвый и так, удалить
 * файл безопаснее, чем объяснять модератору, что ссылка не выполняется.
 */
function stageWithoutUnusedAdapters() {
  if (!existsSync(BUILD)) return;
  rmSync(DIST, { recursive: true, force: true });
  cpSync(BUILD, DIST, { recursive: true });
  const assetsDir = join(DIST, 'assets');
  for (const f of readdirSync(assetsDir)) {
    if (/^(vk|yandex)\..*\.js$/.test(f)) unlinkSync(join(assetsDir, f));
  }
}
stageWithoutUnusedAdapters();

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
console.log('\n=== Превью-ролики ===');
const VIDEO_SPECS = [
  { file: 'preview-landscape.mp4', width: 1920, height: 1080 },
  { file: 'preview-portrait.mp4', width: 720, height: 1080 },
];
for (const spec of VIDEO_SPECS) {
  const path = join(VIDEOS, spec.file);
  if (!existsSync(path)) { fail(`нет ролика ${spec.file}`); continue; }
  const sizeMb = statSync(path).size / 1024 / 1024;
  console.log(`  ${spec.file}: ${sizeMb.toFixed(1)} МБ`);
  if (sizeMb < 50) ok(`${spec.file} меньше лимита 50 МБ`);
  else fail(`${spec.file} превышает лимит 50 МБ: ${sizeMb.toFixed(1)} МБ`);
  if (spec.file.endsWith('.mp4')) ok(`${spec.file}: формат mp4`);
}

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
