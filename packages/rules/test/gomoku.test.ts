import { describe, expect, it } from 'vitest';
import {
  GOMOKU,
  TIC_TAC_TOE,
  canPlay,
  createGame,
  play,
  undo,
} from '../src/gomoku';
import { bestMove } from '../src/gomoku.ai';
import type { GameState } from '../src/gomoku';

/** Прогоняет список ходов подряд — компактная запись партии в тестах. */
function run(state: GameState, moves: number[]): GameState {
  return moves.reduce((s, m) => play(s, m), state);
}

describe('правила линии', () => {
  it('крестики-нолики: горизонталь побеждает', () => {
    // X: 0,1,2   O: 3,4
    const s = run(createGame(TIC_TAC_TOE), [0, 3, 1, 4, 2]);
    expect(s.outcome).toBe(1);
    expect(s.winLine).toEqual([0, 1, 2]);
  });

  it('крестики-нолики: диагональ побеждает', () => {
    const s = run(createGame(TIC_TAC_TOE), [0, 1, 4, 2, 8]);
    expect(s.outcome).toBe(1);
    expect(s.winLine).toEqual([0, 4, 8]);
  });

  it('крестики-нолики: заполненное поле без линии — ничья', () => {
    // X O X / X O O / O X X
    const s = run(createGame(TIC_TAC_TOE), [0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(s.outcome).toBe(3);
    expect(s.winLine).toBeNull();
  });

  it('нельзя ходить в занятую клетку и после конца партии', () => {
    const s = run(createGame(TIC_TAC_TOE), [0, 3, 1, 4, 2]);
    expect(canPlay(s, 5)).toBe(false); // партия окончена
    const fresh = play(createGame(TIC_TAC_TOE), 0);
    expect(canPlay(fresh, 0)).toBe(false); // клетка занята
    expect(play(fresh, 0)).toBe(fresh); // состояние не меняется
  });

  it('ход не мутирует предыдущее состояние', () => {
    const a = createGame(TIC_TAC_TOE);
    const b = play(a, 4);
    expect(a.board[4]).toBe(0);
    expect(b.board[4]).toBe(1);
    expect(a.turn).toBe(1);
    expect(b.turn).toBe(2);
  });

  it('undo откатывает нужное число ходов', () => {
    const s = run(createGame(TIC_TAC_TOE), [0, 3, 1, 4]);
    const back = undo(s, 2);
    expect(back.moves).toEqual([0, 3]);
    expect(back.turn).toBe(1);
    expect(back.board[1]).toBe(0);
  });

  it('гомоку: пять в ряд побеждает, четырёх мало', () => {
    const size = GOMOKU.size;
    const row = (n: number) => 7 * size + n; // середина поля
    const four = run(createGame(GOMOKU), [row(3), 0, row(4), 1, row(5), 2, row(6)]);
    expect(four.outcome).toBe(0);
    const five = play(four, 3);
    expect(play(five, row(7)).outcome).toBe(1);
  });
});

describe('бот', () => {
  it('забирает победу, когда она есть', () => {
    // X стоит на 0 и 1, свободна 2 — бот обязан закрыть линию
    const s = run(createGame(TIC_TAC_TOE), [0, 4, 1, 5]);
    expect(bestMove(s, 3)).toBe(2);
  });

  it('блокирует победу соперника на сложном уровне', () => {
    // Ход O. X угрожает линией 0-1-2
    const s = run(createGame(TIC_TAC_TOE), [0, 4, 1]);
    expect(bestMove(s, 3)).toBe(2);
  });

  it('ходит в центр первым ходом на большом поле', () => {
    const s = createGame(GOMOKU);
    expect(bestMove(s, 2)).toBe(Math.floor(s.board.length / 2));
  });

  it('всегда возвращает свободную клетку', () => {
    let s = createGame(TIC_TAC_TOE);
    for (let i = 0; i < 9 && s.outcome === 0; i += 1) {
      const move = bestMove(s, 2);
      expect(s.board[move]).toBe(0);
      s = play(s, move);
    }
    expect(s.outcome).not.toBe(0);
  });
});
