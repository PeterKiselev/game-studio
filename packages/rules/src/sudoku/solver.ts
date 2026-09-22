import type { Grid } from './types';

const SIZE = 9;
const BOX = 3;
const FULL_MASK = 0x1ff; // девять младших бит — кандидаты 1..9

export function rowOf(index: number): number {
  return Math.floor(index / SIZE);
}

export function colOf(index: number): number {
  return index % SIZE;
}

export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / BOX) * BOX + Math.floor(colOf(index) / BOX);
}

function popcount(mask: number): number {
  let x = mask - ((mask >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/**
 * Предохранитель на число посещённых узлов перебора — та же роль, что у
 * MAX_ASSIGNMENTS в packages/rules/src/deduction/solve.ts: без него
 * генератор пазлов, случайно свернувший не туда, способен подвесить вкладку.
 * Значение щедрое: обычный судоку-перебор с MRV находит решение за
 * считанные тысячи узлов, 200 000 — многократный запас, а не рабочий потолок.
 */
export const MAX_SOLVE_STEPS = 200_000;

export interface SolveResult {
  solutions: Grid[];
  /** Сколько узлов перебора реально посещено — для оценки сложности в тестах. */
  visited: number;
  /** Перебор остановлен предохранителем, ответ неполный. */
  aborted: boolean;
}

/**
 * Решает сетку бэктрекингом с битовыми масками по строкам/столбцам/квадратам
 * и эвристикой MRV (следующей выбирается клетка с наименьшим числом
 * кандидатов) — для сеток судоку это на порядки быстрее, чем перебор без
 * эвристики, и совпадений решений собирает не больше limit: для проверки
 * единственности достаточно найти два и остановиться.
 */
export function solveGrid(grid: Grid, limit = 2): SolveResult {
  const cells = [...grid];
  const rows = new Array<number>(SIZE).fill(0);
  const cols = new Array<number>(SIZE).fill(0);
  const boxes = new Array<number>(SIZE).fill(0);
  const empties: number[] = [];

  // Конфликт между двумя уже заданными клетками (не то, что решает перебор,
  // а сама входная сетка противоречива) — раньше эта проверка отсутствовала,
  // и OR битовых масок молча «съедал» повтор: два одинаковых given в одной
  // строке не отличались по маске от одного given, и решатель находил
  // «решения», на деле нарушающие судоку в самих исходных клетках. Ноль
  // решений — честный ответ на противоречивые givens, не решатель должен
  // об этом молчать.
  for (let i = 0; i < 81; i += 1) {
    const value = cells[i];
    if (value === 0) {
      empties.push(i);
      continue;
    }
    const bit = 1 << (value - 1);
    const r = rowOf(i);
    const c = colOf(i);
    const b = boxOf(i);
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) {
      return { solutions: [], visited: 0, aborted: false };
    }
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }

  const solutions: Grid[] = [];
  let visited = 0;
  let aborted = false;

  function step(): boolean {
    visited += 1;
    if (visited > MAX_SOLVE_STEPS) {
      aborted = true;
      return true;
    }

    let bestIndex = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (const i of empties) {
      if (cells[i] !== 0) continue;
      const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & FULL_MASK;
      const count = popcount(mask);
      if (count < bestCount) {
        bestCount = count;
        bestIndex = i;
        bestMask = mask;
        if (count === 0) break; // тупик — дальше некуда, прерываем поиск сразу
      }
    }

    if (bestIndex === -1) {
      // Пустых клеток не осталось — валидное полное решение.
      solutions.push([...cells]);
      return solutions.length >= limit;
    }
    if (bestCount === 0) return false; // тупик: у клетки нет ни одного кандидата

    const r = rowOf(bestIndex);
    const c = colOf(bestIndex);
    const b = boxOf(bestIndex);
    for (let digit = 1; digit <= 9; digit += 1) {
      const bit = 1 << (digit - 1);
      if (!(bestMask & bit)) continue;
      cells[bestIndex] = digit;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (step()) return true;
      cells[bestIndex] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    return false;
  }

  step();
  return { solutions, visited, aborted };
}

/**
 * Перебор запрещён предохранителем — то же решение, что и в deduction/solve.ts:
 * отдельная ошибка, а не молчаливый «0 решений», потому что «не проверено»
 * и «решений нет» — разные утверждения, и путать их нельзя.
 */
export class TooHeavyError extends Error {
  constructor() {
    super(
      `Перебор превысил предохранитель в ${MAX_SOLVE_STEPS.toLocaleString('ru')} узлов — ` +
        'единственность решения не проверена.',
    );
    this.name = 'TooHeavyError';
  }
}

/** Сколько решений у сетки: 0, 1 или limit (limit означает «limit или больше»). Бросает TooHeavyError при абортe. */
export function countSolutions(grid: Grid, limit = 2): number {
  const result = solveGrid(grid, limit);
  if (result.aborted) throw new TooHeavyError();
  return result.solutions.length;
}

/** Единственное решение сетки или null, если решений нет либо их несколько. */
export function uniqueSolution(grid: Grid): Grid | null {
  const result = solveGrid(grid, 2);
  if (result.aborted) throw new TooHeavyError();
  return result.solutions.length === 1 ? result.solutions[0] : null;
}
