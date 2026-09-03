import { BasePlatform, NO_AD } from '../base';
import type { AdResult, PlatformId, Player, SharePayload } from '../types';

/**
 * VK Mini Apps (Direct Games) — HTML5 внутри ВКонтакте.
 * Не путать с VK Play: та площадка про PC-каталог и облачный гейминг.
 * Тот же адаптер подходит для Одноклассников — там тоже vk-bridge.
 */
export class VkPlatform extends BasePlatform {
  readonly id: PlatformId = 'vk';
  private bridge: any = null;

  override async init(): Promise<void> {
    const mod: any = await import('@vkontakte/vk-bridge');
    this.bridge = mod.default ?? mod;
    await this.bridge.send('VKWebAppInit');

    const params = new URLSearchParams(location.search);
    this.locale = params.get('vk_language') ?? 'ru';

    this.caps = {
      banner: false, // у VK нет sticky-баннера, только полноэкранные форматы
      interstitial: await this.hasAd('interstitial'),
      rewarded: await this.hasAd('reward'),
      cloudSave: true,
      auth: true,
      payments: true,
      leaderboard: false,
      share: true,
    };

    try {
      const u = await this.bridge.send('VKWebAppGetUserInfo');
      this.player = {
        id: String(u.id),
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
        avatar: u.photo_100 ?? null,
        authorized: true,
      };
    } catch {
      /* игрок мог запретить доступ — продолжаем анонимно */
    }

    this.ads = {
      banner: async () => {},
      interstitial: () => this.showAd('interstitial'),
      rewarded: () => this.showAd('reward'),
    };

    this.storage = {
      load: async <T>(key: string) => {
        try {
          const res = await this.bridge.send('VKWebAppStorageGet', { keys: [key] });
          const raw = res?.keys?.[0]?.value;
          return raw ? (JSON.parse(raw) as T) : null;
        } catch {
          return null;
        }
      },
      save: async <T>(key: string, value: T) => {
        try {
          await this.bridge.send('VKWebAppStorageSet', {
            key,
            value: JSON.stringify(value),
          });
        } catch {
          /* лимит хранилища VK — 1000 ключей, значение до 4096 символов */
        }
      },
    };
  }

  private async hasAd(format: 'interstitial' | 'reward'): Promise<boolean> {
    try {
      const res = await this.bridge.send('VKWebAppCheckNativeAds', { ad_format: format });
      return !!res?.result;
    } catch {
      return false;
    }
  }

  private async showAd(format: 'interstitial' | 'reward'): Promise<AdResult> {
    try {
      const res = await this.bridge.send('VKWebAppShowNativeAds', { ad_format: format });
      const shown = !!res?.result;
      return {
        shown,
        rewarded: format === 'reward' && shown,
        reason: shown ? undefined : 'no-fill',
      };
    } catch {
      return { ...NO_AD, reason: 'error' };
    }
  }

  async auth(): Promise<Player> {
    return this.player;
  }

  payments = {
    buy: async (sku: string) => {
      try {
        const res = await this.bridge.send('VKWebAppShowOrderBox', { type: 'item', item: sku });
        return { sku, ok: !!res?.success };
      } catch {
        return { sku, ok: false };
      }
    },
  };

  async share(payload: SharePayload): Promise<void> {
    try {
      await this.bridge.send('VKWebAppShare', { link: payload.url ?? location.href });
    } catch {
      /* игрок отменил шеринг */
    }
  }
}

export default VkPlatform;
