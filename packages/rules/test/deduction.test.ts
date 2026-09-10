import { describe, expect, it } from 'vitest';
import {
  MAX_ASSIGNMENTS,
  TooHeavyError,
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
  epilogue: 'Аня копала в саду, Боря читал в доме, Вика была в сарае с ключом.',
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
    expect(assignmentCount(tooBig)).toBeGreaterThan(MAX_ASSIGNMENTS);
    const issues = validateCase(tooBig);
    expect(issues.some((i) => i.code === 'too-heavy')).toBe(true);
    expect(solveCase(tooBig).aborted).toBe(true);
  });

  it('отказ от перебора не выдаётся за отсутствие решений', () => {
    // У дела без улик решений заведомо множество. Молчаливый ноль здесь был бы
    // худшим видом неверного ответа: отказ считать, поданный как доказательство.
    expect(() => countSolutions(tooBig)).toThrow(TooHeavyError);
    expect(() => uniqueSolution(tooBig)).toThrow(TooHeavyError);
    expect(() => countSolutions(tooBig)).toThrow(/не проверено/);
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
    expect(
      validateCase(contradictory).some(
        (i) => i.code === 'no-solution' || i.code === 'deduction-contradiction',
      ),
    ).toBe(true);
  });

  it('неоднозначное дело отклоняется', () => {
    const issues = validateCase(ambiguous);
    expect(issues.some((i) => i.code === 'ambiguous')).toBe(true);
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

  it('дело с единственным решением, которое движок не выводит, помечается', () => {
    /*
     * Найдено поиском по случайным делам: решение существует и единственно,
     * то есть дело разрешимо логически, но пяти правил движка не хватает,
     * чтобы объяснить путь. Именно так и должно звучать предупреждение —
     * «не хватает правил объяснить», а не «требует угадывания».
     */
    const unexplainable: Case = {
      id: 'unexplainable',
      title: 'Единственное решение, необъяснимый путь',
      anchor: 'A',
      categories: [
        { id: 'A', title: 'A', values: ['A1', 'A2', 'A3'] },
        { id: 'B', title: 'B', values: ['B1', 'B2', 'B3'] },
        { id: 'C', title: 'C', values: ['C1', 'C2', 'C3'], ordered: true },
      ],
      clues: [
        { kind: 'before', a: { category: 'A', value: 'A3' }, b: { category: 'C', value: 'C3' }, text: '1' },
        { kind: 'adjacent', a: { category: 'B', value: 'B2' }, b: { category: 'A', value: 'A1' }, text: '2' },
        { kind: 'before', a: { category: 'B', value: 'B1' }, b: { category: 'C', value: 'C2' }, text: '3' },
        { kind: 'adjacent', a: { category: 'A', value: 'A3' }, b: { category: 'B', value: 'B2' }, text: '4' },
      ],
      epilogue: '',
    };

    expect(countSolutions(unexplainable)).toBe(1);

    const deduction = deduceCase(unexplainable);
    expect(deduction.contradiction).toBeNull();
    expect(deduction.solved).toBe(false);
    expect(deduction.unresolved).toBeGreaterThan(0);

    const issue = validateCase(unexplainable).find((i) => i.code === 'not-explainable');
    expect(issue).toBeDefined();
    expect(issue!.level).toBe('warning');
    expect(issue!.message).toContain('не хватает');
  });
});

describe('регрессии: противоречивое дело не должно считаться решённым', () => {
  it('конфликт двух известных связей при переносе через пару', () => {
    /*
     * A1 = B1 и B1 = C1, но A1 != C1. Раз A1 и B1 — одна сущность,
     * их связи с C1 обязаны совпадать. Раньше движок пропускал этот
     * случай: он смотрел только на неизвестные клетки и не сравнивал
     * два уже известных значения между собой.
     */
    const conflicting: Case = {
      id: 'transitive-conflict',
      title: 'Противоречие через перенос связи',
      anchor: 'a',
      categories: [
        { id: 'a', title: 'A', values: ['A1', 'A2', 'A3'] },
        { id: 'b', title: 'B', values: ['B1', 'B2', 'B3'] },
        { id: 'c', title: 'C', values: ['C1', 'C2', 'C3'] },
      ],
      clues: [
        { kind: 'same', a: { category: 'a', value: 'A1' }, b: { category: 'b', value: 'B1' }, text: 'A1 = B1' },
        { kind: 'same', a: { category: 'b', value: 'B1' }, b: { category: 'c', value: 'C1' }, text: 'B1 = C1' },
        { kind: 'different', a: { category: 'a', value: 'A1' }, b: { category: 'c', value: 'C1' }, text: 'A1 != C1' },
      ],
      epilogue: '',
    };

    // Перебор всегда знал правду.
    expect(countSolutions(conflicting)).toBe(0);

    // Теперь и рассуждение её видит.
    const deduction = deduceCase(conflicting);
    expect(deduction.contradiction).not.toBeNull();
    expect(deduction.solved).toBe(false);

    expect(
      validateCase(conflicting).some(
        (i) => i.code === 'no-solution' || i.code === 'deduction-contradiction',
      ),
    ).toBe(true);
  });

  it('невыполнимое отношение между зафиксированными позициями', () => {
    /*
     * «Вечер раньше утра». Обе ссылки лежат в самой упорядоченной
     * категории, поэтому исключать позиции нечего — раньше улика
     * не давала никакого эффекта, и дело считалось решённым.
     */
    const impossible: Case = {
      id: 'impossible-order',
      title: 'Вечер раньше утра',
      anchor: 'кто',
      categories: [
        { id: 'кто', title: 'Кто', values: ['Аня', 'Боря', 'Вика'] },
        { id: 'когда', title: 'Когда', values: ['утро', 'полдень', 'вечер'], ordered: true },
      ],
      clues: [
        {
          kind: 'before',
          a: { category: 'когда', value: 'вечер' },
          b: { category: 'когда', value: 'утро' },
          text: 'Вечер наступил раньше утра.',
        },
      ],
      epilogue: '',
    };

    expect(countSolutions(impossible)).toBe(0);
    const deduction = deduceCase(impossible);
    expect(deduction.contradiction).not.toBeNull();
    expect(deduction.contradiction).toContain('невыполнима');
    expect(deduction.solved).toBe(false);
  });

  it('сущность не может быть раньше самой себя', () => {
    const selfBefore: Case = {
      id: 'self-before',
      title: 'Раньше самого себя',
      anchor: 'кто',
      categories: [
        { id: 'кто', title: 'Кто', values: ['Аня', 'Боря', 'Вика'] },
        { id: 'когда', title: 'Когда', values: ['утро', 'полдень', 'вечер'], ordered: true },
      ],
      clues: [
        {
          kind: 'before',
          a: { category: 'кто', value: 'Аня' },
          b: { category: 'кто', value: 'Аня' },
          text: 'Аня пришла раньше Ани.',
        },
      ],
      epilogue: '',
    };

    expect(countSolutions(selfBefore)).toBe(0);
    expect(deduceCase(selfBefore).contradiction).not.toBeNull();
  });
});

describe('регрессии: объяснение подсказки', () => {
  it('закрытая клетка объясняется установленной парой, а не одним значением', () => {
    const { steps } = deduceCase(correct);
    const taken = steps.find((s) => s.reason.rule === 'taken');
    expect(taken).toBeDefined();
    if (taken?.reason.rule !== 'taken') throw new Error('ожидалась причина taken');

    const [x, y] = taken.reason.pair;
    // В объяснении обязаны стоять оба значения установленной пары —
    // иначе игрок не поймёт, какая связь закрыла клетку.
    expect(taken.text).toContain(x.value);
    expect(taken.text).toContain(y.value);
    expect(taken.text).toContain('пара');
    expect(taken.text).not.toContain('занято другой сущностью');

    // И пара обязана касаться самой клетки: одно из её значений — в клетке.
    const cell = [taken.a.value, taken.b.value];
    expect(cell.includes(x.value) || cell.includes(y.value)).toBe(true);
  });

  it('перенос связи объясняется через установленную пару', () => {
    const { steps } = deduceCase(correct);
    const transitive = steps.find((s) => s.reason.rule === 'transitive');
    if (transitive?.reason.rule !== 'transitive') throw new Error('ожидалась причина transitive');

    const [x, y] = transitive.reason.link;
    expect(transitive.text).toContain(x.value);
    expect(transitive.text).toContain(y.value);
  });
});