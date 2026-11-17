// Run from the development repository. No game sources are changed.
import { build } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const hash = b => createHash('sha256').update(b).digest('hex');
async function sourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else files.push({ path: path.replaceAll('\\', '/'), sha256: hash(await readFile(path)) });
  }
  return files.sort((a,b) => a.path.localeCompare(b.path));
}
async function snapshot() {
  const files = [];
  for (const root of ['games/solitaire/src','packages/rules/src','packages/ui/src','packages/platform/src','packages/game-kit/src']) files.push(...await sourceFiles(root));
  return files;
}
const before = await snapshot();
const tsconfigRaw = JSON.parse(await readFile('tsconfig.json', 'utf8'));
for (const game of ['solitaire']) {
  for (const mode of ['web', 'vk']) {
    // Equivalent to each game's vite.config.ts; avoids native esbuild config
    // discovery traversing inaccessible Windows profile ancestors in the sandbox.
    await build({
      configFile: false, root: resolve('games', game), base: './', mode,
      define: { __PLATFORM__: JSON.stringify(mode) },
      resolve: { preserveSymlinks: true },
      esbuild: { tsconfigRaw },
      build: { outDir: `dist/${mode}`, target: 'es2020' },
    });
  }
}
if (JSON.stringify(await snapshot()) !== JSON.stringify(before)) throw new Error('Source changed during build; rebuild required');
await writeFile('games/solitaire/dist/build-source.json', JSON.stringify({
  sourceHead: execFileSync('git', ['rev-parse','HEAD'], { encoding:'utf8' }).trim(),
  sourceFiles: before, sourceUnchangedDuringBuild: true,
}, null, 2) + '\n');
