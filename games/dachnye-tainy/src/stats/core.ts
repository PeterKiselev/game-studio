/**
 * Локальный учёт статистики, этап 1 (docs/dachnye-tainy-analytics-proposal-2026-10.md).
 * Чистые функции: ни хранилища, ни времени, ни блокировок — их подставляет
 * stats/store.ts. Так правила проверяются юнит-тестами без браузера.
 *
 * Единица счёта — локальный профиль (устройство/браузер с его хранилищем),
 * не человек. Постоянного ID нет. Внешней отправки нет: все события до
 * согласия помечены и никогда не уходят наружу.
 */

export type CaseKind = 'plot' | 'chapter' | 'daily';
export type Primitive = string | number | boolean;

export interface QueuedEvent {
  /** Случайный номер события — для защиты от повторного учёта при будущей доставке. Не связывает разные события. */
  id: string;
  name: StatEvent;
  props: Record<string, Primitive>;
  /** Московская дата, когда событие возникло. */
  day: string;
  /** Возникло до согласия — по правилу §7 не отправляется никогда. На этапе 1 согласия нет. */
  beforeConsent: true;
}

export interface LocalStats {
  v: 1;
  /** Московская дата первого визита этого локального профиля. */
  firstDay: string;
  /** Московская дата предыдущего засчитанного визита. */
  prevVisitDay?: string;
  /** Дела, начатые или раскрытые до включения учёта: в первые старт и раскрытие не попадают. */
  preexisting: string[];
  firstStarted: string[];
  firstCompleted: string[];
  queue: QueuedEvent[];
}

export const QUEUE_LIMIT = 200;

/** Белый список: только эти события и только эти поля. Всё прочее не попадает в очередь. */
export const WHITELIST = {
  visit: ['days_since_first', 'days_since_prev_visit', 'first_day', 'platform', 'build'],
  case_first_start: ['case_id', 'kind'],
  case_first_complete: ['case_id', 'kind', 'stars', 'hints', 'duration', 'step_wrong'],
  case_attempt: ['case_id', 'kind', 'phase'],
  next_case: ['from', 'to'],
  daily_open: ['case_id', 'when', 'ago'],
} as const;

export type StatEvent = keyof typeof WHITELIST;

export interface Env {
  today: string;
  newId: () => string;
}

/** Разница в днях между московскими датами YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Первое включение учёта на этом профиле. Всё, что уже есть в сохранении —
 * раскрытые, начатые, раскрытые дела дня, — помечается «было до учёта»:
 * иначе следующий запуск такого дела засчитался бы как первый.
 */
export function initStats(today: string, alreadyTouched: Iterable<string>): LocalStats {
  return { v: 1, firstDay: today, preexisting: [...new Set(alreadyTouched)].sort(), firstStarted: [], firstCompleted: [], queue: [] };
}

/** Событие в очередь — только по белому списку и с лимитом: старые вытесняются. */
export function enqueue(stats: LocalStats, env: Env, name: string, props: Record<string, unknown>): LocalStats {
  if (!(name in WHITELIST)) return stats;
  const allowed = WHITELIST[name as StatEvent] as readonly string[];
  const clean: Record<string, Primitive> = {};
  for (const key of allowed) {
    const value = props[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') clean[key] = value;
  }
  const event: QueuedEvent = { id: env.newId(), name: name as StatEvent, props: clean, day: env.today, beforeConsent: true };
  const queue = [...stats.queue, event];
  return { ...stats, queue: queue.slice(Math.max(0, queue.length - QUEUE_LIMIT)) };
}

/**
 * Визит — не чаще одного раза за московский день на профиль. Повторный
 * запуск в тот же день ничего не добавляет; две вкладки разводит общая
 * блокировка в store.ts (здесь проверка и запись — одна операция).
 */
export function recordVisit(stats: LocalStats, env: Env, meta: { platform: string; build: string }): LocalStats {
  if (stats.prevVisitDay === env.today) return stats;
  const next = enqueue(stats, env, 'visit', {
    days_since_first: daysBetween(stats.firstDay, env.today),
    days_since_prev_visit: stats.prevVisitDay ? daysBetween(stats.prevVisitDay, env.today) : 0,
    first_day: stats.firstDay,
    platform: meta.platform,
    build: meta.build,
  });
  return { ...next, prevVisitDay: env.today };
}

/** Каждое начало — попытка; первый старт — только для дела, не тронутого до учёта. */
export function recordCaseStart(stats: LocalStats, env: Env, caseId: string, kind: CaseKind): LocalStats {
  let next = enqueue(stats, env, 'case_attempt', { case_id: caseId, kind, phase: 'start' });
  if (!stats.preexisting.includes(caseId) && !stats.firstStarted.includes(caseId)) {
    next = enqueue(next, env, 'case_first_start', { case_id: caseId, kind });
    next = { ...next, firstStarted: [...next.firstStarted, caseId] };
  }
  return next;
}

export interface CompleteDetails {
  stars: number;
  hints: number;
  durationMs: number;
  stepWrong: number;
}

const hintsBucket = (n: number): string => (n >= 3 ? '3+' : String(n));
const stepBucket = (n: number): string => (n >= 2 ? '2+' : String(n));
function durationBucket(ms: number): string {
  const min = ms / 60_000;
  if (min < 2) return '<2';
  if (min < 5) return '2-5';
  if (min < 10) return '5-10';
  return '10+';
}

/**
 * Каждое раскрытие — попытка. Первое раскрытие — только если первый старт
 * этого дела был засчитан: дело, начатое до учёта, не даёт «раскрытия без
 * старта», а повторное раскрытие — второго первого.
 */
export function recordCaseComplete(stats: LocalStats, env: Env, caseId: string, kind: CaseKind, d: CompleteDetails): LocalStats {
  let next = enqueue(stats, env, 'case_attempt', { case_id: caseId, kind, phase: 'complete' });
  if (stats.firstStarted.includes(caseId) && !stats.firstCompleted.includes(caseId)) {
    next = enqueue(next, env, 'case_first_complete', {
      case_id: caseId,
      kind,
      stars: d.stars,
      hints: hintsBucket(d.hints),
      duration: durationBucket(d.durationMs),
      step_wrong: stepBucket(d.stepWrong),
    });
    next = { ...next, firstCompleted: [...next.firstCompleted, caseId] };
  }
  return next;
}

export function recordNextCase(stats: LocalStats, env: Env, from: string, to: string): LocalStats {
  return enqueue(stats, env, 'next_case', { from, to });
}

/** Открытие дела дня: сегодняшнего или прошлого и насколько давнего (корзинами). */
export function recordDailyOpen(stats: LocalStats, env: Env, caseId: string, scheduleDate: string): LocalStats {
  const ago = daysBetween(scheduleDate, env.today);
  return enqueue(stats, env, 'daily_open', {
    case_id: caseId,
    when: ago <= 0 ? 'today' : 'past',
    ...(ago > 0 ? { ago: ago === 1 ? '1' : ago <= 7 ? '2-7' : '8+' } : {}),
  });
}
