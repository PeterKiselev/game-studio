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
  const EXPECTED_DAYS: readonly (readonly [string, string])[] = [
    ['2026-10-14', 'daily-glasses'],
    ['2026-10-15', 'daily-watering'],
    ['2026-10-16', 'daily-well'],
    ['2026-10-17', 'daily-beds'],
    ['2026-10-18', 'daily-bath'],
    ['2026-10-19', 'daily-jam'],
    ['2026-10-20', 'daily-fishing'],
    ['2026-10-21', 'daily-post'],
    ['2026-10-22', 'daily-apples'],
    ['2026-10-23', 'daily-repair'],
    ['2026-10-24', 'daily-seedlings'],
    ['2026-10-25', 'daily-tea'],
    ['2026-10-26', 'daily-concert'],
    ['2026-10-27', 'daily-mushrooms'],
  ];

  it('четырнадцать дел на 14–27 октября: каждая дата на месте, ни дня пропуска, прежние десять на своих датах', () => {
    expect(DAILY_SCHEDULE.map((e) => [e.date, e.case.id])).toEqual(EXPECTED_DAYS);
    // Подряд, без дыр: каждая следующая дата — ровно следующий день.
    DAILY_SCHEDULE.forEach((entry, i) => {
      if (i === 0) return;
      const previous = Date.parse(DAILY_SCHEDULE[i - 1].date + 'T00:00:00Z');
      expect(Date.parse(entry.date + 'T00:00:00Z') - previous, entry.date).toBe(24 * 60 * 60 * 1000);
    });
  });

  it('даты по порядку без повторов, дела не повторяются', () => {
    expect(DAILY_SCHEDULE).toHaveLength(14);
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
    expect(dailyState('2026-10-23')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-repair' } } });
    expect(dailyState('2026-10-24')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-seedlings' } } });
    expect(dailyState('2026-10-25')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-tea' } } });
    expect(dailyState('2026-10-26')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-concert' } } });
    expect(dailyState('2026-10-27')).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-mushrooms' } } });
    expect(dailyState('2026-10-28')).toEqual({ kind: 'exhausted' });
    expect(dailyState('2027-03-01')).toEqual({ kind: 'exhausted' });
  });

  it('после конца расписания старые дела не выдаются как новые', () => {
    const later = ['2026-10-28', '2026-10-29', '2026-11-04'];
    for (const date of later) expect(dailyState(date).kind).toBe('exhausted');
  });

  it('пропуск в расписании — честное «сегодня дела нет, следующее…»', () => {
    const withGap: DailyEntry[] = [DAILY_SCHEDULE[0], { ...DAILY_SCHEDULE[1], date: '2026-10-17' }];
    expect(dailyState('2026-10-15', withGap)).toMatchObject({ kind: 'gap', next: { date: '2026-10-17' } });
  });

  it('пополнение: новые записи продолжают расписание, прошлые остаются доступны', () => {
    const extended: DailyEntry[] = [...DAILY_SCHEDULE, { date: '2026-10-29', case: { ...dailies[0], id: 'daily-next' } }];
    expect(dailyState('2026-10-29', extended)).toMatchObject({ kind: 'today', entry: { case: { id: 'daily-next' } } });
    expect(dailyState('2026-10-28', extended)).toMatchObject({ kind: 'gap', next: { date: '2026-10-29' } });
  });

  it('прошлые дела — только прошедших дат, от новых к старым; будущих нет', () => {
    expect(pastDailies('2026-10-14')).toEqual([]);
    expect(pastDailies('2026-10-16').map((e) => e.date)).toEqual(['2026-10-15', '2026-10-14']);
    expect(pastDailies('2026-10-30')).toHaveLength(14);
  });

  it('будущие дела не попадают в архив: дело дня ещё не прошлое, завтрашние скрыты', () => {
    const futureIds = ['daily-seedlings', 'daily-tea', 'daily-concert', 'daily-mushrooms'];
    const on23 = pastDailies('2026-10-23').map((e) => e.case.id);
    expect(on23).toHaveLength(9);
    for (const id of futureIds) expect(on23).not.toContain(id);
    // 25-го архив кончается 24-м: дело дня (чай) в нём ещё не лежит, 26–27 скрыты.
    expect(pastDailies('2026-10-25').map((e) => e.date)[0]).toBe('2026-10-24');
    expect(pastDailies('2026-10-25').map((e) => e.case.id)).not.toContain('daily-tea');
    expect(pastDailies('2026-10-27')).toHaveLength(13);
    expect(pastDailies('2026-10-27').map((e) => e.case.id)).not.toContain('daily-mushrooms');
    // 28 октября архив полный, а дела дня нет.
    expect(pastDailies('2026-10-28').map((e) => e.date)).toEqual(EXPECTED_DAYS.map(([date]) => date).reverse());
    expect(dailyState('2026-10-28')).toEqual({ kind: 'exhausted' });
  });
});

describe('дела дня: корректны и разные по ходу рассуждения', () => {
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

  it('профили всех дел разные', () => {
    const profiles = dailies.map(profile);
    expect(new Set(profiles).size, profiles.join('\n')).toBe(dailies.length);
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

  /**
   * Четыре дела 24–27 октября отличаются самим ходом: что именно придётся делать
   * игроку. Проверяется по уликам и по тому, какие правила реально применял движок.
   */
  describe('новые дела 24–27 октября: свой ход рассуждения', () => {
    const byId = Object.fromEntries(dailies.map((c) => [c.id, c]));
    const steps = (c: Case) => deduceCase(c).steps.map((s) => s.reason.rule);
    const kindsOf = (c: Case) => [...new Set(c.clues.map((x) => x.kind))].sort();
    const mentionsPerson = (c: Case, clue: Case['clues'][number]) => clue.a.category === c.anchor || clue.b.category === c.anchor;

    it('«Ящики с рассадой»: цепочка тождеств — людей в уликах всего двое, остальное через три категории', () => {
      const c = byId['daily-seedlings'];
      expect(c.categories).toHaveLength(4);
      expect(c.categories.some((x) => x.ordered)).toBe(false);
      expect(kindsOf(c)).toEqual(['different', 'same']);
      expect(c.clues.filter((x) => mentionsPerson(c, x))).toHaveLength(2);
      expect(c.clues.filter((x) => x.kind === 'same').length).toBeGreaterThanOrEqual(4);
      // Ответ не дан ни одной уликой: «баклажан — Степан» выводится только переносом.
      expect(c.clues.some((x) => [x.a.value, x.b.value].includes('баклажан') && [x.a.value, x.b.value].includes('Степан'))).toBe(false);
      expect(steps(c).filter((r) => r === 'transitive').length).toBeGreaterThanOrEqual(3);
      expect(steps(c)).not.toContain('order');
    });

    it('«Чай на веранде»: только «раньше» и «рядом» между людьми — ни «это он», ни «не он»', () => {
      const c = byId['daily-tea'];
      expect(kindsOf(c)).toEqual(['adjacent', 'before']);
      expect(c.categories).toHaveLength(2);
      expect(c.categories[0].values).toHaveLength(5);
      expect(c.clues.every((x) => x.a.category === c.anchor && x.b.category === c.anchor)).toBe(true);
      expect(c.clues.filter((x) => x.kind === 'adjacent').length).toBeGreaterThanOrEqual(2);
      expect(steps(c)).toContain('order');
      expect(steps(c)).not.toContain('transitive');
    });

    it('«Дачный концерт»: только «раньше», «позже» и «не»; порядок связывает и выступления между собой', () => {
      const c = byId['daily-concert'];
      expect(kindsOf(c)).toEqual(['after', 'before', 'different']);
      expect(c.categories[0].values).toHaveLength(5);
      expect(c.categories).toHaveLength(3);
      expect(c.clues.filter((x) => x.kind === 'different')).toHaveLength(1);
      const acts = (x: Case['clues'][number]) => (x.a.category === 'выступление' ? 1 : 0) + (x.b.category === 'выступление' ? 1 : 0);
      expect(c.clues.some((x) => x.kind !== 'different' && acts(x) === 2)).toBe(true);
      expect(c.clues.some((x) => x.kind !== 'different' && acts(x) === 1)).toBe(true);
      expect(steps(c)).toContain('order');
    });

    it('«Грибной поход»: 4×4 с порядком — соседство и «раньше» между лесами и грибами вместе с тождествами', () => {
      const c = byId['daily-mushrooms'];
      expect(c.categories).toHaveLength(4);
      expect(c.categories.some((x) => x.ordered)).toBe(true);
      expect(kindsOf(c)).toEqual(['adjacent', 'before', 'different', 'same']);
      const orderClues = c.clues.filter((x) => x.kind === 'adjacent' || x.kind === 'before');
      expect(orderClues.every((x) => x.a.category !== c.anchor && x.b.category !== c.anchor)).toBe(true);
      expect(c.clues.length).toBeGreaterThanOrEqual(9);
      expect(steps(c)).toContain('order');
      expect(steps(c)).toContain('transitive');
    });

    it('четыре новых дела — четыре разных профиля, и ни один не повторяет прежние десять', () => {
      const fresh = ['daily-seedlings', 'daily-tea', 'daily-concert', 'daily-mushrooms'].map((id) => profile(byId[id]));
      expect(new Set(fresh).size).toBe(4);
      const old = dailies.slice(0, 10).map(profile);
      for (const key of fresh) expect(old, key).not.toContain(key);
    });
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
