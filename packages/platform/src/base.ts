import type {
  AdResult, AdsApi, Capabilities, IPlatform, PlatformId, Player, StorageApi,
} from './types';

export const NO_AD: AdResult = { shown: false, rewarded: false, reason: 'unsupported' };

export const NO_CAPS: Capabilities = {
  banner: false,
  interstitial: false,
  rewarded: false,
  cloudSave: false,
  auth: false,
  payments: false,
  leaderboard: false,
  share: false,
};

/** localStorage бросает в приватных окнах и внутри некоторых вебвью — всегда через try. */
export function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* игра обязана продолжать работать без сохранений */
  }
}

/**
 * Дефолтная реализация: всё выключено, сохранения локальные.
 * Адаптер переопределяет только то, что площадка действительно умеет.
 */
export abstract class BasePlatform implements IPlatform {
  abstract readonly id: PlatformId;

  caps: Capabilities = { ...NO_CAPS };
  locale = 'ru';
  player: Player = { id: null, name: null, avatar: null, authorized: false };

  async init(): Promise<void> {}
  ready(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}

  ads: AdsApi = {
    banner: async () => {},
    interstitial: async () => NO_AD,
    rewarded: async () => NO_AD,
  };

  storage: StorageApi = {
    load: async <T>(key: string) => readLocal<T>(key),
    save: async <T>(key: string, value: T) => writeLocal(key, value),
  };
}

/** Загрузка внешнего SDK с таймаутом: зависший скрипт не должен вешать игру. */
export function loadScript(src: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('sdk timeout: ' + src)), timeoutMs);
    el.src = src;
    el.async = true;
    el.onload = () => { clearTimeout(timer); resolve(); };
    el.onerror = () => { clearTimeout(timer); reject(new Error('sdk failed: ' + src)); };
    document.head.appendChild(el);
  });
}
