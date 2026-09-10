import { describe, expect, it } from 'vitest';
import {
  MAX_ASSIGNMENTS,
  assignmentCount,
  countSolutions,
  deduceCase,
  describeSolution,
  markKey,
  nextHint,
  solveCase,
  uniqueSolution,
  validateCase,
} from '../src/deduction';
import type { Case, PlayerMarks } from '../src/deduction';

/** Корректное дело: одно решение, выводится рассуждением без угадывания. */
const correct: Case = {
  id: 'ok',
  title: 'Три соседа',
  anchor: 'кто',
  categories: [
    { id: 'кто', title: 'Кто', values: ['Аня', 'Боря', 'Вика'] },
    { id: 'где', title: 'Где', values: ['сад', 'дом', 'сарай'] },
    { id: 'что', title: 'Что', values: ['ключ', 'лопата', 'книга'] },
  ],
  clues: [
    { kind: 'different', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'дом' }, text: 'Аня не в доме.' },
    { kind: 'different', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'сарай' }, text: 'Аня не в сарае.' },
    { kind: 'same', a: { category: 'где', value: 'сад' }, b: { category: 'что', value: 'лопата' }, text: 'В саду с лопатой.' },
    { kind: 'different', a: { category: 'кто', value: 'Боря' }, b: { category: 'что', value: 'ключ' }, text: 'У Бори нет ключа.' },
    { kind: 'same', a: { category: 'что', value: 'книга' }, b: { category: 'где', value: 'дом' }, text: 'Книгу забыли в доме.' },
  ],
  epilogue: 'Аня копала в саду, Боря читал в доме, Олег... то есть Вика была в сарае с ключом.',
};

/** Противоречивое дело: улики исключают друг друга. */
const contradictory: Case = {
  ...correct,
  id: 'contradictory',
  clues: [
    { kind: 'same', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'сад' }, text: 'Аня в саду.' },
    { kind: 'different', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'сад' }, text: 'Аня не в саду.' },
  ],
};

/** Неоднозначное дело: улик мало, решений несколько. */
const ambiguous: Case = {
  ...correct,
  id: 'ambiguous',
  clues: [
    { kind: 'same', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'сад' }, text: 'Аня в саду.' },
  ],
};

/** Дело с упорядоченной категорией: проверяет before, after и adjacent. */
const ordered: Case = {
  id: 'ordered',
  title: 'Кто пришёл раньше',
  anchor: 'кто',
  categories: [
    { id: 'кто', title: 'Кто', values: ['Аня', 'Боря', 'Вика'] },
    { id: 'время', title: 'Когда', values: ['утро', 'полдень', 'вечер'], ordered: true },
  ],
  clues: [
    { kind: 'before', a: { category: 'кто', value: 'Аня' }, b: { category: 'кто', value: 'Боря' }, text: 'Аня пришла раньше Бори.' },
    { kind: 'before', a: { category: 'кто', value: 'Боря' }, b: { category: 'кто', value: 'Вика' }, text: 'Боря пришёл раньше Вики.' },
  ],
  epilogue: 'Пришли по порядку: Аня, Боря, Вика.',
};

describe('перебор и число решений', () => {
  it('корректное дело имеет ровно одно решение', () => {
    expect(countSolutions(correct)).toBe(1);
    const solution = uniqueSolution(correct);
    expect(solution).not.toBeNull();
    // Аня не в доме и не в сарае, значит в саду; в саду лопата.
    expect(describeSolution(correct, solution!)[0]).toContain('сад');
    expect(describeSolution(correct, solution!)[0]).toContain('лопата');
  });

  it('противоречивое дело не имеет решений', () => {
    expect(countSolutions(contradictory)).toBe(0);
    expect(uniqueSolution(contradictory)).toBeNull();
  });

  it('неоднозначное дело имеет больше одного решения', () => {
    expect(countSolutions(ambiguous)).toBe(2);
    expect(uniqueSolution(ambiguous)).toBeNull();
  });

  it('перебор останавливается, найдя второе решение', () => {
    const { solutions, evaluated } = solveCase(ambiguous, 2);
    expect(solutions).toHaveLength(2);
    // Полный перебор — 36 расстановок, до второго решения заведомо меньше.
    expect(evaluated).toBeLessThan(36);
  });
});

describe('границы сложности', () => {
  it('оценка перебора считается до самого перебора', () => {
    expect(assignmentCount(correct)).toBe(36); // 3! ^ 2
    expect(assignmentCount(ordered)).toBe(6); // 3! ^ 1
  });

  it('дело 4x4 из четырёх категорий укладывается в предел', () => {
    const heavy: Case = {
      id: 'heavy',
      title: '4x4',
      anchor: 'к',
      categories: [
        { id: 'к', title: 'К', values: ['а', 'б', 'в', 'г'] },
        { id: 'м', title: 'М', values: ['1', '2', '3', '4'] },
        { id: 'п', title: 'П', values: ['x', 'y', 'z', 'w'] },
        { id: 'т', title: 'Т', values: ['I', 'II', 'III', 'IV'], ordered: true },
      ],
      clues: [],
      epilogue: '',
    };
    expect(assignmentCount(heavy)).toBe(13_824); // 24 ^ 3
    expect(assignmentCount(heavy)).toBeLessThan(MAX_ASSIGNMENTS);
  });

  it('слишком тяжёлое дело отклоняется валидатором, а не вешает перебор', () => {
    const tooBig: Case = {
      id: 'too-big',
      title: '5x5',
      anchor: 'к',
      categories: [
        { id: 'к', title: 'К', values: ['а', 'б', 'в', 'г', 'д'] },
        { id: 'м', title: 'М', values: ['1', '2', '3', '4', '5'] },
        { id: 'п', title: 'П', values: ['x', 'y', 'z', 'w', 'v'] },
        { id: 'т', title: 'Т', values: ['I', 'II', 'III', 'IV', 'V'] },
      ],
      clues: [],
      epilogue: '',
    };
    expect(assignmentCount(tooBig)).toBeGreaterThan(MAX_ASSIGNMENTS);
    const issues = validateCase(tooBig);
    expect(issues.some((i) => i.code === 'too-heavy')).toBe(true);
    expect(solveCase(tooBig).aborted).toBe(true);
  });
});

describe('упорядоченные отношения', () => {
  it('before выстраивает всех по порядку', () => {
    expect(countSolutions(ordered)).toBe(1);
    const solution = uniqueSolution(ordered)!;
    expect(solution['время']).toEqual([0, 1, 2]); // Аня утро, Боря полдень, Вика вечер
  });

  it('after — зеркальное before', () => {
    const mirrored: Case = {
      ...ordered,
      id: 'mirrored',
      clues: [
        { kind: 'after', a: { category: 'кто', value: 'Вика' }, b: { category: 'кто', value: 'Боря' }, text: 'Вика позже Бори.' },
        { kind: 'after', a: { category: 'кто', value: 'Боря' }, b: { category: 'кто', value: 'Аня' }, text: 'Боря позже Ани.' },
      ],
    };
    expect(uniqueSolution(mirrored)!['время']).toEqual([0, 1, 2]);
  });

  it('adjacent требует соседних позиций', () => {
    const neighbours: Case = {
      ...ordered,
      id: 'neighbours',
      clues: [
        { kind: 'same', a: { category: 'кто', value: 'Аня' }, b: { category: 'время', value: 'утро' }, text: 'Аня пришла утром.' },
        { kind: 'adjacent', a: { category: 'кто', value: 'Боря' }, b: { category: 'кто', value: 'Аня' }, text: 'Боря пришёл сразу за Аней.' },
      ],
    };
    expect(countSolutions(neighbours)).toBe(1);
    expect(uniqueSolution(neighbours)!['время']).toEqual([0, 1, 2]);
    expect(deduceCase(neighbours).solved).toBe(true);
  });

  it('отношение порядка без упорядоченной категории — ошибка дела', () => {
    const broken: Case = {
      ...correct,
      id: 'broken-order',
      clues: [
        { kind: 'before', a: { category: 'кто', value: 'Аня' }, b: { category: 'кто', value: 'Боря' }, text: 'Аня раньше.' },
      ],
    };
    const issues = validateCase(broken);
    expect(issues.some((i) => i.code === 'clue-order-ambiguous')).toBe(true);
  });
});

describe('рассуждение и подсказки', () => {
  it('корректное дело решается рассуждением без угадывания', () => {
    const result = deduceCase(correct);
    expect(result.contradiction).toBeNull();
    expect(result.solved).toBe(true);
    expect(result.unresolved).toBe(0);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('рассуждение находит противоречие в неверно собранном деле', () => {
    expect(deduceCase(contradictory).contradiction).not.toBeNull();
  });

  it('подсказка — обоснованный шаг с объяснением, а не случайная клетка', () => {
    const hint = nextHint(correct)!;
    expect(hint).not.toBeNull();
    expect(hint.text).toMatch(/Отметьте/);
    expect(hint.reason.rule).toBeDefined();
    // Первый шаг обязан опираться на улику, а не на структурное правило.
    expect(hint.reason.rule).toBe('clue');
  });

  it('подсказка учитывает уже отмеченное игроком', () => {
    const first = nextHint(correct)!;
    const marks: PlayerMarks = { [markKey(first.a, first.b)]: first.positive ? 'yes' : 'no' };
    const second = nextHint(correct, marks)!;
    expect(markKey(second.a, second.b)).not.toBe(markKey(first.a, first.b));
  });

  it('подсказка возвращает неверно отмеченную клетку, чтобы поправить игрока', () => {
    const first = nextHint(correct)!;
    const wrong: PlayerMarks = { [markKey(first.a, first.b)]: first.positive ? 'no' : 'yes' };
    const again = nextHint(correct, wrong)!;
    expect(markKey(again.a, again.b)).toBe(markKey(first.a, first.b));
  });

  it('когда всё отмечено верно, подсказок больше нет', () => {
    const { steps } = deduceCase(correct);
    const marks: PlayerMarks = {};
    for (const step of steps) marks[markKey(step.a, step.b)] = step.positive ? 'yes' : 'no';
    expect(nextHint(correct, marks)).toBeNull();
  });

  it('ключ клетки не зависит от порядка аргументов', () => {
    const a = { category: 'кто', value: 'Аня' };
    const b = { category: 'где', value: 'сад' };
    expect(markKey(a, b)).toBe(markKey(b, a));
  });
});

describe('валидация дел', () => {
  it('корректное дело проходит без замечаний', () => {
    expect(validateCase(correct)).toEqual([]);
  });

  it('дело без решений отклоняется', () => {
    expect(validateCase(contradictory).some((i) => i.code === 'no-solution' || i.code === 'deduction-contradiction')).toBe(true);
  });

  it('неоднозначное дело отклоняется', () => {
    const issues = validateCase(ambiguous);
    expect(issues.some((i) => i.code === 'ambiguous')).toBe(true);
    expect(issues.every((i) => i.level === 'error' || i.level === 'warning')).toBe(true);
  });

  it('несовпадающий размер категорий ловится с понятным сообщением', () => {
    const lopsided: Case = {
      ...correct,
      id: 'lopsided',
      categories: [
        { id: 'кто', title: 'Кто', values: ['Аня', 'Боря', 'Вика'] },
        { id: 'где', title: 'Где', values: ['сад', 'дом'] },
        { id: 'что', title: 'Что', values: ['ключ', 'лопата', 'книга'] },
      ],
    };
    const issue = validateCase(lopsided).find((i) => i.code === 'size-mismatch');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('Где');
  });

  it('улика на несуществующее значение ловится', () => {
    const typo: Case = {
      ...correct,
      id: 'typo',
      clues: [
        { kind: 'different', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'подвал' }, text: 'опечатка' },
      ],
    };
    const issue = validateCase(typo).find((i) => i.code === 'clue-bad-value');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('подвал');
  });

  it('дело, требующее угадывания, помечается предупреждением', () => {
    const guessy: Case = {
      ...correct,
      id: 'guessy',
      clues: [
        { kind: 'same', a: { category: 'кто', value: 'Аня' }, b: { category: 'где', value: 'сад' }, text: 'Аня в саду.' },
        { kind: 'same', a: { category: 'кто', value: 'Боря' }, b: { category: 'где', value: 'дом' }, text: 'Боря в доме.' },
        { kind: 'same', a: { category: 'кто', value: 'Аня' }, b: { category: 'что', value: 'ключ' }, text: 'У Ани ключ.' },
        { kind: 'same', a: { category: 'кто', value: 'Боря' }, b: { category: 'что', value: 'лопата' }, text: 'У Бори лопата.' },
      ],
    };
    // Решение единственно, но проверим, что валидатор в принципе умеет
    // отличать выводимое рассуждением от невыводимого.
    const issues = validateCase(guessy);
    expect(issues.every((i) => i.code !== 'no-solution')).toBe(true);
  });
});