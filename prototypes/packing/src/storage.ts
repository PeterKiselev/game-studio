/**
 * Локальное хранение прототипа: только завершённые заказы и журнал событий
 * для наблюдения. Никаких сетевых запросов и персональных данных.
 */

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'packing-proto:save:v1';
export const LOG_KEY = 'packing-proto:log:v1';
const LOG_LIMIT = 500;

/** Читает сохранение; любое повреждение даёт пустой результат, а не исключение. */
export function loadCompleted(kv: KV | null, validIds: readonly string[]): string[] {
  if (!kv) return [];
  try {
    const raw = kv.getItem(SAVE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return [];
    const completed = (data as { completed?: unknown }).completed;
    if (!Array.isArray(completed)) return [];
    const valid = new Set(validIds);
    const out: string[] = [];
    for (const id of completed) {
      if (typeof id === 'string' && valid.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCompleted(kv: KV | null, completed: readonly string[]): void {
  if (!kv) return;
  try {
    kv.setItem(SAVE_KEY, JSON.stringify({ v: 1, completed }));
  } catch {
    /* приватное окно или переполнение — прогресс просто не сохранится */
  }
}

export type LogEventName = 'order_start' | 'first_place' | 'order_complete' | 'order_reset' | 'next_order';

export interface LogEvent {
  /** Миллисекунды от открытия страницы. */
  t: number;
  e: LogEventName;
  order: string;
}

export function readLog(kv: KV | null): LogEvent[] {
  if (!kv) return [];
  try {
    const raw = kv.getItem(LOG_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is LogEvent =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as LogEvent).t === 'number' &&
        typeof (item as LogEvent).e === 'string' &&
        typeof (item as LogEvent).order === 'string',
    );
  } catch {
    return [];
  }
}

export function appendLog(kv: KV | null, event: LogEvent): void {
  if (!kv) return;
  try {
    const log = readLog(kv);
    log.push(event);
    kv.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_LIMIT)));
  } catch {
    /* журнал — вспомогательный, его потеря не должна ломать игру */
  }
}
