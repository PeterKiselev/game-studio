import { BasePlatform, NO_AD, loadScript } from '../base';
import type { AdResult, PlatformId } from '../types';

const SDK_URL = 'https://yandex.ru/games/sdk/v2';

/* SDK приходит глобалом, типов у него нет — держим any строго в этом файле. */
declare const YaGames: { init(): Promise<any> };

export class YandexPlatform extends BasePlatform {
  readonly id: PlatformId = 'yandex';
  private sdk: any = null;
  private ysdkPlayer: any = null;

  override async init(): Promise<void> {
    await loadScript(SDK_URL);
    this.sdk = await YaGames.init();
    this.locale = this.sdk?.environment?.i18n?.lang ?? 'ru';

    this.caps = {
      banner: true,
      interstitial: true,
      rewarded: true,
      cloudSave: true,
      auth: true,
      payments: false, // включим, когда заведём каталог товаров в консоли
      leaderboard: true,
      share: false,
    };

    // scopes:false — не показываем окно авторизации, работаем с анонимным профилем
    try {
      this.ysdkPlayer = await this.sdk.getPlayer({ scopes: false });
      this.player = {
        id: this.ysdkPlayer.getUniqueID() || null,
        name: this.ysdkPlayer.getName() || null,
        avatar: this.ysdkPlayer.getPhoto ? this.ysdkPlayer.getPhoto('medium') : null,
        authorized: this.ysdkPlayer.getMode ? this.ysdkPlayer.getMode() !== 'lite' : false,
      };
    } catch {
      this.caps.cloudSave = false;
    }

    this.ads = {
      banner: async (visible: boolean) => {
        try {
          if (visible) await this.sdk.adv.showBannerAdv();
          else await this.sdk.adv.hideBannerAdv();
        } catch {
          /* баннер не критичен — молча продолжаем */
        }
      },

      interstitial: () =>
        new Promise<AdResult>((resolve) => {
          try {
            this.sdk.adv.showFullscreenAdv({
              callbacks: {
                onClose: (wasShown: boolean) =>
                  resolve({
                    shown: !!wasShown,
                    rewarded: false,
                    reason: wasShown ? undefined : 'no-fill',
                  }),
                onError: () => resolve({ ...NO_AD, reason: 'error' }),
              },
            });
          } catch {
            resolve({ ...NO_AD, reason: 'error' });
          }
        }),

      rewarded: (_placement: string) =>
        new Promise<AdResult>((resolve) => {
          let granted = false;
          try {
            this.sdk.adv.showRewardedVideo({
              callbacks: {
                onRewarded: () => {
                  granted = true;
                },
                onClose: () =>
                  resolve({
                    shown: true,
                    rewarded: granted,
                    reason: granted ? undefined : 'closed',
                  }),
                onError: () => resolve({ ...NO_AD, reason: 'error' }),
              },
            });
          } catch {
            resolve({ ...NO_AD, reason: 'error' });
          }
        }),
    };

    if (this.caps.cloudSave) {
      this.storage = {
        load: async <T>(key: string) => {
          try {
            const data = await this.ysdkPlayer.getData([key]);
            return (data && data[key] !== undefined ? (data[key] as T) : null);
          } catch {
            return null;
          }
        },
        save: async <T>(key: string, value: T) => {
          try {
            await this.ysdkPlayer.setData({ [key]: value }, false);
          } catch {
            /* облако недоступно — локальная копия уже записана SaveStore */
          }
        },
      };
    }
  }

  override ready(): void {
    try {
      this.sdk?.features?.LoadingAPI?.ready();
    } catch {
      /* SDK мог не подняться */
    }
  }

  override gameplayStart(): void {
    try {
      this.sdk?.features?.GameplayAPI?.start();
    } catch {
      /* */
    }
  }

  override gameplayStop(): void {
    try {
      this.sdk?.features?.GameplayAPI?.stop();
    } catch {
      /* */
    }
  }

  leaderboard = {
    submit: async (board: string, score: number) => {
      try {
        const lb = await this.sdk?.getLeaderboards?.();
        await lb?.setLeaderboardScore(board, score);
      } catch {
        /* лидерборд может быть ещё не создан в консоли разработчика */
      }
    },
  };
}

export default YandexPlatform;
