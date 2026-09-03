import { defineConfig } from 'vite';

/**
 * Одна конфигурация на все площадки.
 *   npm run dev              — режим development, платформа web
 *   npm run build:yandex     — --mode yandex, в бандл попадает только SDK Яндекса
 *   npm run build:vk         — --mode vk
 *
 * __PLATFORM__ подставляется на этапе сборки. Адаптеры площадок лежат в
 * отдельных ленивых чанках: на Яндексе vk-bridge не скачивается вообще,
 * и наоборот — в первый чанк попадает только нужный SDK.
 */
export default defineConfig(({ mode }) => {
  const platform = mode === 'development' || mode === 'web' ? 'web' : mode;

  return {
    base: './', // площадки раздают игру из вложенной папки — только относительные пути
    server: {
      // Порт фиксирован: его же слушает vk-tunnel, иначе адрес туннеля протухает
      // при каждом перезапуске. host:true — чтобы туннель достучался до сервера.
      port: 5173,
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
