import { describe, expect, it } from 'vitest';
import {
  countSolutions,
  deduceCase,
  describeSolution,
  formatIssues,
  markKey,
  nextHint,
  uniqueSolution,
  validateCase,
} from '@studio/rules';
import type { PlayerMarks } from '@studio/rules';
import { cases, tutorialCase } from '../src/cases';

/**
 * Контентные тесты: каждое выпускаемое дело обязано быть корректным,
 * однозначным и решаемым рассуждением. Это защита от того, чтобы
 * сломанное дело дошло до игрока.
 */

describe('все дела пилота', () => {
  it.each(cases.map((c) => [c.id, c] as const))('дело %s проходит валидацию', (_id, source) => {
    const issues = validateCase(source);
    // Сообщение об ошибке печатает отчёт целиком — видно, что именно не так.
    expect(issues, formatIssues(source, issues)).toEqual([]);
  });

  it.each(cases.map((c) => [c.id, c] as const))('дело %s решается рассуждением', (_id, source) => {
    expect(countSolutions(source)).toBe(1);
    expect(deduceCase(source).solved).toBe(true);
  });

  it('идентификаторы дел не повторяются', () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('обучающее дело', () => {
  it('решение именно то, что описано в развязке', () => {
    const solution = uniqueSolution(tutorialCase)!;
    const lines = describeSolution(tutorialCase, solution);

    expect(lines[0]).toBe('Ирина — где были: грядка, что при них: лейка');
    expect(lines[1]).toBe('Михаил — где были: беседка, что при них: пирог');
    expect(lines[2]).toBe('Олег — где были: калитка, что при них: зонт');
  });

  it('первая подсказка объясняет шаг уликой, а не раскрывает ответ', () => {
    const hint = nextHint(tutorialCase)!;
    expect(hint.reason.rule).toBe('clue');
    expect(hint.text).toContain('Отметьте');
    expect(hint.text).toContain('улики');
  });

  it('подсказки доводят дело до конца шаг за шагом', () => {
    const marks: PlayerMarks = {};
    let guard = 0;

    while (guard < 100) {
      guard += 1;
      const hint = nextHint(tutorialCase, marks);
      if (!hint) break;
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }

    expect(nextHint(tutorialCase, marks)).toBeNull();
    // Дело 3x3 из трёх категорий: 3 сетки по 9 клеток.
    expect(Object.keys(marks)).toHaveLength(27);
  });

  it('у обучающего дела есть развязка и текст каждой улики', () => {
    expect(tutorialCase.epilogue.length).toBeGreaterThan(50);
    for (const clue of tutorialCase.clues) {
      expect(clue.text.trim().length).toBeGreaterThan(10);
    }
  });
});