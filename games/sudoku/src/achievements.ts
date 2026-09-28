import type { sudoku } from '@studio/rules';

type Difficulty = sudoku.Difficulty;

/**
 * Тот же паттерн, что в games/dachnye-tainy/src/achievements.ts (первая игра
 * студии с метапрогрессом): живёт в пакете игры, не в @studio/game-kit.
 * Судоку — уже ВТОРОЙ потребитель этого паттерна, а значит по правилу
 * CLAUDE.md («что нужно дважды — переезжает в общий пакет») пора бы
 * обобщить. Не делаем этого прямо сейчас: «Дачные тайны» проходят
 * повторную модерацию VK/OK, и трогать их сборку сейчас нельзя даже
 * безопасным рефакторингом. Вынос в общий пакет — отдельная задача на
 * потом, когда модерация решится.
 *
 * Проверяются только на завершении партии (в main.ts), не задним числом.
 */

/**
 * Только идентификаторы и порядок показа. Названия и описания — в
 * `i18n.ts` по этому же id: id лежит в сохранении (`save.achievements`),
 * а переведённый текст туда попадать не должен, иначе смена языка
 * «закрывала» бы уже открытые достижения.
 */
export const ACHIEVEMENT_IDS: readonly string[] = [
  'first_puzzle',
  'flawless',
  'three_flawless',
  'streak_7',
  'all_difficulties',
  'comeback',
];

export interface CompletionContext {
  mistakes: number;
  hintsUsed: number;
  /** Сколько пазлов решено всего (ежедневных и практики вместе), включая только что решённый. */
  puzzlesCompletedCount: number;
  /** Текущий стрик ежедневного режима ПОСЛЕ этого решения; 0, если это не ежедневный пазл. */
  streak: number;
  /** Сколько пазлов решено без единой ошибки и подсказки, включая только что решённый. */
  flawlessCount: number;
  /** Какие сложности игрок решал хотя бы раз, включая только что решённую. */
  difficultiesSeen: ReadonlySet<Difficulty>;
}

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Какие достижения открылись именно этим решением — то, чего ещё нет в unlocked. */
export function checkNewAchievements(unlocked: ReadonlySet<string>, ctx: CompletionContext): string[] {
  const candidates: string[] = [];
  if (ctx.puzzlesCompletedCount === 1) candidates.push('first_puzzle');
  if (ctx.mistakes === 0 && ctx.hintsUsed === 0) candidates.push('flawless');
  if (ctx.flawlessCount >= 3) candidates.push('three_flawless');
  if (ctx.streak >= 7) candidates.push('streak_7');
  if (ALL_DIFFICULTIES.every((d) => ctx.difficultiesSeen.has(d))) candidates.push('all_difficulties');
  if (ctx.mistakes > 0) candidates.push('comeback');
  return candidates.filter((id) => !unlocked.has(id));
}

/** Звёзды за качество решения — не только факт «пазл решён». */
export function starsFor(mistakes: number, hintsUsed: number): 1 | 2 | 3 {
  if (mistakes === 0 && hintsUsed === 0) return 3;
  if (mistakes <= 2 && hintsUsed <= 1) return 2;
  return 1;
}
