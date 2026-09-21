/**
 * Достижения — то, чего модератор VK прямо попросил добавить помимо
 * объёма дел («больше механик, достижений, интересную систему прогресса»).
 * Живёт в пакете игры, не в @studio/game-kit: используется пока одной
 * игрой, обобщать рано — переедет в общий пакет, когда понадобится второй.
 *
 * Проверяются только на ПЕРВОМ раскрытии дела (isNew в main.ts), не на
 * повторном — иначе игрок мог бы получить «Ясный ум» просто переигрывая
 * одно и то же уже раскрытое дело без подсказок.
 */

export interface Achievement {
  id: string;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_case', title: 'Первое дело', description: 'Раскрыли своё первое дело.' },
  { id: 'no_hints', title: 'Без подсказок', description: 'Раскрыли дело, не взяв ни одной подсказки.' },
  {
    id: 'three_flawless',
    title: 'Ясный ум',
    description: 'Раскрыли три дела без единой подсказки (не обязательно подряд).',
  },
  {
    id: 'comeback',
    title: 'Не с первой попытки',
    description: 'Раскрыли дело после того, как сами же ошиблись в отметке.',
  },
  { id: 'all_cases', title: 'Все тайны участка', description: 'Раскрыли все дела на участке.' },
];

export interface CompletionContext {
  hintsUsed: number;
  hadMistake: boolean;
  /** Сколько дел раскрыто всего, включая только что раскрытое. */
  casesCompletedCount: number;
  totalCases: number;
  /** Сколько дел раскрыто без единой подсказки, включая только что раскрытое. */
  flawlessCount: number;
}

/** Какие достижения открылись именно этим раскрытием — то, что ещё не в `unlocked`. */
export function checkNewAchievements(unlocked: ReadonlySet<string>, ctx: CompletionContext): string[] {
  const candidates: string[] = [];
  if (ctx.casesCompletedCount === 1) candidates.push('first_case');
  if (ctx.hintsUsed === 0) candidates.push('no_hints');
  if (ctx.flawlessCount >= 3) candidates.push('three_flawless');
  if (ctx.hadMistake) candidates.push('comeback');
  if (ctx.casesCompletedCount === ctx.totalCases) candidates.push('all_cases');
  return candidates.filter((id) => !unlocked.has(id));
}

/** Звёзды за качество раскрытия — основа прогресса участка, не только факт «дело закрыто». */
export function starsFor(hintsUsed: number): 1 | 2 | 3 {
  if (hintsUsed === 0) return 3;
  if (hintsUsed === 1) return 2;
  return 1;
}
