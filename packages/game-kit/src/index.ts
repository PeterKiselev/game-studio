import { AdManager, SaveStore, createPlatform } from '@studio/platform';
import type { AdPolicyConfig, IPlatform } from '@studio/platform';
import { initTheme } from '@studio/ui';
import { track } from './analytics';
import type { TrackedEvent } from './analytics';

export interface BootOptions<T extends object> {
  /** Ключ сохранения. Один на игру, не менять после релиза. */
  gameId: string;
  saveVersion?: number;
  defaults: T;
  adPolicy?: Partial<AdPolicyConfig>;
  migrate?: (old: unknown, fromVersion: number) => T | null;
}

/**
 * Общий каркас запуска. Каждая игра начинается с одной строки:
 *
 *   const app = await GameApp.boot({ gameId: 'gomoku', defaults: { ... } });
 *
 * Здесь собрано всё, что легко забыть в отдельной игре: порядок вызова
 * ready(), пометка геймплея, автосохранение перед закрытием вкладки,
 * пауза на время рекламы, единая тема.
 */
export class GameApp<T extends object> {
  private constructor(
    readonly platform: IPlatform,
    readonly save: SaveStore<T>,
    readonly ads: AdManager,
  ) {}

  static async boot<T extends object>(opts: BootOptions<T>): Promise<GameApp<T>> {
    initTheme();

    const platform = await createPlatform();
    const save = new SaveStore<T>(
      platform,
      opts.gameId,
      opts.defaults,
      opts.saveVersion ?? 1,
      opts.migrate,
    );
    await save.load();
    save.attachAutoFlush();

    const ads = new AdManager(platform, opts.adPolicy);
    return new GameApp(platform, save, ads);
  }

  /**
   * Сообщить площадке, что игра готова. Вызывать в момент, когда экран
   * уже отрисован и по нему можно кликать, — не раньше: Яндекс считает
   * время до ready() как время загрузки и учитывает его в качестве игры.
   */
  ready(): void {
    this.platform.ready();
  }

  startRound(): void {
    this.platform.gameplayStart();
  }

  /**
   * Конец партии: сохраняем, считаем раунд для политики рекламы
   * и по возможности показываем interstitial — но только если политика разрешит.
   */
  async endRound(): Promise<void> {
    this.ads.roundFinished();
    this.platform.gameplayStop();
    await this.save.flush();
  }

  /**
   * Игрок бросил партию на середине — не результат, а отказ от игры.
   * Останавливаем геймплей и сохраняем, как при обычном завершении,
   * но НЕ засчитываем это в счётчик раундов для политики рекламы:
   * незаконченная попытка — не «партия», а её отсутствие. Настоящее
   * завершение по-прежнему идёт через endRound().
   */
  async abandonRound(): Promise<void> {
    this.platform.gameplayStop();
    await this.save.flush();
  }

  /** Предложение «посмотри рекламу — получи бонус». true, если награду выдаём. */
  async offerReward(placement: string): Promise<boolean> {
    const result = await this.ads.rewarded(placement);
    return result.rewarded;
  }

  /** Событие продукта: начал дело, поставил отметку, взял подсказку, ошибся. */
  track(name: string, props?: TrackedEvent['props']): void {
    track(name, props);
  }
}

export { AdManager, SaveStore } from '@studio/platform';
export type { AdPolicyConfig, IPlatform } from '@studio/platform';
export { track, trackedEvents } from './analytics';
export type { TrackedEvent } from './analytics';
