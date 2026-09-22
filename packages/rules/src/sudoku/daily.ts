import type { Difficulty } from './types';

/**
 * Сложность дня — чистая функция от даты, без обращения к системному
 * времени внутри: цикл фиксирован по дню недели, чтобы одна и та же дата
 * всегда давала одну и ту же сложность, сколько бы раз игрок её ни открыл.
 * Понедельник — лёгкий день специально: неделя начинается мягко.
 */
const WEEKLY_CYCLE: readonly Difficulty[] = ['easy', 'medium', 'hard', 'medium', 'easy', 'medium', 'hard'];

export function dailySeed(isoDate: string): string {
  return `daily:${isoDate}`;
}

/** isoDate — YYYY-MM-DD. Разбирается как UTC-полночь, чтобы не зависеть от часового пояса устройства. */
export function difficultyForDate(isoDate: string): Difficulty {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0=вс..6=сб
  const mondayFirst = (day + 6) % 7; // 0=пн..6=вс
  return WEEKLY_CYCLE[mondayFirst];
}

/**
 * Сегодняшняя дата в ISO по ЛОКАЛЬНОМУ времени устройства — нарочно, а не
 * UTC: игрок ждёт новый ежедневный пазл в полночь по своим часам, не по
 * Гринвичу. Единственное, ради чего эта функция не полностью чистая
 * (берёт Date.now() по умолчанию) — вызывающий код должен передавать
 * date явно в тестах, чтобы не зависеть от реального времени прогона.
 */
export function todayIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
