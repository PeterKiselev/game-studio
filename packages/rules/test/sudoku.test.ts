import { describe, expect, it } from 'vitest';
import {
  countSolutions,
  difficultyForDate,
  dailySeed,
  findConflicts,
  generatePuzzle,
  gridForHint,
  isReleasable,
  nextHint,
  solveGrid,
  todayIso,
  validatePuzzle,
} from '../src/sudoku';
import type { Difficulty, Grid } from '../src/sudoku';

/** Классический пример решённой сетки — используется как фикстура в нескольких тестах. */
const SOLVED: Grid = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
];

function emptyGrid(): Grid {
  return new Array(81).fill(0);
}

function isValidFullGrid(grid: Grid): boolean {
  const check = (indices: number[]): boolean => new Set(indices.map((i) => grid[i])).size === 9;
  for (let r = 0; r < 9; r += 1) {
    if (!check(Array.from({ length: 9 }, (_, c) => r * 9 + c))) return false;
  }
  for (let c = 0; c < 9; c += 1) {
    if (!check(Array.from({ length: 9 }, (_, r) => r * 9 + c))) return false;
  }
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const box: number[] = [];
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) box.push((br * 3 + r) * 9 + (bc * 3 + c));
      if (!check(box)) return false;
    }
  }
  return true;
}

describe('solveGrid / countSolutions', () => {
  it('решённая сетка — ровно одно решение (сама себя)', () => {
    expect(countSolutions(SOLVED)).toBe(1);
  });

  it('пустая сетка — больше одного решения', () => {
    expect(countSolutions(emptyGrid(), 2)).toBe(2);
  });

  it('конфликт между двумя заданными клетками — ноль решений', () => {
    const grid = emptyGrid();
    grid[0] = 5; // строка 0, столбец 0
    grid[1] = 5; // та же строка — повтор
    expect(countSolutions(grid)).toBe(0);
  });

  it('решённая сетка с одной убранной клеткой — решение восстанавливается однозначно', () => {
    const grid = [...SOLVED];
    grid[42] = 0;
    const result = solveGrid(grid, 2);
    expect(result.solutions).toHaveLength(1);
    expect(result.solutions[0]).toEqual(SOLVED);
  });
});

describe('findConflicts', () => {
  it('решённая сетка — конфликтов нет', () => {
    expect(findConflicts(SOLVED)).toEqual(new Set());
  });

  it('два одинаковых числа в одной строке — оба в конфликте', () => {
    const grid = emptyGrid();
    grid[0] = 7;
    grid[3] = 7; // та же строка (индексы 0 и 3 — строка 0)
    expect(findConflicts(grid)).toEqual(new Set([0, 3]));
  });

  it('пустые клетки никогда не считаются конфликтующими', () => {
    expect(findConflicts(emptyGrid())).toEqual(new Set());
  });
});

describe('generatePuzzle', () => {
  const CLUES_RANGE: Record<Difficulty, [number, number]> = {
    easy: [38, 45],
    medium: [30, 37],
    hard: [22, 29],
  };

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`${difficulty}: даёт валидный пазл с единственным решением и разумным числом подсказок`, () => {
      const puzzle = generatePuzzle(`test-${difficulty}`, difficulty);

      expect(puzzle.solution).toHaveLength(81);
      expect(isValidFullGrid(puzzle.solution)).toBe(true);
      expect(isReleasable(puzzle)).toBe(true);

      const clueCount = puzzle.givens.filter((v) => v !== 0).length;
      const [min, max] = CLUES_RANGE[difficulty];
      expect(clueCount).toBeGreaterThanOrEqual(min);
      expect(clueCount).toBeLessThanOrEqual(max);
    });
  }

  it('один и тот же seed даёт один и тот же пазл', () => {
    const a = generatePuzzle('repeatable', 'medium');
    const b = generatePuzzle('repeatable', 'medium');
    expect(a).toEqual(b);
  });

  it('разные seed почти наверняка дают разные пазлы', () => {
    const a = generatePuzzle('seed-a', 'medium');
    const b = generatePuzzle('seed-b', 'medium');
    expect(a.givens).not.toEqual(b.givens);
  });
});

describe('nextHint', () => {
  it('на полностью решённой сетке подсказок нет', () => {
    expect(nextHint(SOLVED)).toBeNull();
  });

  it('на полностью пустой сетке подсказок нет — все клетки равнозначны', () => {
    expect(nextHint(emptyGrid())).toBeNull();
  });

  it('ровно одна убранная клетка — голая единственная с верным значением', () => {
    const grid = [...SOLVED];
    grid[10] = 0;
    const hint = nextHint(grid);
    expect(hint).not.toBeNull();
    expect(hint!.technique).toBe('naked-single');
    expect(hint!.index).toBe(10);
    expect(hint!.value).toBe(SOLVED[10]);
  });

  it('на сгенерированных пазлах каждая найденная подсказка логически верна', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const puzzle = generatePuzzle(`hint-check-${difficulty}`, difficulty);
      const grid = [...puzzle.givens];
      let steps = 0;
      for (;;) {
        const hint = nextHint(grid);
        if (!hint) break;
        expect(hint.value).toBe(puzzle.solution[hint.index]);
        grid[hint.index] = hint.value;
        steps += 1;
        expect(steps).toBeLessThan(90); // предохранитель от случайного бесконечного цикла в самом тесте
      }
    }
  });

  it('игнорирует ошибочные цифры игрока при подготовке сетки для подсказки', () => {
    const grid = [...SOLVED];
    grid[0] = 4; // локально такая ошибка может не сразу образовать видимый дубль
    grid[10] = 0;

    const safe = gridForHint(grid, SOLVED);
    expect(safe[0]).toBe(0);
    expect(safe[10]).toBe(0);
    expect(safe[1]).toBe(SOLVED[1]);
    expect(grid[0]).toBe(4); // исходная сетка игрока не мутирует

    const hint = nextHint(safe);
    expect(hint?.value).toBe(SOLVED[hint!.index]);
  });
});

describe('validatePuzzle', () => {
  it('сгенерированный пазл проходит без ошибок', () => {
    const puzzle = generatePuzzle('validate-ok', 'easy');
    expect(validatePuzzle(puzzle)).toEqual([]);
  });

  it('givens противоречит solution — ошибка given-mismatch', () => {
    const puzzle = { givens: emptyGrid(), solution: SOLVED, difficulty: 'easy' as const, seed: 'x' };
    puzzle.givens[0] = 9; // SOLVED[0] === 5
    const issues = validatePuzzle(puzzle);
    expect(issues.some((i) => i.code === 'given-mismatch')).toBe(true);
  });

  it('пустые givens при валидном solution — неоднозначно (ambiguous)', () => {
    const puzzle = { givens: emptyGrid(), solution: SOLVED, difficulty: 'easy' as const, seed: 'x' };
    const issues = validatePuzzle(puzzle);
    expect(issues.some((i) => i.code === 'ambiguous')).toBe(true);
  });

  // 'no-solution' в validatePuzzle защитный, а не практически достижимый путь:
  // givens, не противоречащий given-mismatch (то есть согласованный с solution
  // поклеточно), тем самым автоматически имеет как минимум одно решение — само
  // solution. Проверка «противоречивые givens дают 0 решений» — на уровне
  // solveGrid/countSolutions, где она реально достижима (см. тесты выше).
});

describe('daily', () => {
  it('dailySeed различается по датам и стабилен для одной даты', () => {
    expect(dailySeed('2026-09-23')).toBe(dailySeed('2026-09-23'));
    expect(dailySeed('2026-09-23')).not.toBe(dailySeed('2026-09-24'));
  });

  it('difficultyForDate — чистая функция, детерминирована по дню недели', () => {
    // 2026-09-21 — понедельник.
    expect(difficultyForDate('2026-09-21')).toBe('easy');
    expect(difficultyForDate('2026-09-23')).toBe('hard');
    expect(difficultyForDate('2026-09-21')).toBe(difficultyForDate('2026-09-21'));
  });

  it('todayIso форматирует переданную дату, не берёт текущее время по умолчанию в тесте', () => {
    expect(todayIso(new Date(2026, 8, 23))).toBe('2026-09-23');
  });

  it('ежедневный пазл детерминирован: два вызова для одной даты дают одинаковый пазл', () => {
    const date = '2026-09-23';
    const a = generatePuzzle(dailySeed(date), difficultyForDate(date));
    const b = generatePuzzle(dailySeed(date), difficultyForDate(date));
    expect(a).toEqual(b);
  });
});
