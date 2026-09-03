import { readLocal, writeLocal } from './base';
import type { IPlatform } from './types';

interface Envelope<T> {
  v: number;
  t: number;
  data: T;
}

/**
 * Сохранение с двумя уровнями: локальная копия пишется всегда и мгновенно,
 * облако площадки — с задержкой (у Яндекса и VK есть лимиты на частоту вызовов).
 *
 * При конфликте выигрывает более свежая по времени запись. Этого достаточно:
 * игрок редко играет с двух устройств одновременно, а сложный merge в
 * казуальных играх не окупается.
 */
export class SaveStore<T extends object> {
  data: T;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly localKey: string;

  constructor(
    private platform: IPlatform,
    private key: string,
    private defaults: T,
    private version = 1,
    private migrate: (old: unknown, fromVersion: number) => T | null = () => null,
    private debounceMs = 1500,
  ) {
    this.data = { ...defaults };
    this.localKey = `studio:${key}`;
  }

  async load(): Promise<T> {
    const local = readLocal<Envelope<T>>(this.localKey);
    const remote = this.platform.caps.cloudSave
      ? await this.platform.storage.load<Envelope<T>>(this.key)
      : null;

    const best = pickFresher(local, remote);
    if (!best) {
      this.data = { ...this.defaults };
      return this.data;
    }

    if (best.v !== this.version) {
      const migrated = this.migrate(best.data, best.v);
      this.data = migrated ? { ...this.defaults, ...migrated } : { ...this.defaults };
    } else {
      this.data = { ...this.defaults, ...best.data };
    }
    return this.data;
  }

  /** Пометить изменение. Локально пишем сразу, в облако — пачкой. */
  markDirty(): void {
    this.dirty = true;
    writeLocal(this.localKey, this.envelope());
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    writeLocal(this.localKey, this.envelope());
    if (this.platform.caps.cloudSave) {
      await this.platform.storage.save(this.key, this.envelope());
    }
  }

  /**
   * Мобильные браузеры не дают надёжного beforeunload — единственная
   * работающая точка сохранения перед закрытием это pagehide/visibilitychange.
   */
  attachAutoFlush(): void {
    const flush = () => void this.flush();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  private envelope(): Envelope<T> {
    return { v: this.version, t: Date.now(), data: this.data };
  }
}

function pickFresher<T>(a: Envelope<T> | null, b: Envelope<T> | null): Envelope<T> | null {
  if (!a) return b;
  if (!b) return a;
  return b.t > a.t ? b : a;
}
