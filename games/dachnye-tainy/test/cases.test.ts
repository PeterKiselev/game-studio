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
describe('глава 1, дело 1 «Шланг у водокачки»', () => {
  const source = cases.find((c) => c.id === 'ch1-hose')!;

  it('решение совпадает с развязкой: шланг у Ромы в 9:00, Зоя с ведром в 7:00', () => {
    const lines = describeSolution(source, uniqueSolution(source)!);
    expect(lines).toEqual([
      'Зоя — время у бака: 7:00, что принесли: ведро',
      'Игорь — время у бака: 6:00, что принесли: канистра',
      'Настя — время у бака: 8:00, что принесли: лейка',
      'Рома — время у бака: 9:00, что принесли: шланг',
    ]);
    expect(source.epilogue).toContain('Рома');
    expect(source.epilogue).toContain('в девять');
  });

  it('подсказки доводят дело до конца: 3 сетки по 16 клеток', () => {
    const marks: PlayerMarks = {};
    for (let guard = 0; guard < 200; guard += 1) {
      const hint = nextHint(source, marks);
      if (!hint) break;
      expect(hint.text.length).toBeGreaterThan(10);
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }
    expect(nextHint(source, marks)).toBeNull();
    expect(Object.keys(marks)).toHaveLength(48);
  });

  it('вступление явно задаёт условия: по одному в каждый час, все вещи разные', () => {
    expect(source.intro).toContain('в 6, 7, 8 и 9 часов');
    expect(source.intro).toContain('все четыре разные');
  });

  /**
   * Сторож формулировок, не замена чтению: каждый текст называет обе
   * сущности своего правила и слово, которым это правило выражено.
   */
  it.each(source.clues.map((clue, i) => [i + 1, clue] as const))('улика %i прямо выражает своё правило', (_n, clue) => {
    const text = clue.text.toLowerCase();
    for (const ref of [clue.a, clue.b]) {
      const stem = ref.value.toLowerCase().slice(0, Math.min(4, ref.value.length));
      expect(text, `в тексте нет «${ref.value}»: ${clue.text}`).toContain(stem);
    }
    const marker = { before: /раньше|позже/, after: /позже|раньше/, adjacent: /соседние часы/, different: / не с /, same: /тот же|та же/ }[clue.kind];
    expect(text, `нет слова для правила ${clue.kind}: ${clue.text}`).toMatch(marker);
  });

  it('есть вступление и находка, ведущая к делу 2', () => {
    expect(source.intro).toMatch(/Кто принёс шланг\?/);
    expect(source.finding?.text).toMatch(/Склад правления/);
    expect(source.finding?.text).toMatch(/следующего дела/);
  });

  it('прежние шесть дел на своих местах и не изменили id', () => {
    expect(cases.map((c) => c.id).slice(0, 6)).toEqual(['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1']);
    expect(cases[6].id).toBe('ch1-hose');
  });
});
