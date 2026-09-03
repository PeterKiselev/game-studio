/**
 * Правила «линия из N в ряд» — одно ядро на две игры:
 *   TIC_TAC_TOE — поле 3x3, победа за 3;
 *   GOMOKU      — поле 15x15, победа за 5.
 *
 * Модуль абсолютно чистый: ни DOM, ни таймеров, ни рандома без переданного сида.
 * Именно поэтому его можно покрыть тестами на 100% и переиспользовать на сервере
 * для сетевых партий без единой правки.
 */

export type Cell = 0 | 1 | 2;
export type Side = 1 | 2;
/** 0 — партия идёт, 1 и 2 — победитель, 3 — ничья. */
export type Outcome = 0 | 1 | 2 | 3;

export interface RulesConfig {
  size: number;
  win: number;
}

export const TIC_TAC_TOE: RulesConfig = { size: 3, win: 3 };
export const GOMOKU: RulesConfig = { size: 15, win: 5 };

export interface GameState {
  cfg: RulesConfig;
  board: Cell[];
  turn: Side;
  outcome: Outcome;
  /** Индексы победной линии — для подсветки. */
  winLine: number[] | null;
  /** История ходов, нужна для undo. */
  moves: number[];
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // горизонталь
  [0, 1], // вертикаль
  [1, 1], // диагональ вниз-вправо
  [1, -1], // диагональ вверх-вправо
];

export function createGame(cfg: RulesConfig): GameState {
  return {
    cfg,
    board: new Array<Cell>(cfg.size * cfg.size).fill(0),
    turn: 1,
    outcome: 0,
    winLine: null,
    moves: [],
  };
}

export function canPlay(state: GameState, index: number): boolean {
  return (
    state.outcome === 0 &&
    index >= 0 &&
    index < state.board.length &&
    state.board[index] === 0
  );
}

/** Все ходы иммутабельны: старое состояние остаётся валидным для undo и реплеев. */
export function play(state: GameState, index: number): GameState {
  if (!canPlay(state, index)) return state;

  const board = state.board.slice();
  board[index] = state.turn;

  const winLine = findLine(board, state.cfg, index, state.turn);
  const full = board.every((c) => c !== 0);
  const outcome: Outcome = winLine ? state.turn : full ? 3 : 0;

  return {
    cfg: state.cfg,
    board,
    turn: outcome === 0 ? other(state.turn) : state.turn,
    outcome,
    winLine,
    moves: [...state.moves, index],
  };
}

/** Откат N последних ходов. Используется кнопкой undo и наградой за rewarded. */
export function undo(state: GameState, count = 1): GameState {
  const moves = state.moves.slice(0, Math.max(0, state.moves.length - count));
  let next = createGame(state.cfg);
  for (const move of moves) next = play(next, move);
  return next;
}

export function other(side: Side): Side {
  return side === 1 ? 2 : 1;
}

export function emptyCells(state: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.board.length; i += 1) if (state.board[i] === 0) out.push(i);
  return out;
}

/**
 * Ищет победную линию, проходящую через только что занятую клетку.
 * Возвращает индексы линии или null. Считаем от последнего хода, а не
 * сканируем всё поле — на 15x15 это разница в два порядка.
 */
export function findLine(
  board: Cell[],
  cfg: RulesConfig,
  index: number,
  side: Side,
): number[] | null {
  const { size, win } = cfg;
  const x0 = index % size;
  const y0 = Math.floor(index / size);

  for (const [dx, dy] of DIRECTIONS) {
    const line: number[] = [index];

    for (const sign of [1, -1] as const) {
      let x = x0 + dx * sign;
      let y = y0 + dy * sign;
      while (x >= 0 && x < size && y >= 0 && y < size && board[y * size + x] === side) {
        line.push(y * size + x);
        x += dx * sign;
        y += dy * sign;
      }
    }

    if (line.length >= win) return line.sort((a, b) => a - b);
  }

  return null;
}
