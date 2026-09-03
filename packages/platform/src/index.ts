import type { IPlatform, PlatformId } from './types';

export * from './types';
export { AdManager, DEFAULT_AD_POLICY } from './ads-policy';
export type { AdPolicyConfig } from './ads-policy';
export { SaveStore } from './storage';
export { BasePlatform, NO_AD, NO_CAPS, readLocal, writeLocal, loadScript } from './base';

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
    await platform.init();
  } catch (err) {
    // Площадка не поднялась — игра обязана запуститься всё равно, просто без рекламы.
    console.warn('[platform] init failed, fallback to web', err);
    const fallback = new (await import('./adapters/web')).WebPlatform();
    await fallback.init();
    return fallback;
  }

  return platform;
}

