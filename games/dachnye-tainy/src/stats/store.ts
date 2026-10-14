import type { Env, LocalStats } from './core';
import { initStats } from './core';

/**
 * Хранилище локального учёта: один ключ localStorage, вне игрового
 * сохранения (то может уехать в облако платформы на другое устройство).
 *
 * Все изменения — визиты, первые старты/раскрытия, очередь — идут через одну
 * общую блокировку браузера (navigator.locks): прочитать, изменить, записать
 * — одна операция, две вкладки не перетрут друг друга и не засчитают визит
 * дважды. Если блокировки нет, учёт выключается целиком: метка с паузой
 * гонку не исключает, а неверные числа хуже их отсутствия. Игра при этом
 * работает как обычно — учёт никогда не бросает ошибок наружу.
 *
 * Сети здесь нет: события лежат в очереди с пометкой «до согласия» и
 * никуда не отправляются.
 */

declare const __LOCAL_STATS__: boolean;

export const STATS_KEY = 'studio:dachnye-tainy:local-stats';
const LOCK_NAME = 'studio:dachnye-tainy:local-stats';

/** Учёт включён: тестовая сборка и есть блокировка. Иначе — ни одного обращения к хранилищу. */
export function statsEnabled(): boolean {
  return __LOCAL_STATS__ && typeof navigator !== 'undefined' && !!navigator.locks?.request;
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Изменить статистику под общей блокировкой. alreadyTouched — дела, тронутые
 * до включения учёта (нужны только при самом первом создании записи).
 */
export async function updateStats(
  today: string,
  alreadyTouched: () => Iterable<string>,
  change: (stats: LocalStats, env: Env) => LocalStats,
): Promise<void> {
  if (!statsEnabled()) return;
  try {
    await navigator.locks.request(LOCK_NAME, async () => {
      const raw = localStorage.getItem(STATS_KEY);
      const current: LocalStats = raw ? (JSON.parse(raw) as LocalStats) : initStats(today, alreadyTouched());
      // Только для браузерного теста гонки двух вкладок: расширяет окно между
      // чтением и записью, чтобы без блокировки гонка проявлялась, а не
      // проскакивала. Код есть лишь в тестовой сборке со статистикой.
      const testDelay = (globalThis as { __statsTestDelayMs?: number }).__statsTestDelayMs;
      if (testDelay) await new Promise((resolve) => setTimeout(resolve, testDelay));
      const next = change(current, { today, newId });
      localStorage.setItem(STATS_KEY, JSON.stringify(next));
    });
  } catch {
    // Учёт — второстепенен: ошибка хранилища не должна мешать игре.
  }
}
