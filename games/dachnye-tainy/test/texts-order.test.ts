import { describe, expect, it } from 'vitest';
import { uniqueSolution } from '@studio/rules';
import type { Case } from '@studio/rules';
import { cases } from '../src/cases';
import { DAILY_SCHEDULE } from '../src/daily/schedule';
import { valueRegExp } from './helpers';

/**
 * Перечисления в условиях и подписях не должны читаться как пары «имя — значение».
 * Правило общее для всех дел: сюжетных и дней.
 *
 * Имена в тексте берутся в порядке упоминания. Значения другой категории:
 * - названы в тексте все (места, вещи, часы) — берётся порядок, в котором они названы;
 * - не названы, но категория упорядочена («числами 1–4», «с понедельника по четверг») —
 *   берётся естественный порядок позиций: список имён не должен совпадать с очерёдностью.
 * Ни в одной позиции i имя из списка не должно иметь i-е значение.
 */


export function pairLeaks(c: Case, text: string): string[] {
  const out: string[] = [];
  const solution = uniqueSolution(c)!;
  const lower = text.toLowerCase();
  const at = (v: string) => lower.search(valueRegExp(v));
  const names = c.categories.find((x) => x.id === c.anchor)!.values;
  if (!names.every((n) => at(n) >= 0)) return out; // имена названы не все — списка пар нет
  const nameOrder = [...names].sort((a, b) => at(a) - at(b));
  for (const cat of c.categories.filter((x) => x.id !== c.anchor)) {
    const named = cat.values.every((v) => at(v) >= 0);
    if (!named && !cat.ordered) continue;
    // Порядок, в котором значения названы в тексте, и — для позиций — естественный порядок: имена,
    // идущие в порядке прихода, подсказывают очерёдность, даже когда сами часы названы вперемешку.
    const orders: string[][] = [];
    if (named) orders.push([...cat.values].sort((a, b) => at(a) - at(b)));
    if (cat.ordered) orders.push([...cat.values]);
    const seen = new Set<string>();
    for (const listed of orders) {
      nameOrder.forEach((name, i) => {
        if (listed[i] !== cat.values[solution[cat.id][names.indexOf(name)]]) return;
        const leak = `${name} ↔ «${listed[i]}» (${cat.title}, позиция ${i + 1})`;
        if (!seen.has(leak)) out.push(leak);
        seen.add(leak);
      });
    }
  }
  return out;
}

const all = [...cases, ...DAILY_SCHEDULE.map((e) => e.case)];

describe('порядок перечислений не выдаёт ответ', () => {
  it.each(all.filter((c) => c.intro).map((c) => [c.id, c] as const))('%s: условия', (_id, c) => {
    expect(pairLeaks(c, c.intro!)).toEqual([]);
  });

  it.each(all.filter((c) => c.story).flatMap((c) => c.story!.map((f, i) => [`${c.id} кадр ${i + 1}`, c, f.caption] as const)))(
    '%s: подпись',
    (_label, c, caption) => {
      expect(pairLeaks(c, caption)).toEqual([]);
    },
  );

  it.each(all.filter((c) => c.intro && c.story).map((c) => [c.id, c] as const))('%s: условия вместе с подписями', (_id, c) => {
    expect(pairLeaks(c, [c.intro, ...c.story!.map((f) => f.caption)].join(' '))).toEqual([]);
  });

  it('проверка ловит прежние тексты: имена, покупки и порядок шли в порядке решения', () => {
    const fifth = cases.find((c) => c.id === 'fifth-1')!;
    const bad = 'Зоя, Игорь, Настя и Рома вернулись по очереди — числами 1–4. Каждый купил: семена, гвозди, мёд или творог.';
    expect(pairLeaks(fifth, bad)).toHaveLength(8);
    const sixth = cases.find((c) => c.id === 'sixth-1')!;
    expect(pairLeaks(sixth, 'Ксюша, Влад, Оля и Митя заняли места: у бревна, на траве, на раскладушке или на камне.')).toHaveLength(8);
  });

  it('и частичное совпадение ловится: одна пара тоже подсказка', () => {
    const bath = DAILY_SCHEDULE.find((e) => e.case.id === 'daily-bath')!.case;
    const old = 'Дана, Лёня, Майя и Борис дежурили с понедельника по четверг. Дела: дрова, вода, веники или уборка.';
    expect(pairLeaks(bath, old)).toEqual(['Лёня ↔ «вторник» (День дежурства, позиция 2)']);
  });

  it('прежний порядок имён «Аня, Борис, Вика, Гриша» совпадал с порядком выхода', () => {
    const third = cases.find((c) => c.id === 'third-1')!;
    expect(pairLeaks(third, 'Аня, Борис, Вика и Гриша выходили по одному, числами 1–4.')).toHaveLength(4);
  });
});
