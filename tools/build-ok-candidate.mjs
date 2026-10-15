/** Ordinary-looking OK review candidate. Builds locally; never publishes or enables live payments. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const game = join(root, 'games/dachnye-tainy');
const out = join(game, 'dist/ok-candidate');
const server = 'https://dachnye-tainy-payments-ok.kiselevpetr3.workers.dev';
execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', game,
  '--mode', 'vk', '--outDir', 'dist/ok-candidate'], {
  cwd: root, stdio: 'inherit', env: { ...process.env,
    VITE_TEST_MARKER: '', VITE_RESTORE_DIAG: '0', VITE_LOCAL_STATS: '0',
    VITE_OK_PAYMENTS: '1', VITE_PAYMENTS_URL: '', VITE_OK_PAYMENTS_URL: server },
});
const scripts = readdirSync(join(out, 'assets')).filter(name => name.endsWith('.js'))
  .map(name => readFileSync(join(out, 'assets', name), 'utf8')).join('\n');
for (const text of ['ТЕСТ ОК', 'Тест: подсказки', 'Сравнить ID профиля']) {
  if (scripts.includes(text)) throw new Error('Diagnostic code leaked into candidate: ' + text);
}
if (!scripts.includes(server)) throw new Error('OK journal server missing');
const index = join(out, 'index.html');
writeFileSync(index, readFileSync(index, 'utf8').replace('<meta charset="utf-8" />',
  '<meta charset="utf-8" />\n    <meta name="robots" content="noindex, nofollow" />'));
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('OK candidate ready: ' + out + '\nNo marker or repeat-purchase buttons. Server mode is not changed.');
