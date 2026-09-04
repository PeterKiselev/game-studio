/**
 * Упаковка сборки игры в ZIP для площадок.
 *
 * На Windows-машине этого проекта нет системного `zip`, а сборки
 * заранее без него не обойдёшься — площадки принимают только ZIP.
 * PowerShell Compress-Archive работает без установки чего-либо.
 *
 * Запуск: node tools/pack.mjs <игра> <платформа>
 * Пример: node tools/pack.mjs gomoku yandex
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [, , game, platform] = process.argv;

if (!game || !platform) {
  console.error('Использование: node tools/pack.mjs <игра> <платформа>');
  process.exit(1);
}

const ROOT = join(import.meta.dirname, '..');
const src = join(ROOT, 'games', game, 'dist', platform);
const outDir = join(ROOT, 'release');
const out = join(outDir, `${game}-${platform}.zip`);

if (!existsSync(src)) {
  console.error(`Нет сборки: ${src}\nСначала: npm run build:${platform}`);
  process.exit(1);
}

// PowerShell Compress-Archive не умеет "содержимое папки" без звёздочки
// и не может перезаписать существующий файл — оба нюанса учтены ниже.
const script = `
  $ErrorActionPreference = 'Stop'
  New-Item -ItemType Directory -Force -Path '${outDir}' | Out-Null
  if (Test-Path '${out}') { Remove-Item '${out}' -Force }
  Compress-Archive -Path '${src}\\*' -DestinationPath '${out}' -CompressionLevel Optimal
`;

execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'inherit' });

const size = statSync(out).size;
console.log(`${out}  ${(size / 1024).toFixed(1)} КБ`);

// Площадки требуют ровно один index.html в архиве — проверяем сразу,
// чтобы не узнавать об ошибке от модератора через несколько дней.
const listScript = `
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead('${out}')
  $zip.Entries | Where-Object { $_.FullName -eq 'index.html' } | Measure-Object | Select-Object -ExpandProperty Count
  $zip.Dispose()
`;
const indexCount = Number(
  execFileSync('powershell.exe', ['-NoProfile', '-Command', listScript]).toString().trim(),
);
if (indexCount !== 1) {
  console.error(`Внимание: в архиве ${indexCount} файлов index.html вместо одного`);
  process.exit(1);
}
