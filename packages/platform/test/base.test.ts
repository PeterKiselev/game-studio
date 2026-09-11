import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../src/base';

/**
 * Кодекс поймал живьём: VK-сборка «Дачных тайн», открытая вне настоящего
 * VK/OK-окружения, вечно висела на «Загружаем…», потому что
 * `bridge.send('VKWebAppInit')` никогда не решается и не отвергается —
 * try/catch вокруг такого промиса ничего не ловит. withTimeout() — тот
 * самый явный таймаут, который превращает зависание в отказ, на который
 * уже есть обработка (createPlatform() падает обратно на WebPlatform).
 */
describe('withTimeout', () => {
  it('пропускает результат, если промис успел решиться раньше таймаута', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'test');
    expect(result).toBe('ok');
  });

  it('пропускает отказ, если промис отвергся раньше таймаута', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'test')).rejects.toThrow('boom');
  });

  it('отвергается по таймауту, если промис никогда не решается (зависший VKWebAppInit)', async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = new Promise<void>(() => {});
      const result = withTimeout(neverSettles, 8000, 'vk platform init');
      const assertion = expect(result).rejects.toThrow(/timeout after 8000ms/);
      await vi.advanceTimersByTimeAsync(8000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
