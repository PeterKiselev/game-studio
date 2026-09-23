import { boxOf, colOf, rowOf } from './solver';
import { UNITS } from './units';
import type { Grid } from './types';

export type HintTechnique = 'naked-single' | 'hidden-single' | 'naked-pair';

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
 * Ищет «голую пару», которая сразу доказывает цифру в третьей клетке.
 * Две клетки одной области с одинаковыми двумя кандидатами забирают эти
 * цифры себе. Если после их исключения в другой клетке остаётся ровно один
 * кандидат, его уже можно поставить — поэтому Hint по-прежнему описывает
 * один проверяемый ход, а не молча редактирует карандашные заметки игрока.
 */
function findNakedPairPlacement(grid: Grid): Hint | null {
  for (const unit of UNITS) {
    const candidates = new Map<number, Set<number>>();
    for (const index of unit) {
      if (grid[index] === 0) candidates.set(index, candidatesFor(grid, index));
    }

    const empty = [...candidates.keys()];
    for (let a = 0; a < empty.length; a += 1) {
      const firstIndex = empty[a];
      const first = candidates.get(firstIndex)!;
      if (first.size !== 2) continue;
      const pairDigits = [...first].sort((x, y) => x - y);

      for (let b = a + 1; b < empty.length; b += 1) {
        const secondIndex = empty[b];
        const second = candidates.get(secondIndex)!;
        if (second.size !== 2 || pairDigits.some((digit) => !second.has(digit))) continue;
        const samePairCount = empty.filter((index) => {
          const set = candidates.get(index)!;
          return set.size === 2 && pairDigits.every((digit) => set.has(digit));
        }).length;
        if (samePairCount !== 2) continue;

        for (const index of empty) {
          if (index === firstIndex || index === secondIndex) continue;
          const original = candidates.get(index)!;
          if (original.size < 2 || !pairDigits.some((digit) => original.has(digit))) continue;
          const reduced = [...original].filter((digit) => !first.has(digit));
          if (reduced.length !== 1) continue;

          const value = reduced[0];
          return {
            index,
            value,
            technique: 'naked-pair',
            text:
              `Клетки (${describeCell(firstIndex)}) и (${describeCell(secondIndex)}) образуют пару ` +
              `${pairDigits[0]}/${pairDigits[1]}. Эти цифры заняты парой, поэтому в клетке ` +
              `(${describeCell(index)}) остаётся только ${value}.`,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Следующий объяснимый шаг: сперва голая единственная (у клетки ровно один
 * кандидат), затем скрытая единственная (цифра умещается только в одну
 * клетку внутри строки/столбца/квадрата), затем голая пара — по духу того же паттерна, что
 * nextHint() в packages/rules/src/deduction/board.ts: подсказка объясняет
 * ход, а не просто сверяется с готовым решением.
 *
 * Возвращает null, если ни одна из трёх техник шаг не находит — это
 * ожидаемо на Сложном уровне, не все пазлы там решаются этими тремя
 * приёмами. Кнопка подсказки в игре в этом случае прячется, а не
 * подсовывает игроку ответ напрямую сверкой с решением: то было бы не
 * подсказкой, а сливом.
 */
export function nextHint(grid: Grid): Hint | null {
  return findNakedSingle(grid) ?? findHiddenSingle(grid) ?? findNakedPairPlacement(grid);
}

export type TechniqueCounts = Record<HintTechnique, number>;

/** Разбирает объяснимый путь от исходной сетки без обращения к решению. */
export function analyzeTechniques(givens: Grid): { counts: TechniqueCounts; solved: boolean } {
  const grid = [...givens];
  const counts: TechniqueCounts = { 'naked-single': 0, 'hidden-single': 0, 'naked-pair': 0 };
  for (let guard = 0; guard < 81; guard += 1) {
    const hint = nextHint(grid);
    if (!hint) break;
    counts[hint.technique] += 1;
    grid[hint.index] = hint.value;
  }
  return { counts, solved: grid.every((value) => value !== 0) };
}
