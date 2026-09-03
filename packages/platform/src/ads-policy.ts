import type { AdResult, IPlatform } from './types';

/**
 * Политика показа рекламы — главный защитник удержания.
 *
 * Правило студии: interstitial никогда не показывается до того, как игрок
 * получил удовольствие от игры. Rewarded частотой не ограничивается вообще:
 * игрок сам его просит, и каждый показ — чистый плюс к доходу.
 */
export interface AdPolicyConfig {
  /** Не показывать interstitial раньше N секунд с начала сессии. */
  firstAdAfterSeconds: number;
  /** И не раньше, чем игрок закончил N партий. */
  firstAdAfterRounds: number;
  /** Минимальная пауза между полноэкранными показами. */
  minSecondsBetween: number;
  /** Жёсткий потолок на сессию. */
  maxPerSession: number;
}

export const DEFAULT_AD_POLICY: AdPolicyConfig = {
  firstAdAfterSeconds: 90,
  firstAdAfterRounds: 2,
  minSecondsBetween: 180,
  maxPerSession: 8,
};

const BLOCKED: AdResult = { shown: false, rewarded: false, reason: 'capped' };

export class AdManager {
  private cfg: AdPolicyConfig;
  private sessionStart = Date.now();
  private lastShownAt = 0;
  private shownThisSession = 0;
  private roundsFinished = 0;
  private busy = false;

  constructor(
    private platform: IPlatform,
    cfg: Partial<AdPolicyConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_AD_POLICY, ...cfg };
  }

  /** Вызывать в конце каждой партии — политика считает партии, а не минуты. */
  roundFinished(): void {
    this.roundsFinished += 1;
  }

  /** Можно ли вообще предлагать игроку награду за просмотр. */
  get rewardedAvailable(): boolean {
    return this.platform.caps.rewarded;
  }

  private canShowInterstitial(): boolean {
    if (!this.platform.caps.interstitial) return false;
    if (this.shownThisSession >= this.cfg.maxPerSession) return false;
    if (this.roundsFinished < this.cfg.firstAdAfterRounds) return false;

    const now = Date.now();
    if (now - this.sessionStart < this.cfg.firstAdAfterSeconds * 1000) return false;
    if (this.lastShownAt && now - this.lastShownAt < this.cfg.minSecondsBetween * 1000) return false;

    return true;
  }

  /**
   * Полноэкранная реклама между партиями. Показывается только если политика
   * разрешила; во всех остальных случаях молча возвращает reason:'capped'.
   */
  async interstitial(): Promise<AdResult> {
    if (this.busy || !this.canShowInterstitial()) return BLOCKED;
    const result = await this.withGameplayPaused(() => this.platform.ads.interstitial());
    if (result.shown) {
      this.lastShownAt = Date.now();
      this.shownThisSession += 1;
    }
    return result;
  }

  /**
   * Реклама за награду. placement — строка вида 'undo' | 'hint' | 'continue',
   * она уходит в аналитику: по ней видно, какое предложение реально работает.
   */
  async rewarded(placement: string): Promise<AdResult> {
    if (this.busy || !this.platform.caps.rewarded) {
      return { shown: false, rewarded: false, reason: 'unsupported' };
    }
    return this.withGameplayPaused(() => this.platform.ads.rewarded(placement));
  }

  async banner(visible: boolean): Promise<void> {
    if (!this.platform.caps.banner) return;
    await this.platform.ads.banner(visible);
  }

  /**
   * Обязательная обвязка: Яндекс требует останавливать геймплей перед показом,
   * а игра — глушить звук и таймеры. Всё в одном месте, чтобы нельзя было забыть.
   */
  private async withGameplayPaused(run: () => Promise<AdResult>): Promise<AdResult> {
    this.busy = true;
    this.platform.gameplayStop();
    document.dispatchEvent(new CustomEvent('studio:pause'));
    try {
      return await run();
    } finally {
      document.dispatchEvent(new CustomEvent('studio:resume'));
      this.platform.gameplayStart();
      this.busy = false;
    }
  }
}
