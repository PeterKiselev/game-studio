import { tutorialCase } from './tutorial';
import { secondCase } from './second';
import { thirdCase } from './third';
import { fourthCase } from './fourth';
import { fifthCase } from './fifth';
import { sixthCase } from './sixth';
import { chapter1HoseCase } from './chapter1-hose';
import { chapter1KeyCase } from './chapter1-key';
import type { Case } from '@studio/rules';
import type { ValueRenames } from '../progress';

/**
 * Содержание дел живёт в пакете игры, движок — в @studio/rules. Лестница
 * сложности: tutorial-1/second-1 — 3×3, база; third-1/fourth-1 — 4×4 без
 * и с порядком; fifth-1/sixth-1 — 4×4 с порядком и более густыми клубами.
 * Модератор VK попросил больше контента — это первая партия сверх трёх
 * дел вертикального среза, не финальный объём (цель — 10-12).
 */
/**
 * Исходные дела участка — цель достижения «Все тайны участка». Список
 * зафиксирован намеренно: главы (chapter1HoseCase и следующие) в него не входят,
 * чтобы новые дополнения не отодвигали уже достигнутую игроками цель.
 */
export const PLOT_CASE_IDS: readonly string[] = ['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1'];

export const cases: Case[] = [
  tutorialCase,
  secondCase,
  thirdCase,
  fourthCase,
  fifthCase,
  sixthCase,
  chapter1HoseCase,
  chapter1KeyCase,
];

/**
 * Дела главы идут цепочкой: вопрос следующего дела задаёт находка предыдущего,
 * поэтому дело открывается только после раскрытия того, на чём оно стоит.
 * Отдельного поля в сохранении не нужно — всё выводится из casesCompleted.
 */
export const CASE_REQUIRES: Readonly<Record<string, string>> = {
  'ch1-key': 'ch1-hose',
};

/**
 * Позиции порядка раньше назывались «первой, вторым, третьей, четвёртым» —
 * окончания выдавали, где женщины, а где мужчины. Теперь это «1–4»; старые
 * незаконченные отметки переносятся на новые имена (progress.ts renameMarks).
 */
const ORDER_RENAME = { время: { первой: '1', вторым: '2', третьей: '3', четвёртым: '4' } };
export const VALUE_RENAMES: Readonly<Record<string, ValueRenames>> = {
  'third-1': ORDER_RENAME,
  'fifth-1': ORDER_RENAME,
  'sixth-1': ORDER_RENAME,
};

/** Следующее дело главы — для кнопки на развязке; undefined, если продолжения пока нет. */
export function nextChapterCase(id: string): Case | undefined {
  const nextId = Object.keys(CASE_REQUIRES).find((k) => CASE_REQUIRES[k] === id);
  return cases.find((c) => c.id === nextId);
}

export { tutorialCase, secondCase, thirdCase, fourthCase, fifthCase, sixthCase, chapter1HoseCase, chapter1KeyCase };
