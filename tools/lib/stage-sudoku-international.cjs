/**
 * Общий шаг стейджинга международной сборки «Академии Sudoku» — вынесен
 * сюда из tools/pack-sudoku-international.mjs, потому что повторное
 * ревью Codex 30 сентября 2026 (пункт 3) нашло, что превью-ролики
 * писались с обычного dev-сервера (`games/sudoku/dist/web` без правок),
 * а не с того же HTML, что уходит в ZIP — поэтому в кадре мимолётно
 * мелькал русский текст загрузки («Загружаем…») ещё до того, как
 * подключался JS. Один и тот же стейджинг теперь используют и упаковка
 * ZIP (tools/pack-sudoku-international.mjs), и запись ролика
 * (tools/video-sudoku-international.cjs) — оба показывают ровно то, что
 * увидит игрок площадки, не два разных варианта сборки.
 *
 * .cjs, не .mjs: video-sudoku-international.cjs — обычный require(),
 * а pack-sudoku-international.mjs (ESM) подключает этот файл через
 * createRequire(import.meta.url) — так один модуль читают оба формата.
 */
const { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');

function injectForceEnglish(dist) {
  const path = join(dist, 'index.html');
  const html = readFileSync(path, 'utf8');
  const marker = '<script>window.__SUDOKU_FORCE_LOCALE__="en";</script>';
  if (html.includes(marker)) return;
  if (!html.includes('<head>')) throw new Error('index.html без <head> — не могу подставить умолчание языка');
  writeFileSync(path, html.replace('<head>', `<head>\n    ${marker}`), 'utf8');
}

function anglicizeStaticShell(dist) {
  const path = join(dist, 'index.html');
  let html = readFileSync(path, 'utf8');
  html = html.replace('<html lang="ru">', '<html lang="en">');
  html = html.replace('<title>Академия Sudoku</title>', '<title>Sudoku Academy</title>');
  html = html.replace('<div class="boot">Загружаем…</div>', '<div class="boot">Loading…</div>');
  writeFileSync(path, html, 'utf8');
}

/** BUILD (обычная web-сборка) → DIST (копия без VK/Яндекс-чанков, английская оболочка). */
function stageSudokuInternational(build, dist) {
  if (!existsSync(build)) return false;
  rmSync(dist, { recursive: true, force: true });
  cpSync(build, dist, { recursive: true });
  const assetsDir = join(dist, 'assets');
  for (const f of readdirSync(assetsDir)) {
    if (/^(vk|yandex)\..*\.js$/.test(f)) unlinkSync(join(assetsDir, f));
  }
  injectForceEnglish(dist);
  anglicizeStaticShell(dist);
  return true;
}

module.exports = { stageSudokuInternational };
