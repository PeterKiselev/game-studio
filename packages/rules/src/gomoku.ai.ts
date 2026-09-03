import { canPlay, emptyCells, findLine, other, play } from './gomoku';
import type { Cell, GameState, RulesConfig, Side } from './gomoku';

export type Level = 1 | 2 | 3;

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/**
 * Бот трёх уровней. Никакого глубокого перебора: на казуальной аудитории
 * важнее, чтобы бот играл «по-человечески» и иногда ошибался, чем чтобы
 * он был непобедим. Первый уровень должен проигрывать — иначе игрок уйдёт.
 */
export function bestMove(state: GameState, level: Level, rng: () => number = Math.random): number {
  const options = emptyCells(state);
  if (options.length === 0) return -1;

  // Первый ход на пустом большом поле — в центр, иначе партия выглядит вяло.
  if (state.moves.length === 0 && state.cfg.size > 3) {
    return Math.floor(state.board.length / 2);
  }

  const me = state.turn;
  const foe = other(me);

  // 1. Выиграть сейчас, если можно.
  const winning = options.find((i) => wouldWin(state, i, me));
  if (winning !== undefined) return winning;

  // 2. Не дать выиграть сопернику. Первый уровень иногда «не замечает».
  const blocking = options.find((i) => wouldWin(state, i, foe));
  if (blocking !== undefined && (level > 1 || rng() > 0.35)) return blocking;

  // 3. Позиционная оценка. Смотрим только клетки рядом с занятыми —
  //    на 15x15 это сокращает перебор с 225 до пары десятков.
  const candidates = level === 1 ? options : neighbourhood(state, options);
  const scored = candidates.map((i) => ({
    i,
    score: cellScore(state, i, me) * 1.05 + cellScore(state, i, foe),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Уровень задаёт, насколько строго бот придерживается лучшего хода.
  const window = level === 3 ? 1 : level === 2 ? 3 : 6;
  const pick = scored.slice(0, Math.min(window, scored.length));
  return pick[Math.floor(rng() * pick.length)].i;
}

function wouldWin(state: GameState, index: number, side: Side): boolean {
  if (!canPlay(state, index)) return false;
  const board = state.board.slice();
  board[index] = side;
  return findLine(board, state.cfg, index, side) !== null;
}

/** Клетки в радиусе 2 от уже занятых — единственные, что имеют смысл на большом поле. */
function neighbourhood(state: GameState, options: number[]): number[] {
  if (state.moves.length === 0) return options;
  const { size } = state.cfg;
  const near = options.filter((i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (state.board[ny * size + nx] !== 0) return true;
      }
    }
    return false;
  });
  return near.length ? near : options;
}

/**
 * Оценка клетки для стороны side: сумма по четырём направлениям.
 * Открытая с двух сторон линия ценится заметно выше закрытой — именно
 * из этого рождается осмысленная игра без всякого перебора.
 */
function cellScore(state: GameState, index: number, side: Side): number {
  const { cfg, board } = state;
  const { size, win } = cfg;
  const x0 = index % size;
  const y0 = Math.floor(index / size);
  let total = 0;

  for (const [dx, dy] of DIRECTIONS) {
    let count = 1;
    let openEnds = 0;

    for (const sign of [1, -1] as const) {
      let x = x0 + dx * sign;
      let y = y0 + dy * sign;
      while (inside(x, y, size) && board[y * size + x] === side) {
        count += 1;
        x += dx * sign;
        y += dy * sign;
      }
      if (inside(x, y, size) && board[y * size + x] === 0) openEnds += 1;
    }

    if (count + openEnds < win) continue; // линию уже не достроить — она бесполезна
    total += lineValue(count, openEnds, win);
  }

  return total;
}

function lineValue(count: number, openEnds: number, win: number): number {
  if (count >= win) return 1_000_000;
  if (openEnds === 0) return 0;
  const base = Math.pow(10, count);
  return openEnds === 2 ? base * 2 : base;
}

function inside(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

/** Удобная обёртка: сделать ход ботом. */
export function botPlay(state: GameState, level: Level): GameState {
  const move = bestMove(state, level);
  return move < 0 ? state : play(state, move);
}

export type { Cell, RulesConfig };
