import { describe, expect, it } from 'vitest';
import { checkNewAchievements, starsFor } from '../src/achievements';
import type { sudoku } from '@studio/rules';

type Difficulty = sudoku.Difficulty;

function seen(...difficulties: Difficulty[]): Set<Difficulty> {
  return new Set(difficulties);
}

describe('starsFor', () => {
  it('3 звезды без ошибок и подсказок', () => {
    expect(starsFor(0, 0)).toBe(3);
  });

  it('2 звезды при небольшом числе ошибок/подсказок', () => {
    expect(starsFor(2, 1)).toBe(2);
    expect(starsFor(0, 1)).toBe(2);
    expect(starsFor(2, 0)).toBe(2);
  });

  it('1 звезда при заметном числе ошибок или подсказок', () => {
    expect(starsFor(3, 0)).toBe(1);
    expect(starsFor(0, 2)).toBe(1);
    expect(starsFor(5, 5)).toBe(1);
  });
});

describe('checkNewAchievements', () => {
  const base = {
    mistakes: 1,
    hintsUsed: 1,
    puzzlesCompletedCount: 2,
    streak: 0,
    flawlessCount: 0,
    difficultiesSeen: seen('easy'),
  };

  it('first_puzzle только на первом решённом пазле и только если ещё не открыто', () => {
    expect(checkNewAchievements(new Set(), { ...base, puzzlesCompletedCount: 1 })).toContain('first_puzzle');
    expect(
      checkNewAchievements(new Set(['first_puzzle']), { ...base, puzzlesCompletedCount: 1 }),
    ).not.toContain('first_puzzle');
  });

  it('flawless только без ошибок и подсказок в этом самом решении', () => {
    expect(checkNewAchievements(new Set(), { ...base, mistakes: 0, hintsUsed: 0 })).toContain('flawless');
    expect(checkNewAchievements(new Set(), { ...base, mistakes: 1, hintsUsed: 0 })).not.toContain('flawless');
    expect(checkNewAchievements(new Set(), { ...base, mistakes: 0, hintsUsed: 1 })).not.toContain('flawless');
  });

  it('three_flawless по накопленному счётчику, не по текущему пазлу', () => {
    expect(checkNewAchievements(new Set(), { ...base, flawlessCount: 2 })).not.toContain('three_flawless');
    expect(checkNewAchievements(new Set(), { ...base, flawlessCount: 3 })).toContain('three_flawless');
  });

  it('streak_7 по стрику ПОСЛЕ этого решения', () => {
    expect(checkNewAchievements(new Set(), { ...base, streak: 6 })).not.toContain('streak_7');
    expect(checkNewAchievements(new Set(), { ...base, streak: 7 })).toContain('streak_7');
  });

  it('all_difficulties только когда пройдены все три сложности', () => {
    expect(checkNewAchievements(new Set(), { ...base, difficultiesSeen: seen('easy', 'medium') })).not.toContain(
      'all_difficulties',
    );
    expect(
      checkNewAchievements(new Set(), { ...base, difficultiesSeen: seen('easy', 'medium', 'hard') }),
    ).toContain('all_difficulties');
  });

  it('comeback только если в этом решении была хотя бы одна ошибка', () => {
    expect(checkNewAchievements(new Set(), { ...base, mistakes: 1 })).toContain('comeback');
    expect(checkNewAchievements(new Set(), { ...base, mistakes: 0 })).not.toContain('comeback');
  });

  it('уже открытые достижения не предлагаются снова', () => {
    const unlocked = new Set(['first_puzzle', 'flawless', 'three_flawless', 'streak_7', 'all_difficulties', 'comeback']);
    expect(
      checkNewAchievements(unlocked, {
        mistakes: 1,
        hintsUsed: 0,
        puzzlesCompletedCount: 1,
        streak: 7,
        flawlessCount: 3,
        difficultiesSeen: seen('easy', 'medium', 'hard'),
      }),
    ).toEqual([]);
  });

  it('одно решение может открыть сразу несколько достижений', () => {
    const result = checkNewAchievements(new Set(), {
      mistakes: 1,
      hintsUsed: 0,
      puzzlesCompletedCount: 1,
      streak: 7,
      flawlessCount: 3,
      difficultiesSeen: seen('easy', 'medium', 'hard'),
    });
    expect(new Set(result)).toEqual(
      new Set(['first_puzzle', 'three_flawless', 'streak_7', 'all_difficulties', 'comeback']),
    );
  });
});
