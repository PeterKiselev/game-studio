import { tutorialCase } from './tutorial';
import { secondCase } from './second';
import { thirdCase } from './third';
import { fourthCase } from './fourth';
import { fifthCase } from './fifth';
import { sixthCase } from './sixth';
import { chapter1HoseCase } from './chapter1-hose';
import type { Case } from '@studio/rules';

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

export const cases: Case[] = [tutorialCase, secondCase, thirdCase, fourthCase, fifthCase, sixthCase, chapter1HoseCase];

export { tutorialCase, secondCase, thirdCase, fourthCase, fifthCase, sixthCase, chapter1HoseCase };
