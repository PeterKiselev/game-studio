import { tutorialCase } from './tutorial';
import { secondCase } from './second';
import { thirdCase } from './third';
import { fourthCase } from './fourth';
import { fifthCase } from './fifth';
import { sixthCase } from './sixth';
import type { Case } from '@studio/rules';

/**
 * Содержание дел живёт в пакете игры, движок — в @studio/rules. Лестница
 * сложности: tutorial-1/second-1 — 3×3, база; third-1/fourth-1 — 4×4 без
 * и с порядком; fifth-1/sixth-1 — 4×4 с порядком и более густыми клубами.
 * Модератор VK попросил больше контента — это первая партия сверх трёх
 * дел вертикального среза, не финальный объём (цель — 10-12).
 */
export const cases: Case[] = [tutorialCase, secondCase, thirdCase, fourthCase, fifthCase, sixthCase];

export { tutorialCase, secondCase, thirdCase, fourthCase, fifthCase, sixthCase };
