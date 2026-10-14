/**
 * Изолированная тестовая сборка «Дачных тайн» для проверки в настоящих
 * Одноклассниках (docs/ok-test-build-2026-10.md).
 *
 * Собирает VK-сборку (тот же адаптер, что для ОК) в отдельную папку
 * games/dachnye-tainy/dist/ok-test с заметным маркером «ТЕСТ ОК · дата · коммит»,
 * закрывает её от поисковиков и записывает version.txt. Ничего не выкладывает,
 * не пушит и не трогает основные сборки и GitHub Pages.
 *
 * Без платежей: адрес платёжного сервера не задаётся, магазин в ОК скрыт,
 * как в опубликованной версии. Локальный учёт статистики выключен.
 *
 * Запуск: node tools/build-oktest.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const game = join(root, 'games', 'dachnye-tainy');
const outDir = join(game, 'dist', 'ok-test');

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
// Московская дата, как у дела дня: UTC+3.
const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const marker = `ТЕСТ ОК · ${day} · ${commit}${dirty ? '+изм' : ''}`;

const env = { ...process.env, VITE_TEST_MARKER: marker };
delete env.VITE_PAYMENTS_URL;
delete env.VITE_LOCAL_STATS;

execFileSync('npx', ['vite', 'build', '--mode', 'vk', '--outDir', 'dist/ok-test'], {
  cwd: game,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// Тестовая сборка не для поиска: метатег и robots.txt.
const indexPath = join(outDir, 'index.html');
const html = readFileSync(indexPath, 'utf8');
if (!html.includes('name="robots"')) {
  // После charset: кодировка должна быть объявлена первой.
  writeFileSync(indexPath, html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    <meta name="robots" content="noindex, nofollow" />'));
}
writeFileSync(join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(outDir, 'version.txt'), `${marker}\n`);

console.log(`\nГотово: ${outDir}\nМаркер: ${marker}`);
if (dirty) console.log('Внимание: в рабочей копии есть незакоммиченные изменения — в маркере «+изм».');
