import type { IPlatform, PlatformId } from './types';
import { withTimeout } from './base';

export * from './types';
export { AdManager, DEFAULT_AD_POLICY } from './ads-policy';
export type { AdPolicyConfig } from './ads-policy';
export { SaveStore } from './storage';
export { BasePlatform, NO_AD, NO_CAPS, readLocal, writeLocal, loadScript, withTimeout } from './base';

/**
 * Инициализация площадки может зависнуть не только из-за упавшего скрипта
 * (это уже покрыто таймаутом внутри loadScript у Яндекса) — переписка
 * с VK/OK через vk-bridge (VKWebAppInit) тоже может никогда не получить
 * ответ, например если игра открыта не в настоящем VK-окружении или сеть
 * площадки не поднялась. Без явного таймаута зависший init() навечно
 * держит игру на экране загрузки — try/catch ниже не спасает, потому что
 * промис, который никогда не решается, не бросает исключение сам по себе.
 */
const PLATFORM_INIT_TIMEOUT_MS = 8000;

/** Подставляется Vite на этапе сборки: --mode yandex даёт 'yandex'. */
declare const __PLATFORM__: PlatformId | undefined;

export function detectPlatformId(): PlatformId {
  if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__) return __PLATFORM__;

  // Резервное определение по окружению — на случай запуска без нашей сборки.
  const href = location.href;
  if (href.includes('vk_app_id')) return 'vk';
  if (href.includes('yandex') || 'YaGames' in window) return 'yandex';
  return 'web';
}

/**
 * Динамический импорт адаптера — так в бандл Яндекса не попадает vk-bridge,
 * и наоборот. Один код, разные сборки, ничего лишнего.
 */
export async function createPlatform(id: PlatformId = detectPlatformId()): Promise<IPlatform> {
  let platform: IPlatform;

  switch (id) {
    case 'yandex':
      platform = new (await import('./adapters/yandex')).YandexPlatform();
      break;
    case 'vk':
    case 'ok':
      platform = new (await import('./adapters/vk')).VkPlatform();
      break;
    default:
      platform = new (await import('./adapters/web')).WebPlatform();
  }

  try {
    await withTimeout(platform.init(), PLATFORM_INIT_TIMEOUT_MS, `${id} platform init`);
  } catch (err) {
    // Площадка не поднялась (упала или зависла дольше таймаута) — игра
    // обязана запуститься всё равно, просто без рекламы и облачных
    // сохранений. Бесконечный экран загрузки не считается нормальным
    // исходом ни при каких обстоятельствах, в том числе внутри самой
    // площадки — её сеть тоже может не подняться.
    console.warn('[platform] init failed, fallback to web', err);
    const fallback = new (await import('./adapters/web')).WebPlatform();
    await fallback.init();
    return fallback;
  }

  return platform;
}

