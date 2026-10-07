import { describe, expect, it } from 'vitest';
import { checkNewAchievements, starsFor } from '../src/achievements';
import { PLOT_CASE_IDS, cases } from '../src/cases';

describe('starsFor', () => {
  it('3 звезды без подсказок, 2 за одну, 1 за две и больше', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(2)).toBe(1);
    expect(starsFor(5)).toBe(1);
  });
});

describe('checkNewAchievements', () => {
  const base = { hintsUsed: 1, hadMistake: false, casesCompletedCount: 2, plotCasesCompleted: 2, plotCasesTotal: 6, flawlessCount: 0 };

  it('первое дело — только first_case, и только если ещё не открыто', () => {
    expect(checkNewAchievements(new Set(), { ...base, casesCompletedCount: 1 })).toEqual(['first_case']);
    expect(checkNewAchievements(new Set(['first_case']), { ...base, casesCompletedCount: 1 })).toEqual([]);
  });

  it('no_hints только при hintsUsed === 0', () => {
    expect(checkNewAchievements(new Set(), { ...base, hintsUsed: 0 })).toContain('no_hints');
    expect(checkNewAchievements(new Set(), { ...base, hintsUsed: 1 })).not.toContain('no_hints');
  });

  it('three_flawless по накопленному счётчику, не по текущему делу', () => {
    expect(checkNewAchievements(new Set(), { ...base, flawlessCount: 2 })).not.toContain('three_flawless');
    expect(checkNewAchievements(new Set(), { ...base, flawlessCount: 3 })).toContain('three_flawless');
  });

  it('comeback только если в этом деле была ошибка', () => {
    expect(checkNewAchievements(new Set(), { ...base, hadMistake: true })).toContain('comeback');
    expect(checkNewAchievements(new Set(), { ...base, hadMistake: false })).not.toContain('comeback');
  });

  it('all_cases только когда раскрыты все дела', () => {
    expect(checkNewAchievements(new Set(), { ...base, casesCompletedCount: 6, plotCasesCompleted: 6 })).toContain(
      'all_cases',
    );
    expect(checkNewAchievements(new Set(), { ...base, casesCompletedCount: 5, plotCasesCompleted: 5 })).not.toContain(
      'all_cases',
    );
  });

  it('уже открытые достижения не предлагаются снова', () => {
    const unlocked = new Set(['first_case', 'no_hints', 'three_flawless', 'comeback', 'all_cases']);
    expect(
      checkNewAchievements(unlocked, {
        hintsUsed: 0,
        hadMistake: true,
        casesCompletedCount: 6,
        plotCasesCompleted: 6,
        plotCasesTotal: 6,
        flawlessCount: 3,
      }),
    ).toEqual([]);
  });

  it('одно раскрытие может открыть сразу несколько достижений', () => {
    const result = checkNewAchievements(new Set(), {
      hintsUsed: 0,
      hadMistake: true,
      casesCompletedCount: 6,
      plotCasesCompleted: 6,
      plotCasesTotal: 6,
      flawlessCount: 3,
    });
    expect(new Set(result)).toEqual(new Set(['no_hints', 'three_flawless', 'comeback', 'all_cases']));
  });
});

describe('«Все тайны участка» — только исходные шесть дел', () => {
  it('список дел участка зафиксирован и не включает главы', () => {
    expect([...PLOT_CASE_IDS]).toEqual(['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1']);
    expect(PLOT_CASE_IDS).not.toContain('ch1-hose');
    expect(cases.length).toBeGreaterThan(PLOT_CASE_IDS.length);
  });

  it('семь раскрытых дел без одного исходного — достижения нет', () => {
    const ctx = { hintsUsed: 1, hadMistake: false, casesCompletedCount: 7, plotCasesCompleted: 5, plotCasesTotal: 6, flawlessCount: 0 };
    expect(checkNewAchievements(new Set(), ctx)).not.toContain('all_cases');
  });

  it('шесть исходных раскрыты, глава ещё нет — достижение есть', () => {
    const ctx = { hintsUsed: 1, hadMistake: false, casesCompletedCount: 6, plotCasesCompleted: 6, plotCasesTotal: 6, flawlessCount: 0 };
    expect(checkNewAchievements(new Set(), ctx)).toContain('all_cases');
  });
});
