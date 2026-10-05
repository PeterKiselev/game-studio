import { defineConfig } from 'vite';

/**
 * Локальный прототип: собственный порт и собственная папка сборки, ничего
 * общего с публикуемыми играми. В Pages workflow не подключён.
 */
export default defineConfig({
  base: './',
  server: {
    port: 5177, // gomoku=5173, dachnye-tainy=5174, pograniche=5175, sudoku=5176
    strictPort: true,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
