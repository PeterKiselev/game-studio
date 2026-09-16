import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const platform = mode === 'development' || mode === 'web' ? 'web' : mode;
  return {
    base: './',
    server: { port: 5175, strictPort: true, host: true },
    define: { __PLATFORM__: JSON.stringify(platform) },
    build: {
      outDir: `dist/${platform}`,
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 8192,
      cssCodeSplit: false,
      reportCompressedSize: true,
      rollupOptions: { output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      } },
    },
  };
});
