import { countSolutions, TooHeavyError } from './solver';
import type { Puzzle } from './types';

/**
 * Проверка пазла на этапе сборки, не на этапе игры — тот же принцип, что
 * у validateCase() в deduction/validate.ts: дефект контента (нерешаемый
 * пазл, пазл с двумя решениями) должен всплыть в тестах у автора, а не
 * когда игрок уже застрял посреди партии.
 */

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
}

export function validatePuzzle(puzzle: Puzzle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string): void => {
    issues.push({ level: 'error', code, message });
  };

  if (puzzle.givens.length !== 81) {
    error('bad-givens-length', `Сетка givens должна содержать 81 клетку, получено ${puzzle.givens.length}.`);
    return issues;
  }
  if (puzzle.solution.length !== 81) {
    error('bad-solution-length', `Решение должно содержать 81 клетку, получено ${puzzle.solution.length}.`);
    return issues;
  }

  for (let i = 0; i < 81; i += 1) {
    const given = puzzle.givens[i];
    if (given !== 0 && given !== puzzle.solution[i]) {
      error('given-mismatch', `Клетка ${i}: givens (${given}) не совпадает с solution (${puzzle.solution[i]}).`);
    }
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  try {
    const solutions = countSolutions(puzzle.givens, 2);
    if (solutions === 0) error('no-solution', 'У пазла нет ни одного решения.');
    if (solutions === 2) error('ambiguous', 'У пазла больше одного решения — уберите меньше клеток.');
  } catch (e) {
    if (e instanceof TooHeavyError) {
      error('too-heavy', 'Решатель не смог проверить единственность решения за предохранитель шагов.');
    } else {
      throw e;
    }
  }

  return issues;
}

/** Пазл пригоден к выпуску: без ошибок. */
export function isReleasable(puzzle: Puzzle): boolean {
  return validatePuzzle(puzzle).every((i) => i.level !== 'error');
}
