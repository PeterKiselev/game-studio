/**
 * Единственный контракт, который видят игры.
 * Никакая игра не импортирует SDK площадки напрямую — только эти типы.
 */

export type PlatformId =
  | 'web'
  | 'yandex'
  | 'vk'
  | 'ok'
  | 'telegram'
  | 'crazygames'
  | 'poki';

/** Что площадка реально умеет. Проверяем перед показом любой кнопки. */
export interface Capabilities {
  banner: boolean;
  interstitial: boolean;
  rewarded: boolean;
  cloudSave: boolean;
  auth: boolean;
  payments: boolean;
  leaderboard: boolean;
  share: boolean;
}

export type AdFailReason =
  | 'unsupported'  // площадка не умеет этот формат
  | 'capped'       // запретила наша политика частоты
  | 'no-fill'      // рекламы не нашлось
  | 'closed'       // игрок закрыл до конца
  | 'error';

export interface AdResult {
  shown: boolean;
  /** true только если игрок досмотрел rewarded и награду можно выдавать */
  rewarded: boolean;
  reason?: AdFailReason;
}

export interface Player {
  id: string | null;
  name: string | null;
  avatar: string | null;
  authorized: boolean;
}

export interface Purchase {
  sku: string;
  ok: boolean;
  token?: string;
}

export interface SharePayload {
  title: string;
  text: string;
  url?: string;
}

export interface AdsApi {
  banner(visible: boolean): Promise<void>;
  interstitial(): Promise<AdResult>;
  rewarded(placement: string): Promise<AdResult>;
}

export interface StorageApi {
  load<T>(key: string): Promise<T | null>;
  save<T>(key: string, value: T): Promise<void>;
}

export interface IPlatform {
  readonly id: PlatformId;
  readonly caps: Capabilities;
  readonly locale: string;
  readonly player: Player;

  /** Поднять SDK площадки. Никогда не бросает — при сбое деградируем до web. */
  init(): Promise<void>;
  /** Убрать лоадер площадки. Вызывать в момент, когда игра реально играбельна. */
  ready(): void;
  /** Яндекс требует помечать активный геймплей; на остальных — no-op. */
  gameplayStart(): void;
  gameplayStop(): void;

  ads: AdsApi;
  storage: StorageApi;

  auth?(): Promise<Player>;
  payments?: { buy(sku: string): Promise<Purchase> };
  leaderboard?: { submit(board: string, score: number): Promise<void> };
  share?(payload: SharePayload): Promise<void>;
}
