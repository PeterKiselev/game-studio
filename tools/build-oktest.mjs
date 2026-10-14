/**
 * Изолированная тестовая сборка «Дачных тайн» для проверки в настоящих
 * Одноклассниках (docs/ok-test-build-2026-10.md).
 *
 * Собирает VK-сборку (тот же адаптер, что для ОК) в отдельную папку
 * games/dachnye-tainy/dist/ok-test с заметным маркером «ТЕСТ ОК · дата · коммит»,
 * закрывает её от поисковиков и записывает version.txt. Ничего не выкладывает,
 * не пушит и не трогает основные сборки и GitHub Pages.
 *
 * Без --shop: платежей нет, магазин в ОК скрыт, как в опубликованной версии.
 * С --shop: отдельная папка dist/ok-test-shop, магазин в ОК с ценой в ОКах.
 * Локальный учёт статистики выключен в обоих режимах.
 *
 * Запуск:
 *   node tools/build-oktest.mjs                 — без магазина (проверка адреса в ОК)
 *   node tools/build-oktest.mjs --shop [--payments-url=https://…oktest…]
 *                                               — с магазином ОК (docs/ok-payments-test-config-2026-10.md)
 *
 * --shop: покупки в ОК включены только в этой сборке (__OK_PAYMENTS__), цена — в ОКах.
 * --payments-url: адрес ТЕСТОВОГО сервера для восстановления покупок из журнала.
 * Без него восстановление выключено (маркер это показывает); боевой адрес не принимается.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shop = args.includes('--shop');
const paymentsUrl = (args.find((a) => a.startsWith('--payments-url=')) ?? '').slice('--payments-url='.length);
if (paymentsUrl) {
  const url = new URL(paymentsUrl);
  // Восстановление в тестовой сборке — только с тестового сервера (PAYMENTS_MODE=test).
  if (url.protocol !== 'https:' || !url.hostname.includes('oktest')) {
    console.error(`Отказ: ${url.origin} — не тестовый сервер (нужен https и «oktest» в имени).`);
    process.exit(1);
  }
  if (!shop) {
    console.error('Отказ: --payments-url имеет смысл только вместе с --shop.');
    process.exit(1);
  }
}

const root = process.cwd();
const game = join(root, 'games', 'dachnye-tainy');
const outName = shop ? 'ok-test-shop' : 'ok-test';
const outDir = join(game, 'dist', outName);

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
// Московская дата, как у дела дня: UTC+3.
const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const marker =
  `ТЕСТ ОК${shop ? ' · МАГАЗИН' : ''} · ${day} · ${commit}${dirty ? '+изм' : ''}` +
  (shop ? ` · восстановление: ${paymentsUrl ? 'вкл' : 'выкл'}` : '');

const env = { ...process.env, VITE_TEST_MARKER: marker };
delete env.VITE_PAYMENTS_URL;
delete env.VITE_LOCAL_STATS;
delete env.VITE_OK_PAYMENTS;
if (shop) env.VITE_OK_PAYMENTS = '1';
if (paymentsUrl) env.VITE_PAYMENTS_URL = paymentsUrl;

execFileSync('npx', ['vite', 'build', '--mode', 'vk', '--outDir', `dist/${outName}`], {
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
if (shop && !paymentsUrl) {
  console.log('Восстановление покупок выключено: адрес тестового сервера не задан (oktest не развёрнут).');
}
