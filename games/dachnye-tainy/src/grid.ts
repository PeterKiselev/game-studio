import { el } from '@studio/ui';
import { markKey } from '@studio/rules';
import type { Category, MarkValue, PlayerMarks, Ref } from '@studio/rules';

/**
 * Одна попарная сетка «категория A × категория B» — то, что игрок реально
 * видит и трогает. Классическая логическая головоломка с N категориями
 * рисуется как несколько таких сеток подряд, а не одна большая: у нас
 * в tutorial-деле три категории — «кто», «где», «что» — значит, три сетки
 * (кто×где, кто×что, где×что), стопкой одна под другой.
 *
 * Клик по клетке циклит unknown → yes → no → unknown. Отметка «да» сразу
 * гасит остальную строку и столбец — это подсказка интерфейса игроку
 * («одна сущность — одно значение»), а не логический вывод движка:
 * настоящие выводы остаются в @studio/rules/deduction, эта функция ими
 * не занимается, только рисует и собирает клики.
 */

export interface GridHandle {
  root: HTMLElement;
  /** Перерисовать состояние клеток из текущих marks. Вызывать после любого изменения. */
  refresh: () => void;
}

export function renderPairGrid(
  rowCat: Category,
  colCat: Category,
  marks: PlayerMarks,
  onChange: (a: Ref, b: Ref, next: MarkValue | null) => void,
  hintedKey: string | null,
): GridHandle {
  const table = el('div', { class: 'grid-table' });
  table.style.gridTemplateColumns = `auto repeat(${colCat.values.length}, 34px)`;

  const cellButtons = new Map<string, HTMLButtonElement>();

  table.append(el('div', { class: 'corner' }));
  for (const colValue of colCat.values) {
    table.append(el('div', { class: 'h' }, colValue));
  }

  for (const rowValue of rowCat.values) {
    table.append(el('div', { class: 'row-label' }, rowValue));
    for (const colValue of colCat.values) {
      const a: Ref = { category: rowCat.id, value: rowValue };
      const b: Ref = { category: colCat.id, value: colValue };
      const key = markKey(a, b);

      const btn = el('button', { class: 'cell', type: 'button' }) as HTMLButtonElement;
      btn.setAttribute('aria-label', `${rowValue} — ${colValue}`);
      btn.addEventListener('click', () => {
        const current = marks[key];
        const next: MarkValue | null = current === undefined ? 'yes' : current === 'yes' ? 'no' : null;
        onChange(a, b, next);
      });

      cellButtons.set(key, btn);
      table.append(btn);
    }
  }

  const refresh = (): void => {
    for (const [key, btn] of cellButtons) {
      const value = marks[key];
      btn.textContent = value === 'yes' ? '✓' : value === 'no' ? '✕' : '';
      btn.classList.toggle('yes', value === 'yes');
      btn.classList.toggle('no', value === 'no');
      btn.classList.toggle('hinted', key === hintedKey);
    }
  };
  refresh();

  const root = el(
    'div',
    { class: 'grid-block' },
    el('div', { class: 'label' }, `${rowCat.title} × ${colCat.title}`),
    table,
  );

  return { root, refresh };
}
