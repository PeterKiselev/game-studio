import { tutorialCase } from './tutorial';
import type { Case } from '@studio/rules';

/**
 * Содержание дел живёт в пакете игры, движок — в @studio/rules.
 * Пока здесь одно обучающее дело: сначала вертикальный срез,
 * остальные одиннадцать добавляются после плейтеста.
 */
export const cases: Case[] = [tutorialCase];

export { tutorialCase };