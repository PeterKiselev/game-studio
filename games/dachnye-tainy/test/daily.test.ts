import { describe, expect, it } from 'vitest';
import { countSolutions, deduceCase, formatIssues, markKey, nextHint, uniqueSolution, validateCase } from '@studio/rules';
import type { Case, PlayerMarks } from '@studio/rules';
import { PLOT_CASE_IDS, cases } from '../src/cases';
import { DAILY_SCHEDULE, dailyState, formatDay, isDailyCase, moscowDate, pastDailies } from '../src/daily/schedule';
import type { DailyEntry } from '../src/daily/schedule';

const dailies = DAILY_SCHEDULE.map((e) => e.case);

describe('граница дня — полночь по Москве', () => {
  it('23:59:59 МСК — ещё 14-е, 00:00 МСК — уже 15-е', () => {
    expect(moscowDate(Date.parse('2026-10-14T20:59:59Z'))).toBe('2026-10-14');
    expect(moscowDate(Date.parse('2026-10-14T21:00:00Z'))).toBe('2026-10-15');
  });

  it('не зависит от пояса устройства: один момент — одна дата', () => {
    // 2026-10-15 01:30 во Владивостоке (UTC+10) и 2026-10-14 18:30 по Гринвичу — один и тот же момент.
    const moment = Date.parse('2026-10-15T01:30:00+10:00');
    expect(moscowDate(moment)).toBe('2026-10-14');
  });

  it('дата по-русски без часовых поясов', () => {
    expect(formatDay('2026-10-14')).toBe('14 октября');
    expect(formatDay('2027-01-01')).toBe('1 января');
  });
});

describe('расписание: одно дело на дату, без повторов по кругу', () => {
  it('семь дел, даты по порядку без повторов, дела не повторяются', () => {
    expect(DAILY_SCHEDULE).toHaveLength(7);
    const dates = DAILY_SCHEDULE.map((e) => e.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const ids = dailies.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id дел дня не пересекаются с делами участка и главы', () => {
    for (const id of dailies.map((c) => c.id)) {
      expect(cases.some((c) => c.id === id)).toBe(false);
      expect(isDailyCase(id)).toBe(true);
    }
    for (const c of cases) expect(isDailyCase(c.id)).toBe(false);
    expect(PLOT_CASE_IDS.some((id) => isDailyCase(id))).toBe(false);
  });

  it('на дату расписания — её дело; до начала — «начнутся», после конца — «новых нет»', () => {
    expect(dailyState('2026-10-14')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-glasses' } } });
    expect(dailyState('2026-10-20')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-fishing' } } });
    expect(dailyState('2026-10-13')).toMatchObject({ kind: 'not-started', next: { date: '2026-10-14' } });
    expect(dailyState('2026-10-21')).toEqual({ kind: 'exhausted' });
    expect(dailyState('2027-03-01')).toEqual({ kind: 'exhausted' });
  });

  it('после конца расписания старые дела не выдаются как новые', () => {
    const later = ['2026-10-21', '2026-10-28', '2026-11-04'];
    for (const date of later) expect(dailyState(date).kind).toBe('exhausted');
  });

  it('пропуск в расписании — честное «сегодня дела нет, следующее…»', () => {
    const withGap: DailyEntry[] = [DAILY_SCHEDULE[0], { ...DAILY_SCHEDULE[1], date: '2026-10-17' }];
    expect(dailyState('2026-10-15', withGap)).toMatchObject({ kind: 'gap', next: { date: '2026-10-17' } });
  });

  it('пополнение: новые записи продолжают расписание, прошлые остаются доступны', () => {
    const extended: DailyEntry[] = [...DAILY_SCHEDULE, { date: '2026-10-25', case: { ...dailies[0], id: 'daily-next' } }];
    expect(dailyState('2026-10-25', extended)).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-next' } } });
    expect(dailyState('2026-10-22', extended)).toMatchObject({ kind: 'gap', next: { date: '2026-10-25' } });
  });

  it('прошлые дела — только прошедших дат, от новых к старым; будущих нет', () => {
    expect(pastDailies('2026-10-14')).toEqual([]);
    expect(pastDailies('2026-10-16').map((e) => e.date)).toEqual(['2026-10-15', '2026-10-14']);
    expect(pastDailies('2026-10-30')).toHaveLength(7);
  });
});

describe('семь дел дня: корректны и разные по ходу рассуждения', () => {
  it.each(dailies.map((c) => [c.id, c] as const))('%s: валидно, решение единственное, решается рассуждением', (_id, source) => {
    const issues = validateCase(source);
    expect(issues, formatIssues(source, issues)).toEqual([]);
    expect(countSolutions(source)).toBe(1);
    expect(deduceCase(source).solved).toBe(true);
  });

  /** Факт нужен, если без него решений больше одного или путь уже не объяснить подсказками. */
  it.each(dailies.map((c) => [c.id, c] as const))('%s: ни один факт не лишний', (_id, source) => {
    source.clues.forEach((_, i) => {
      const without = { ...source, clues: source.clues.filter((__, j) => j !== i) };
      const needed = countSolutions(without) !== 1 || !deduceCase(without).solved;
      expect(needed, `факт ${i + 1} лишний: ${source.clues[i].text}`).toBe(true);
    });
  });

  it.each(dailies.map((c) => [c.id, c] as const))('%s: подсказки доводят до конца', (_id, source) => {
    const marks: PlayerMarks = {};
    for (let guard = 0; guard < 400; guard += 1) {
      const hint = nextHint(source, marks);
      if (!hint) break;
      expect(hint.text.length).toBeGreaterThan(10);
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }
    expect(nextHint(source, marks)).toBeNull();
    const n = source.categories[0].values.length;
    const k = source.categories.length;
    expect(Object.keys(marks)).toHaveLength(((k * (k - 1)) / 2) * n * n);
  });

  /**
   * Профиль хода рассуждения: размер, число категорий, есть ли порядок и
   * какие виды улик. Два дела с одинаковым профилем отличались бы только
   * именами — так быть не должно.
   */
  const profile = (c: Case): string => {
    const kinds = [...new Set(c.clues.map((x) => x.kind))].sort().join('+');
    const ordered = c.categories.some((x) => x.ordered) ? 'порядок' : 'без порядка';
    return `${c.categories[0].values.length}×${c.categories.length} ${ordered} ${kinds}`;
  };

  it('профили всех семи дел разные', () => {
    const profiles = dailies.map(profile);
    expect(new Set(profiles).size, profiles.join('\n')).toBe(7);
  });

  it('у каждого дела свой ход рассуждения', () => {
    const rules = (c: Case) => new Set(deduceCase(c).steps.map((s) => s.reason.rule));
    const byId = Object.fromEntries(dailies.map((c) => [c.id, c]));
    // Исключение: только «не» и «последний вариант», без порядка и переноса.
    expect(byId['daily-watering'].clues.every((c) => c.kind === 'different')).toBe(true);
    expect(rules(byId['daily-watering']).has('transitive')).toBe(false);
    // Порядок: позиции выводятся из «раньше/позже», без прямых «X под номером N».
    expect(rules(byId['daily-well']).has('order')).toBe(true);
    expect(byId['daily-well'].clues.some((c) => c.kind === 'same')).toBe(false);
    // Соседство.
    expect(byId['daily-beds'].clues.some((c) => c.kind === 'adjacent')).toBe(true);
    // Четыре категории: перенос через третью.
    expect(byId['daily-jam'].categories).toHaveLength(4);
    expect(rules(byId['daily-jam']).has('transitive')).toBe(true);
    // 5×5 со всеми видами улик.
    expect(byId['daily-fishing'].categories[0].values).toHaveLength(5);
    expect(new Set(byId['daily-fishing'].clues.map((c) => c.kind)).size).toBe(5);
    // Короткое 3×3.
    expect(byId['daily-glasses'].categories[0].values).toHaveLength(3);
  });
});

describe('тексты дел дня', () => {
  const stemOf = (value: string): string => {
    const word = value.toLowerCase().split(' ')[0];
    if (/^\d/.test(word)) return word;
    return word.slice(0, Math.max(3, Math.min(4, word.length - 2)));
  };

  it.each(dailies.flatMap((c) => c.clues.map((clue, i) => [`${c.id} #${i + 1}`, clue] as const)))(
    '%s: факт называет обе сущности и своё правило',
    (_label, clue) => {
      const text = clue.text.toLowerCase();
      for (const ref of [clue.a, clue.b]) expect(text, `нет «${ref.value}»: ${clue.text}`).toContain(stemOf(ref.value));
      const marker = { before: /раньше/, after: /позже/, adjacent: /рядом|соседн/, different: / не | не$|^не /, same: /./ }[clue.kind];
      expect(text, `нет слова для правила ${clue.kind}: ${clue.text}`).toMatch(marker);
    },
  );

  it.each(dailies.map((c) => [c.id, c] as const))('%s: есть условия с вопросом и развязка', (_id, c) => {
    expect(c.intro).toMatch(/\?$/);
    expect(c.intro).toMatch(/разн/);
    expect(c.epilogue.length).toBeGreaterThan(40);
  });

  /**
   * Перечисления в условиях: если в тексте названы все значения категории,
   * их порядок рядом с порядком имён не должен совпадать с решением ни в
   * одной позиции — иначе список читается как пары.
   */
  it.each(dailies.map((c) => [c.id, c] as const))('%s: порядок перечисления не совпадает с решением', (_id, c) => {
    const solution = uniqueSolution(c)!;
    const lower = c.intro!.toLowerCase();
    const at = (v: string) => lower.indexOf(stemOf(v));
    const names = c.categories[0].values;
    expect(names.every((n) => at(n) >= 0)).toBe(true);
    const nameOrder = [...names].sort((a, b) => at(a) - at(b));
    for (const cat of c.categories.slice(1)) {
      if (!cat.values.every((v) => at(v) >= 0)) continue; // категория названа не полностью — пар не образует
      const listed = [...cat.values].sort((a, b) => at(a) - at(b));
      nameOrder.forEach((name, i) => {
        expect(listed[i], `${name} — «${listed[i]}»: это ответ`).not.toBe(cat.values[solution[cat.id][names.indexOf(name)]]);
      });
    }
  });
});
