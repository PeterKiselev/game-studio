import type { Case } from '@studio/rules';
import { dailyBath, dailyBeds, dailyFishing, dailyGlasses, dailyJam, dailyWatering, dailyWell } from './cases';

/**
 * Ежедневный режим: одно дело на дату, одно и то же у всех игроков.
 *
 * Граница дня — полночь по Москве. Москва живёт в UTC+3 без перехода на
 * летнее время (с 2014 года), поэтому дата считается сдвигом от UTC, а не
 * через часовой пояс устройства и не через базу поясов браузера: у игрока
 * во Владивостоке и в Калининграде дело дня одно. Если пояс Москвы когда-
 * нибудь поменяется — меняется одна константа.
 *
 * Время берётся с устройства: сервера нет. Переставив часы, игрок увидит
 * дело другой даты раньше срока — для однопользовательской головоломки без
 * наград за серию это не ломает ничего, кроме его собственного сюрприза.
 *
 * Расписание — явный список «дата → дело», а не «день по кругу»: семь дел
 * не выдаются заново как новые. Когда расписание кончается, игра честно
 * говорит, что новых дел пока нет. Пополнение — добавить записи с новыми
 * датами в конец (тест проверяет, что даты не повторяются и идут по порядку,
 * а дела не повторяются).
 */
export const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface DailyEntry {
  /** Московская дата, YYYY-MM-DD. */
  date: string;
  case: Case;
}

export const DAILY_SCHEDULE: readonly DailyEntry[] = [
  { date: '2026-10-14', case: dailyGlasses },
  { date: '2026-10-15', case: dailyWatering },
  { date: '2026-10-16', case: dailyWell },
  { date: '2026-10-17', case: dailyBeds },
  { date: '2026-10-18', case: dailyBath },
  { date: '2026-10-19', case: dailyJam },
  { date: '2026-10-20', case: dailyFishing },
];

/** Сегодняшняя дата по Москве, YYYY-MM-DD — не зависит от пояса устройства. */
export function moscowDate(nowMs: number = Date.now()): string {
  return new Date(nowMs + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

export type DailyState =
  /** На эту дату есть дело. */
  | { kind: 'today'; entry: DailyEntry }
  /** Ежедневный режим ещё не начался. */
  | { kind: 'not-started'; next: DailyEntry }
  /** На сегодня дела нет, но следующее уже запланировано. */
  | { kind: 'gap'; next: DailyEntry }
  /** Расписание кончилось — новых дел пока нет. */
  | { kind: 'exhausted' };

export function dailyState(today: string, schedule: readonly DailyEntry[] = DAILY_SCHEDULE): DailyState {
  const entry = schedule.find((e) => e.date === today);
  if (entry) return { kind: 'today', entry };
  const next = schedule.find((e) => e.date > today);
  if (!next) return { kind: 'exhausted' };
  return schedule.some((e) => e.date < today) ? { kind: 'gap', next } : { kind: 'not-started', next };
}

/**
 * Дела прошедших дат, от новых к старым. Пропущенный день не теряется и не
 * наказывается: его дело можно раскрыть позже. Будущие даты не показываются.
 */
export function pastDailies(today: string, schedule: readonly DailyEntry[] = DAILY_SCHEDULE): DailyEntry[] {
  return schedule.filter((e) => e.date < today).reverse();
}

export function isDailyCase(id: string, schedule: readonly DailyEntry[] = DAILY_SCHEDULE): boolean {
  return schedule.some((e) => e.case.id === id);
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «14 октября» из YYYY-MM-DD — разбор строки, без Date и часовых поясов. */
export function formatDay(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}
