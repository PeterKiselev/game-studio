import { describe, expect, it } from 'vitest';
import {
  QUEUE_LIMIT,
  WHITELIST,
  daysBetween,
  enqueue,
  initStats,
  recordCaseComplete,
  recordCaseStart,
  recordDailyOpen,
  recordNextCase,
  recordVisit,
} from '../src/stats/core';
import type { Env, LocalStats } from '../src/stats/core';

let counter = 0;
const env = (today: string): Env => ({ today, newId: () => `id-${(counter += 1)}` });
const meta = { platform: 'web', build: 'test' };
const names = (s: LocalStats) => s.queue.map((e) => e.name);
const done = { stars: 3, hints: 0, lastSessionMs: 90_000, stepWrong: 0 };

describe('визит — не чаще раза в московский день', () => {
  it('первый визит: 0 дней с первого, дата первого визита', () => {
    const s = recordVisit(initStats('2026-10-14', []), env('2026-10-14'), meta);
    expect(names(s)).toEqual(['visit']);
    expect(s.queue[0].props).toEqual({ days_since_first: 0, days_since_prev_visit: 0, first_day: '2026-10-14', platform: 'web', build: 'test' });
  });

  it('повторный запуск в тот же день ничего не добавляет', () => {
    let s = recordVisit(initStats('2026-10-14', []), env('2026-10-14'), meta);
    s = recordVisit(s, env('2026-10-14'), meta);
    s = recordVisit(s, env('2026-10-14'), meta);
    expect(names(s)).toEqual(['visit']);
  });

  it('следующий день и пропуск: дни с первого и с прошлого визита', () => {
    let s = recordVisit(initStats('2026-10-14', []), env('2026-10-14'), meta);
    s = recordVisit(s, env('2026-10-15'), meta);
    s = recordVisit(s, env('2026-10-21'), meta);
    expect(s.queue.map((e) => [e.props.days_since_first, e.props.days_since_prev_visit])).toEqual([[0, 0], [1, 1], [7, 6]]);
  });

  it('разница дат — по календарю, через смену месяца и года', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('первый старт и первое раскрытие', () => {
  it('старт и раскрытие нового дела — по одному первому событию, повторы — только попытки', () => {
    let s = initStats('2026-10-14', []);
    s = recordCaseStart(s, env('2026-10-14'), 'daily-glasses', 'daily');
    s = recordCaseStart(s, env('2026-10-14'), 'daily-glasses', 'daily');
    s = recordCaseComplete(s, env('2026-10-14'), 'daily-glasses', 'daily', done);
    s = recordCaseStart(s, env('2026-10-15'), 'daily-glasses', 'daily');
    s = recordCaseComplete(s, env('2026-10-15'), 'daily-glasses', 'daily', done);
    expect(names(s).filter((n) => n.startsWith('case_first'))).toEqual(['case_first_start', 'case_first_complete']);
    expect(s.queue.filter((e) => e.name === 'case_attempt').map((e) => e.props.phase)).toEqual(['start', 'start', 'complete', 'start', 'complete']);
  });

  it('дело, тронутое до включения учёта, не попадает ни в первый старт, ни в первое раскрытие', () => {
    let s = initStats('2026-10-14', ['tutorial-1', 'third-1']);
    s = recordCaseStart(s, env('2026-10-14'), 'tutorial-1', 'plot');
    s = recordCaseComplete(s, env('2026-10-14'), 'tutorial-1', 'plot', done);
    s = recordCaseComplete(s, env('2026-10-14'), 'third-1', 'plot', done);
    expect(names(s).some((n) => n.startsWith('case_first'))).toBe(false);
    expect(s.firstStarted).toEqual([]);
    expect(s.firstCompleted).toEqual([]);
  });

  it('раскрытие без учтённого первого старта не даёт первого раскрытия', () => {
    const s = recordCaseComplete(initStats('2026-10-14', []), env('2026-10-14'), 'second-1', 'plot', done);
    expect(names(s)).toEqual(['case_attempt']);
  });

  it('поля первого раскрытия — корзинами, без точных чисел', () => {
    let s = recordCaseStart(initStats('2026-10-14', []), env('2026-10-14'), 'ch1-pond', 'chapter');
    s = recordCaseComplete(s, env('2026-10-14'), 'ch1-pond', 'chapter', { stars: 1, hints: 5, lastSessionMs: 7 * 60_000, stepWrong: 3 });
    const ev = s.queue.find((e) => e.name === 'case_first_complete')!;
    expect(ev.props).toEqual({ case_id: 'ch1-pond', kind: 'chapter', stars: 1, hints: '3+', last_session_duration: '5-10', step_wrong: '2+' });
  });
});

describe('белый список и очередь', () => {
  it('неизвестные события и лишние поля не попадают в очередь', () => {
    let s = initStats('2026-10-14', []);
    s = enqueue(s, env('2026-10-14'), 'case_mistake', { caseId: 'x', key: 'персонажи|Майя~место|сарай' });
    s = enqueue(s, env('2026-10-14'), 'next_case', { from: 'a', to: 'b', key: 'ответ', userId: 42 });
    expect(names(s)).toEqual(['next_case']);
    expect(s.queue[0].props).toEqual({ from: 'a', to: 'b' });
  });

  it('у каждого события в очереди — только поля его списка, и все до согласия', () => {
    let s = recordVisit(initStats('2026-10-14', []), env('2026-10-14'), meta);
    s = recordCaseStart(s, env('2026-10-14'), 'daily-well', 'daily');
    s = recordCaseComplete(s, env('2026-10-14'), 'daily-well', 'daily', done);
    s = recordNextCase(s, env('2026-10-14'), 'ch1-hose', 'ch1-key');
    s = recordDailyOpen(s, env('2026-10-20'), 'daily-well', '2026-10-16');
    for (const e of s.queue) {
      expect(Object.keys(e.props).every((k) => (WHITELIST[e.name] as readonly string[]).includes(k)), e.name).toBe(true);
      expect(e.beforeConsent).toBe(true);
    }
    expect(new Set(s.queue.map((e) => e.id)).size).toBe(s.queue.length);
  });

  it('дело дня: сегодня / вчера / 2–7 / 8+ дней назад', () => {
    const at = (today: string) => recordDailyOpen(initStats(today, []), env(today), 'daily-glasses', '2026-10-14').queue[0].props;
    expect(at('2026-10-14')).toEqual({ case_id: 'daily-glasses', when: 'today' });
    expect(at('2026-10-15')).toMatchObject({ when: 'past', ago: '1' });
    expect(at('2026-10-20')).toMatchObject({ when: 'past', ago: '2-7' });
    expect(at('2026-11-01')).toMatchObject({ when: 'past', ago: '8+' });
  });

  it(`очередь не больше ${QUEUE_LIMIT}: старые вытесняются`, () => {
    let s = initStats('2026-10-14', []);
    for (let i = 0; i < QUEUE_LIMIT + 25; i += 1) s = recordNextCase(s, env('2026-10-14'), `from-${i}`, 'to');
    expect(s.queue).toHaveLength(QUEUE_LIMIT);
    expect(s.queue[0].props.from).toBe('from-25');
    expect(s.queue[QUEUE_LIMIT - 1].props.from).toBe(`from-${QUEUE_LIMIT + 24}`);
  });
});
