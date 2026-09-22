import { el } from '@studio/ui';

export interface GridHandle {
  root: HTMLElement;
  /** Перерисовать клетки из текущего состояния. Вызывать после любого изменения. */
  refresh: () => void;
}

export interface GridState {
  grid: readonly number[];
  notes: ReadonlyArray<readonly number[]>;
  conflicts: ReadonlySet<number>;
  hintedIndex: number | null;
  selected: number | null;
}

/**
 * Сетка судоку 9×9. В отличие от переключателя ✓/✕/пусто в «Дачных тайнах» —
 * клик по клетке не циклит значение сам, а только выбирает клетку: само
 * число вводится цифровой панелью под сеткой. При девяти возможных
 * значениях цикл кликом занял бы до девяти тапов на одну клетку — панель
 * даёт значение за один.
 *
 * Всё изменчивое состояние (grid/notes/conflicts/hintedIndex/selected)
 * читается через getState() заново при каждом refresh(), а не захватывается
 * один раз при создании — иначе перерисовка показывала бы состояние на
 * момент вызова renderSudokuGrid(), а не текущее.
 */
export function renderSudokuGrid(givens: readonly number[], getState: () => GridState, onSelect: (index: number) => void): GridHandle {
  const table = el('div', { class: 'sudoku-grid' });
  const cells: HTMLButtonElement[] = [];

  for (let i = 0; i < 81; i += 1) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const btn = el('button', { class: 'sudoku-cell', type: 'button' }) as HTMLButtonElement;
    btn.setAttribute('aria-label', `строка ${row + 1}, столбец ${col + 1}`);
    if (givens[i] !== 0) btn.classList.add('given');
    if (col % 3 === 0) btn.classList.add('box-left');
    if (row % 3 === 0) btn.classList.add('box-top');
    btn.addEventListener('click', () => {
      if (givens[i] !== 0) return; // клетки-подсказки нельзя выбрать и изменить
      onSelect(i);
    });
    cells.push(btn);
    table.append(btn);
  }

  const refresh = (): void => {
    const state = getState();
    for (let i = 0; i < 81; i += 1) {
      const btn = cells[i];
      const value = state.grid[i];
      btn.classList.toggle('selected', i === state.selected);
      btn.classList.toggle('conflict', state.conflicts.has(i));
      btn.classList.toggle('hinted', i === state.hintedIndex);

      if (value !== 0) {
        btn.classList.remove('notes');
        btn.replaceChildren(document.createTextNode(String(value)));
      } else {
        const cellNotes = state.notes[i];
        if (cellNotes && cellNotes.length > 0) {
          btn.classList.add('notes');
          btn.replaceChildren(renderNotes(cellNotes));
        } else {
          btn.classList.remove('notes');
          btn.replaceChildren();
        }
      }
    }
  };
  refresh();

  return { root: table, refresh };
}

function renderNotes(values: readonly number[]): HTMLElement {
  const set = new Set(values);
  const grid = el('div', { class: 'notes-grid' });
  for (let d = 1; d <= 9; d += 1) {
    grid.append(el('span', {}, set.has(d) ? String(d) : ''));
  }
  return grid;
}
