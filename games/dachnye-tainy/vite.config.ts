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
      // Адрес платёжного сервера для восстановления покупок. Не задан — выключено.
      __PAYMENTS_URL__: JSON.stringify(process.env.VITE_PAYMENTS_URL ?? ''),
      __OK_PAYMENTS_URL__: JSON.stringify(process.env.VITE_OK_PAYMENTS_URL ?? ''),
      // Локальный учёт статистики (этап 1 аналитики): только в тестовой сборке
      // с VITE_LOCAL_STATS=1. Без флага код учёта ничего не делает и не трогает
      // хранилище; сети нет в обоих случаях.
      __LOCAL_STATS__: JSON.stringify(process.env.VITE_LOCAL_STATS === '1'),
      // Маркер тестовой сборки («ТЕСТ ОК · дата · коммит»): задаёт только
      // tools/build-oktest.mjs. Пусто — обычная сборка, маркера нет.
      __TEST_MARKER__: JSON.stringify(process.env.VITE_TEST_MARKER ?? ''),
      // Покупки в ОК включают только явные сборки: oktest --shop или build-ok-candidate.mjs.
      __OK_PAYMENTS__: JSON.stringify(process.env.VITE_OK_PAYMENTS === '1'),
      // Диагностика восстановления в тестовой полосе (tools/build-oktest.mjs --restore-diag).
      __RESTORE_DIAG__: JSON.stringify(process.env.VITE_RESTORE_DIAG === '1'),
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
