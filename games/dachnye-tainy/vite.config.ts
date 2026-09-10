import { defineConfig } from 'vite';

/** Та же схема, что у gomoku — см. комментарий там. Дублируется намеренно:
 * общий vite.config на игру ломает независимость сборок площадок. */
export default defineConfig(({ mode }) => {
  const platform = mode === 'development' || mode === 'web' ? 'web' : mode;

  return {
    base: './',
    server: {
      port: 5174, // другой порт — может понадобиться крутить обе игры разом
      strictPort: true,
      host: true,
    },
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    build: {
      outDir: `dist/${platform}`,
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 8192,
      cssCodeSplit: false,
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
    },
  };
});
