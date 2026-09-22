import { UNITS } from './units';
import type { Grid } from './types';

/**
 * Индексы клеток, у которых то же число уже стоит в той же строке,
 * столбце или квадрате — для живой подсветки в интерфейсе. Это проверка
 * ЛОКАЛЬНЫХ правил судоку, не сверка с решением: игрок узнаёт, что нарушил
 * правило, но не получает подсказку значения — решение сюда не передаётся
 * и передаваться не должно.
 */
export function findConflicts(grid: Grid): Set<number> {
  const conflicts = new Set<number>();
  for (const unit of UNITS) {
    const byValue = new Map<number, number[]>();
    for (const index of unit) {
      const value = grid[index];
      if (value === 0) continue;
      const indices = byValue.get(value);
      if (indices) indices.push(index);
      else byValue.set(value, [index]);
    }
    for (const indices of byValue.values()) {
      if (indices.length > 1) for (const index of indices) conflicts.add(index);
    }
  }
  return conflicts;
}
