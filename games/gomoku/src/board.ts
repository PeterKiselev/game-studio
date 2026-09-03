import { el, haptic } from '@studio/ui';
import type { GameState } from '@studio/rules';

/**
 * Поле на обычных DOM-кнопках, а не на canvas.
 *
 * Для настольных игр это осознанный выбор: бесплатно получаем фокус с клавиатуры,
 * скринридер, ретину без ручного масштабирования и нулевой вес — canvas тут
 * не даёт ничего, кроме лишнего кода.
 */
export class BoardView {
  readonly root: HTMLElement;
  private grid: HTMLElement;
  private cells: HTMLButtonElement[] = [];
  private size = 0;
  private locked = false;

  constructor(private onPick: (index: number) => void) {
    this.grid = el('div', { class: 'board' });
    this.root = el('div', { class: 'board-wrap' }, this.grid);

    this.grid.addEventListener('click', (event) => {
      if (this.locked) return;
      const target = (event.target as HTMLElement).closest('.cell') as HTMLButtonElement | null;
      if (!target || target.disabled) return;
      haptic();
      this.onPick(Number(target.dataset.i));
    });

    window.addEventListener('resize', () => this.fit());
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  /** Пересобирает сетку только при смене размера поля, иначе просто обновляет клетки. */
  render(state: GameState): void {
    if (this.size !== state.cfg.size) {
      this.size = state.cfg.size;
      this.grid.replaceChildren();
      this.cells = [];
      this.grid.style.gridTemplateColumns = `repeat(${this.size}, var(--cell))`;
      for (let i = 0; i < this.size * this.size; i += 1) {
        const cell = el('button', { class: 'cell', type: 'button' }) as HTMLButtonElement;
        cell.dataset.i = String(i);
        cell.style.width = 'var(--cell)';
        cell.style.height = 'var(--cell)';
        cell.setAttribute('aria-label', cellLabel(i, this.size));
        this.cells.push(cell);
        this.grid.append(cell);
      }
      this.fit();
    }

    const winSet = new Set(state.winLine ?? []);
    for (let i = 0; i < this.cells.length; i += 1) {
      const cell = this.cells[i];
      const value = state.board[i];
      const wanted = value === 0 ? '' : String(value);

      if (cell.dataset.v !== wanted) {
        cell.dataset.v = wanted;
        cell.replaceChildren();
        if (value !== 0) cell.append(el('div', { class: `mark s${value}` }));
      }

      cell.disabled = value !== 0 || state.outcome !== 0;
      cell.classList.toggle('win', winSet.has(i));
    }
  }

  /** Клетка должна быть крупной на маленьком поле и мелкой на большом. */
  private fit(): void {
    if (!this.size) return;
    const box = this.root.getBoundingClientRect();
    const available = Math.min(box.width, box.height) - 12;
    const raw = Math.floor((available - (this.size + 1) * 2) / this.size);
    const max = this.size <= 5 ? 92 : 40;
    const cell = Math.max(18, Math.min(max, raw));
    this.grid.style.setProperty('--cell', `${cell}px`);
  }
}

function cellLabel(index: number, size: number): string {
  const x = (index % size) + 1;
  const y = Math.floor(index / size) + 1;
  return `клетка ${x} на ${y}`;
}
