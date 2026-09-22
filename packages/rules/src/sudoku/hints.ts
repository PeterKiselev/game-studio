import { boxOf, colOf, rowOf } from './solver';
import { UNITS } from './units';
import type { Grid } from './types';

export type HintTechnique = 'naked-single' | 'hidden-single';

export interface Hint {
  index: number;
  value: number;
  technique: HintTechnique;
  text: string;
}

/**
 * Подсказка должна рассуждать только от уже верных посылок. Ошибочная
 * цифра игрока может не конфликтовать локально со строкой/столбцом, но всё
 * равно вести к ложному единственному кандидату. Такие цифры временно
 * считаем пустыми; исходную сетку функция не изменяет.
 */
export function gridForHint(grid: Grid, solution: Grid): Grid {
  return grid.map((value, index) => (value === solution[index] ? value : 0));
}

function candidatesFor(grid: Grid, index: number): Set<number> {
  const used = new Set<number>();
  const r = rowOf(index);
  const c = colOf(index);
  const b = boxOf(index);
  for (let i = 0; i < 81; i += 1) {
    if (grid[i] === 0) continue;
    if (rowOf(i) === r || colOf(i) === c || boxOf(i) === b) used.add(grid[i]);
  }
  const out = new Set<number>();
  for (let digit = 1; digit <= 9; digit += 1) {
    if (!used.has(digit)) out.add(digit);
  }
  return out;
}

function describeCell(index: number): string {
  return `строка ${rowOf(index) + 1}, столбец ${colOf(index) + 1}`;
}

function findNakedSingle(grid: Grid): Hint | null {
  for (let i = 0; i < 81; i += 1) {
    if (grid[i] !== 0) continue;
    const candidates = candidatesFor(grid, i);
    if (candidates.size === 1) {
      const value = [...candidates][0];
      return {
        index: i,
        value,
        technique: 'naked-single',
        text:
          `В клетке (${describeCell(i)}) может стоять только ${value} — все остальные цифры ` +
          'уже заняты в этой строке, столбце или квадрате.',
      };
    }
  }
  return null;
}

function findHiddenSingle(grid: Grid): Hint | null {
  for (const unit of UNITS) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const spots = unit.filter((i) => grid[i] === 0 && candidatesFor(grid, i).has(digit));
      if (spots.length === 1) {
        const index = spots[0];
        return {
          index,
          value: digit,
          technique: 'hidden-single',
          text: `В этой области цифра ${digit} может стоять только в клетке (${describeCell(index)}).`,
        };
      }
    }
  }
  return null;
}

/**
 * Следующий объяснимый шаг: сперва голая единственная (у клетки ровно один
 * кандидат), затем скрытая единственная (цифра умещается только в одну
 * клетку внутри строки/столбца/квадрата) — по духу того же паттерна, что
 * nextHint() в packages/rules/src/deduction/board.ts: подсказка объясняет
 * ход, а не просто сверяется с готовым решением.
 *
 * Возвращает null, если ни одна из двух техник шаг не находит — это
 * ожидаемо на Сложном уровне, не все пазлы там решаются этими двумя
 * приёмами. Кнопка подсказки в игре в этом случае прячется, а не
 * подсовывает игроку ответ напрямую сверкой с решением: то было бы не
 * подсказкой, а сливом.
 */
export function nextHint(grid: Grid): Hint | null {
  return findNakedSingle(grid) ?? findHiddenSingle(grid);
}
