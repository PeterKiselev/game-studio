import { defineConfig } from 'vitest/config';

// Интеграционные тесты с настоящим Durable Object в локальном workerd.
// Не входят в корневой `npm test` (там нет зависимостей services/payments);
// запуск: `npm run test:int` в services/payments.
export default defineConfig({
  test: {
    include: ['test-int/**/*.int.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
