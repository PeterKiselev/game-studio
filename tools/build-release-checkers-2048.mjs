// Run from the development repository. No game sources are changed.
import { build } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const tsconfigRaw = JSON.parse(await readFile('tsconfig.json', 'utf8'));
for (const game of ['checkers', '2048']) {
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
