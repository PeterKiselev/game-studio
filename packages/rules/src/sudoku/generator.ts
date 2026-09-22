import { boxOf, colOf, countSolutions, rowOf, TooHeavyError } from './solver';
import { hashSeed, mulberry32, shuffle } from './rng';
import type { Difficulty, Grid, Puzzle } from './types';

/**
 * Диапазон подсказок (заполненных клеток) на старте по сложности. Границы —
 * стандартные ориентиры для классического судоку, не претендуют на точную
 * калибровку по техникам решения (это отдельная, более поздняя работа).
 */
const CLUES_BY_DIFFICULTY: Record<Difficulty, readonly [min: number, max: number]> = {
  easy: [38, 45],
  medium: [30, 37],
  hard: [22, 29],
};

/**
 * Сколько раз пробовать сгенерировать пазл заново (с новым производным seed),
 * если конкретная попытка не смогла набрать нужное число подсказок или
 * упёрлась в предохранитель решателя. Ограничено — так же, как решатель
 * ограничен MAX_SOLVE_STEPS, генератор не должен зависать без ответа.
 */
const MAX_GENERATION_ATTEMPTS = 20;

function emptyGrid(): Grid {
  return new Array<number>(81).fill(0);
}

function canPlace(grid: Grid, index: number, digit: number): boolean {
  const r = rowOf(index);
  const c = colOf(index);
  const b = boxOf(index);
  for (let i = 0; i < 81; i += 1) {
    if (grid[i] !== digit) continue;
    if (rowOf(i) === r || colOf(i) === c || boxOf(i) === b) return false;
  }
  return true;
}

/** Полная решённая сетка, заполненная бэктрекингом в случайном (по rand) порядке цифр. */
function fillSolvedGrid(rand: () => number): Grid {
  const grid = emptyGrid();
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function fill(pos: number): boolean {
    if (pos === 81) return true;
    for (const digit of shuffle(digits, rand)) {
      if (!canPlace(grid, pos, digit)) continue;
      grid[pos] = digit;
      if (fill(pos + 1)) return true;
      grid[pos] = 0;
    }
    return false;
  }

  fill(0);
  return grid;
}

/**
 * Генерирует пазл: сначала полное случайное решение, затем убирает клетки
 * в случайном порядке, каждый раз проверяя countSolutions() === 1 — точно
 * так же по духу, как валидатор дел в deduction/validate.ts проверяет
 * единственность решения, только тут это часть самой генерации, а не
 * последующей проверки чужого контента.
 *
 * Один и тот же seed всегда даёт один и тот же пазл — на этом держится
 * ежедневный режим (см. daily.ts): у всех игроков в один день одна и та
 * же головоломка.
 */
export function generatePuzzle(seed: string, difficulty: Difficulty): Puzzle {
  const [minClues, maxClues] = CLUES_BY_DIFFICULTY[difficulty];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const rand = mulberry32(hashSeed(`${seed}#${attempt}`));
    const solution = fillSolvedGrid(rand);
    const targetClues = minClues + Math.floor(rand() * (maxClues - minClues + 1));

    const order = shuffle(
      Array.from({ length: 81 }, (_, i) => i),
      rand,
    );
    const givens = [...solution];
    let clues = 81;

    try {
      for (const index of order) {
        if (clues <= targetClues) break;
        const backup = givens[index];
        givens[index] = 0;
        if (countSolutions(givens, 2) === 1) {
          clues -= 1;
        } else {
          givens[index] = backup;
        }
      }
    } catch (error) {
      if (error instanceof TooHeavyError) continue; // эта попытка не удалась — пробуем заново с новым seed
      throw error;
    }

    if (clues <= maxClues) {
      return { givens, solution, difficulty, seed };
    }
    // Не набрали нужную разрежённость за один проход по order — новая попытка.
  }

  throw new TooHeavyError();
}
