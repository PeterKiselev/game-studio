import { tutorialCase } from './tutorial';
import { secondCase } from './second';
import { thirdCase } from './third';
import type { Case } from '@studio/rules';

/**
 * Содержание дел живёт в пакете игры, движок — в @studio/rules.
 * Три дела параллельно с первым живым плейтестом: tutorial-1 проверяет
 * саму механику, second-1 закрепляет её на новой истории того же
 * уровня сложности, third-1 добавляет умеренное усложнение (четвёртая
 * сущность, упорядоченная категория). Большая глава — после того как
 * станет ясно по обратной связи, что и сколько дорабатывать.
 */
export const cases: Case[] = [tutorialCase, secondCase, thirdCase];

export { tutorialCase, secondCase, thirdCase };