import { describe, expect, it } from 'vitest';
import { countSolutions, deduceCase, formatIssues, markKey, nextHint, uniqueSolution, validateCase } from '@studio/rules';
import type { Case, PlayerMarks } from '@studio/rules';
import {
  CASE_REQUIRES,
  PLOT_CASE_IDS,
  cases,
  chapter1PondCase,
  chapter2BoatCase,
  chapter2CartCase,
  chapter2CleanupCase,
  nextChapterCase,
} from '../src/cases';
import { suspectFact, trueVersions, versionHolds } from '../src/contradiction';
import { clausesOf, nameRegExp, valueRegExp } from './helpers';

/**
 * Глава 2 «Чужая лодка»: три связанных расследования. Сценарий — docs/dachnye-tainy-chapter2-plan-2026-10.md.
 * Решения закреплены явно: «имя → значения остальных категорий, в порядке категорий дела».
 */
const EXPECTED: Record<string, Record<string, string[]>> = {
  'ch2-boat': {
    Вера: ['зелёная', 'белая заплата'],
    Лида: ['синяя', 'резная корма'],
    Игорь: ['красная', 'вмятина на носу'],
    Матвей: ['серая', 'ржавая уключина'],
  },
  'ch2-cart': {
    Игорь: ['5:30', 'ручная тележка'],
    Зоя: ['6:00', 'садовая тачка'],
    Рома: ['6:30', 'велосипед'],
    Матвей: ['5:00', 'мотоблок'],
  },
  'ch2-cleanup': {
    Лида: ['уборка ряски', 'ромашка'],
    Зоя: ['ремонт скамьи', 'ёлочка'],
    Рома: ['сбор веток', 'звезда'],
    Настя: ['покраска калитки', 'солнце'],
  },
};

const chapter2 = [chapter2BoatCase, chapter2CartCase, chapter2CleanupCase];

const solutionOf = (c: Case): Record<string, string[]> => {
  const solution = uniqueSolution(c)!;
  const anchor = c.categories.find((x) => x.id === c.anchor)!;
  const others = c.categories.filter((x) => x.id !== c.anchor);
  return Object.fromEntries(anchor.values.map((name, i) => [name, others.map((cat) => cat.values[solution[cat.id][i]])]));
};

describe('глава 2: три дела корректны, решаются и закреплены явно', () => {
  it.each(chapter2.map((c) => [c.id, c] as const))('%s: валидно, решение единственное, решается рассуждением', (_id, source) => {
    const issues = validateCase(source);
    expect(issues, formatIssues(source, issues)).toEqual([]);
    expect(countSolutions(source)).toBe(1);
    expect(deduceCase(source).solved).toBe(true);
  });

  it.each(chapter2.map((c) => [c.id, c] as const))('%s: решение — ожидаемое', (id, source) => {
    expect(solutionOf(source)).toEqual(EXPECTED[id]);
  });

  /** Факт нужен, если без него решений больше одного или путь уже не объяснить подсказками. */
  it.each(chapter2.map((c) => [c.id, c] as const))('%s: ни одна улика не лишняя', (_id, source) => {
    source.clues.forEach((_, i) => {
      const without = { ...source, clues: source.clues.filter((__, j) => j !== i) };
      const needed = countSolutions(without) !== 1 || !deduceCase(without).solved;
      expect(needed, `улика ${i + 1} лишняя: ${source.clues[i].text}`).toBe(true);
    });
  });

  it.each(chapter2.map((c) => [c.id, c] as const))('%s: подсказки доводят до конца — 3 сетки по 16 клеток', (_id, source) => {
    const marks: PlayerMarks = {};
    for (let guard = 0; guard < 300; guard += 1) {
      const hint = nextHint(source, marks);
      if (!hint) break;
      expect(hint.text.length).toBeGreaterThan(10);
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }
    expect(nextHint(source, marks)).toBeNull();
    expect(Object.keys(marks)).toHaveLength(48);
  });

  it.each(chapter2.flatMap((c) => c.clues.map((clue, i) => [`${c.id} #${i + 1}`, clue] as const)))(
    '%s: улика называет обе сущности и своё правило',
    (_label, clue) => {
      const text = clue.text.toLowerCase();
      for (const ref of [clue.a, clue.b]) expect(valueRegExp(ref.value).test(text), `нет «${ref.value}»: ${clue.text}`).toBe(true);
      const marker = { before: /раньше/, after: /позже/, adjacent: /рядом|соседн/, different: / не /, same: /./ }[clue.kind];
      expect(text, `нет слова для правила ${clue.kind}: ${clue.text}`).toMatch(marker);
    },
  );

  it.each(chapter2.map((c) => [c.id, c] as const))('%s: условия заканчиваются вопросом, есть развязка и находка или финал', (id, source) => {
    expect(source.intro).toMatch(/\?$/);
    expect(source.intro).toMatch(/разн/);
    expect(source.title).toMatch(/^Глава 2\. /);
    expect(source.epilogue.length).toBeGreaterThan(60);
    if (id !== 'ch2-cleanup') expect(source.finding?.text.length).toBeGreaterThan(80);
  });

  it.each(chapter2.map((c) => [c.id, c] as const))('%s: развязка говорит то же, что решение — значения рядом со своими людьми', (id, source) => {
    const names = source.categories[0].values;
    const clauses = clausesOf(source.epilogue, names);
    for (const name of names) {
      const own = clauses.filter((cl) => cl.who.includes(name));
      expect(own.length, `в развязке нет «${name}»`).toBeGreaterThan(0);
      const text = own.map((cl) => cl.text.toLowerCase()).join(' ');
      for (const value of EXPECTED[id][name]) {
        const literal = valueRegExp(value).test(source.epilogue.toLowerCase());
        if (literal) expect(valueRegExp(value).test(text), `${name}: в развязке нет «${value}» рядом с именем`).toBe(true);
      }
      for (const other of names.filter((n) => n !== name)) {
        for (const value of EXPECTED[id][other]) {
          if (EXPECTED[id][name].includes(value)) continue;
          for (const cl of own.filter((x) => x.who.length === 1)) {
            expect(valueRegExp(value).test(cl.text.toLowerCase()), `${name}: «${value}» принадлежит ${other}: «${cl.text}»`).toBe(false);
          }
        }
      }
    }
  });
});

describe('глава 2: цепочка открытия и сохранения', () => {
  it('дела идут десятым, одиннадцатым и двенадцатым; сюжетных двенадцать', () => {
    expect(cases).toHaveLength(12);
    expect(cases.slice(9).map((c) => c.id)).toEqual(['ch2-boat', 'ch2-cart', 'ch2-cleanup']);
  });

  it('открываются цепочкой: после «Пруда», затем одно за другим; продолжения после третьего нет', () => {
    expect(CASE_REQUIRES['ch2-boat']).toBe('ch1-pond');
    expect(CASE_REQUIRES['ch2-cart']).toBe('ch2-boat');
    expect(CASE_REQUIRES['ch2-cleanup']).toBe('ch2-cart');
    expect(nextChapterCase('ch1-pond')?.id).toBe('ch2-boat');
    expect(nextChapterCase('ch2-boat')?.id).toBe('ch2-cart');
    expect(nextChapterCase('ch2-cart')?.id).toBe('ch2-cleanup');
    expect(nextChapterCase('ch2-cleanup')).toBeUndefined();
  });

  it('старое сохранение: без раскрытого «Пруда» все три дела заперты, с ним открыто только первое', () => {
    const locked = (completed: string[], id: string) => !!CASE_REQUIRES[id] && !completed.includes(CASE_REQUIRES[id]);
    const old = ['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1', 'ch1-hose', 'ch1-key'];
    for (const id of ['ch2-boat', 'ch2-cart', 'ch2-cleanup']) expect(locked(old, id), id).toBe(true);
    const withPond = [...old, 'ch1-pond'];
    expect(locked(withPond, 'ch2-boat')).toBe(false);
    expect(locked(withPond, 'ch2-cart')).toBe(true);
    expect(locked(withPond, 'ch2-cleanup')).toBe(true);
  });

  it('достижения за участок не сдвинуты: сюжетных дел по-прежнему шесть, прежние id на месте', () => {
    expect(PLOT_CASE_IDS).toEqual(['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1']);
    expect(cases.slice(0, 9).map((c) => c.id)).toEqual([
      'tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1', 'ch1-hose', 'ch1-key', 'ch1-pond',
    ]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(12);
  });

  it('шаг «версия» только у «Пруда» и у финала главы 2', () => {
    expect(cases.filter((c) => c.verdict).map((c) => c.id)).toEqual(['ch1-pond', 'ch2-cleanup']);
    expect(cases.filter((c) => c.contradiction).map((c) => c.id)).toEqual(['ch1-key']);
  });

  it('находка «Пруда» (лодка у берега) — то, на чём стоит дело 1', () => {
    expect(chapter1PondCase.finding?.text).toMatch(/лодк/);
    expect(chapter2BoatCase.intro).toMatch(/лодку, которой вчера там не было/);
  });
});

describe('глава 2: причинная цепочка не противоречит сама себе', () => {
  const texts = (c: Case) => [c.intro ?? '', c.epilogue, c.finding?.text ?? '', ...c.clues.map((x) => x.text)].join(' ');

  it('дело 1: найденная лодка — зелёная с белой заплатой, и это одна и та же лодка Веры', () => {
    const solution = solutionOf(chapter2BoatCase);
    const green = Object.entries(solution).find(([, v]) => v.includes('зелёная'))![0];
    const patch = Object.entries(solution).find(([, v]) => v.includes('белая заплата'))![0];
    expect(green).toBe('Вера');
    expect(patch).toBe('Вера');
    expect(chapter2BoatCase.intro).toMatch(/зелёную, с белой заплатой/);
  });

  it('дело 1: ни одна улика не называет Веру владелицей найденной лодки прямо', () => {
    for (const clue of chapter2BoatCase.clues) {
      if (clue.kind !== 'same') continue;
      const values = [clue.a.value, clue.b.value];
      expect(values.includes('Вера'), clue.text).toBe(false);
      expect(values.includes('зелёная') || values.includes('белая заплата'), clue.text).toBe(false);
    }
  });

  it('никто в делах 1 и 2 не называет просившего: ни Вера, ни Игорь не знают организатора', () => {
    const asked = /(просил[аи]?|попросил[аи]?|организовал[аи]?|разрешила)[^.]*Лид|Лид[^.]*(просил|организовал|попросил)/;
    for (const c of [chapter2BoatCase, chapter2CartCase]) {
      expect(texts(c), c.id).not.toMatch(asked);
      expect(texts(c), c.id).not.toMatch(/ряск|сюрприз|субботник/i);
    }
    expect(chapter2BoatCase.finding!.text).toMatch(/Подписи не было — вместо неё значок/);
    // Ни Вера, ни Игорь не знают, кто просил: в находках дел 1 и 2 организатора нет вовсе.
    expect(chapter2BoatCase.finding!.text).not.toMatch(/Лид/);
    expect(chapter2CartCase.finding!.text).not.toMatch(/Лид/);
    expect(chapter2CartCase.epilogue).not.toMatch(/Лид/);
    expect(chapter2CartCase.finding!.text).toMatch(/Кто его поставил, не знаю/);
  });

  it('дело 1: почему не лодка самой Лиды — просили широкую и устойчивую', () => {
    expect(chapter2BoatCase.finding!.text).toMatch(/широкая и устойчивая/);
  });

  it('дело 2: все поездки начались раньше 7:00, когда лодку увидели; время осмотра названо в условиях', () => {
    expect(chapter2CartCase.intro).toMatch(/в 7:00 утра/);
    const times = chapter2CartCase.categories.find((c) => c.id === 'время')!.values;
    for (const t of times) {
      const [h, m] = t.split(':').map(Number);
      expect(h * 60 + m, t).toBeLessThan(7 * 60);
    }
    expect(chapter2CartCase.intro).toMatch(/не момент, когда лодку увидели/);
  });

  it('дело 2: таблица не заявляет груз, груз — только в журнале выдачи, и время журнала совпадает с таблицей', () => {
    expect(chapter2CartCase.epilogue).toMatch(/но не что на ней везли/);
    expect(chapter2CartCase.clues.map((c) => c.text).join(' ')).not.toMatch(/лодк/i);
    const igor = solutionOf(chapter2CartCase).Игорь;
    expect(chapter2CartCase.finding!.text).toContain(`выдана Игорю в ${igor[0]}`);
    expect(chapter2CartCase.finding!.text).toMatch(/журнале выдачи/);
    // та же бирка, что на лодке в деле 1
    expect(chapter2BoatCase.finding!.text).toMatch(/бирка № 3/);
    expect(chapter2CartCase.finding!.text).toMatch(/бирк[ой]* № 3/);
  });

  it('дело 2: Игорь не виновен в истории с водой — его вечерние показания первой главы сюда не примешаны', () => {
    expect(texts(chapter2CartCase)).not.toMatch(/след шланга|насос|водокачк|самописец|23:00|2:00/);
    expect(texts(chapter2CartCase)).not.toMatch(/украл|воров|злой умысел/);
  });

  it('значок-ромашка проходит через все три дела одним и тем же', () => {
    expect(chapter2CartCase.finding!.text).toMatch(/значок-ромашка/);
    expect(chapter2CleanupCase.intro).toMatch(/значком-ромашкой/);
    const ev = chapter2CleanupCase.verdict!.evidence;
    for (const i of [0, 1, 2]) expect(ev[i], `улика ${i + 1}`).toMatch(/ромашк/);
  });

  it('дело 3: значок выводится таблицами — ни одна улика не называет владельца ромашки', () => {
    for (const clue of chapter2CleanupCase.clues) {
      if (clue.kind !== 'same') continue;
      expect([clue.a.value, clue.b.value], clue.text).not.toContain('ромашка');
    }
    expect(solutionOf(chapter2CleanupCase).Лида).toEqual(['уборка ряски', 'ромашка']);
  });

  it('дело 3: разрешения владельца пруда нет — его не придумывают, а признают', () => {
    const ev = chapter2CleanupCase.verdict!.evidence.join(' ');
    expect(ev).not.toMatch(/Геннадий[^.]*(разрешил|согласен|согласовал|дал разрешение)/);
    expect(ev).toMatch(/не предупреждали/);
    expect(chapter2CleanupCase.epilogue).toMatch(/не разрешение хозяина пруда/);
    expect(chapter2CleanupCase.epilogue).toMatch(/Никто ничего не украл/);
  });

  it('финал главы: без новой загадочной находки и без обещания продолжения', () => {
    expect(chapter2CleanupCase.finding).toBeUndefined();
    expect(texts(chapter2CleanupCase)).not.toMatch(/продолжение следует|следующ\w+ дел/i);
  });

  it('первой главе ничего не сделано: название и выводы остались', () => {
    expect(chapter1PondCase.title).toBe('Глава 1. Свет над прудом');
    expect(chapter1PondCase.epilogue).toMatch(/Воду повторно никто|Про две ночи до неё доказательств нет/);
    expect(chapter1PondCase.finding?.text).toMatch(/Это уже другая история/);
  });
});

describe('глава 2, дело 3: шаг «версия»', () => {
  const source = chapter2CleanupCase;
  const verdict = source.verdict!;
  const solution = uniqueSolution(source)!;

  it('верна ровно одна версия — Лида, владелица значка с листа', () => {
    const right = trueVersions(source, solution);
    expect(right).toHaveLength(1);
    expect(right[0].who.value).toBe('Лида');
    expect(verdict.culprit).toEqual({ category: 'значок', value: 'ромашка' });
  });

  it('три версии: у каждой своя организатор и текст называет её', () => {
    expect(verdict.versions).toHaveLength(3);
    expect(new Set(verdict.versions.map((v) => v.who.value)).size).toBe(3);
    for (const v of verdict.versions) expect(nameRegExp(v.who.value).test(v.text.toLowerCase()), v.text).toBe(true);
  });

  it('у каждой отвергнутой версии есть опровержение из фактов шага, у верной — нет', () => {
    const evidence = verdict.evidence.join(' ');
    for (const v of verdict.versions) {
      if (versionHolds(source, solution, v)) {
        expect(v.refutation).toBeUndefined();
        continue;
      }
      expect(v.refutation, v.text).toBeTruthy();
      // опровержение опирается на то, что действительно названо в фактах
      expect(v.refutation).toMatch(/сачк|заявк/);
      expect(evidence).toMatch(/сачк/);
      expect(evidence).toMatch(/Вера разрешила/);
    }
    const roma = verdict.versions.find((v) => v.who.value === 'Рома')!;
    expect(roma.refutation).toMatch(/Вера лодку разрешила/);
    const nastya = verdict.versions.find((v) => v.who.value === 'Настя')!;
    expect(nastya.refutation).toMatch(/работа на воде/);
    expect(evidence).toMatch(/для работы на воде/);
  });

  it('объяснение неверного выбора: что таблицы установили о подозреваемом в категории значка', () => {
    const roma = verdict.versions.find((v) => v.who.value === 'Рома')!;
    const nastya = verdict.versions.find((v) => v.who.value === 'Настя')!;
    expect(suspectFact(source, solution, roma)).toBe('звезда');
    expect(suspectFact(source, solution, nastya)).toBe('солнце');
    expect(verdict.culpritReason).toMatch(/ромашк/);
  });

  it('факты шага не называют организатора по имени: человек определяется таблицей', () => {
    for (const fact of verdict.evidence) expect(fact, fact).not.toMatch(/Лид/);
    expect(verdict.question).not.toMatch(/Лид/);
  });

  it('цель устанавливается отдельно от человека: заявка на сачки для ряски и место работ — пруд председателя', () => {
    const ev = verdict.evidence.join(' ');
    expect(ev).toMatch(/сачка для ряски/);
    expect(ev).toMatch(/пруд председателя/);
    expect(verdict.versions.find((v) => v.who.value === 'Лида')!.text).toMatch(/ряск/);
    expect(verdict.resolution).toMatch(/по таблицам это значок Лиды/i);
  });
});
