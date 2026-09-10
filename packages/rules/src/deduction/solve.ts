import { buildModel, indexOf, positionOf, resolveOrder, subjectOf } from './model';
import type { Model } from './model';
import type { Case, Clue, Solution } from './types';

/**
 * Полный перебор расстановок. Оправдан размерами пилота: при n значениях
 * и k категориях число расстановок равно (n!)^(k-1) — для 3x3 это 36,
 * для 4x4 при четырёх категориях 13 824. Проверяется мгновенно и, в отличие
 * от пропагации, даёт точный ответ на вопрос о числе решений.
 *
 * Верхний предел ниже страхует от дела, которое подвесит телефон:
 * 5 значений при четырёх категориях — это уже 1,7 млн расстановок.
 */
export const MAX_ASSIGNMENTS = 50_000;

export interface SolveResult {
  /** Найденные решения, не больше limit. */
  solutions: Solution[];
  /** Сколько полных расстановок проверено — для оценки сложности в тестах. */
  evaluated: number;
  /** Перебор остановлен предохранителем, ответ неполный. */
  aborted: boolean;
}

/** Все перестановки индексов 0..n-1. Для n <= 5 это максимум 120 массивов. */
export function permutations(n: number): number[][] {
  const out: number[][] = [];
  const current: number[] = [];
  const used = new Array<boolean>(n).fill(false);

  const step = (): void => {
    if (current.length === n) {
      out.push([...current]);
      return;
    }
    for (let value = 0; value < n; value += 1) {
      if (used[value]) continue;
      used[value] = true;
      current.push(value);
      step();
      current.pop();
      used[value] = false;
    }
  };

  step();
  return out;
}

/** Сколько расстановок придётся перебрать. Считается до перебора. */
export function assignmentCount(source: Case): number {
  const model = buildModel(source);
  const perms = factorial(model.size);
  return Math.pow(perms, model.others.length);
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

/** Проверяет одну улику на полной расстановке. */
export function checkClue(model: Model, solution: Solution, clue: Clue): boolean {
  const subjectA = subjectOf(model, solution, clue.a);
  const subjectB = subjectOf(model, solution, clue.b);
  if (subjectA < 0 || subjectB < 0) return false;

  switch (clue.kind) {
    case 'same':
      return subjectA === subjectB;
    case 'different':
      return subjectA !== subjectB;
    case 'before':
    case 'after':
    case 'adjacent': {
      const order = resolveOrder(model, clue.order);
      if (!order) return false;
      const positionA = positionOf(solution, order.id, subjectA);
      const positionB = positionOf(solution, order.id, subjectB);
      if (clue.kind === 'before') return positionA < positionB;
      if (clue.kind === 'after') return positionA > positionB;
      return Math.abs(positionA - positionB) === 1;
    }
  }
}

/**
 * Ищет решения. limit ограничивает сбор: для проверки единственности
 * достаточно двух — как только нашлось второе, дальше искать незачем.
 */
export function solveCase(source: Case, limit = 2): SolveResult {
  const model = buildModel(source);
  const total = Math.pow(factorial(model.size), model.others.length);
  if (total > MAX_ASSIGNMENTS) {
    return { solutions: [], evaluated: 0, aborted: true };
  }

  const perms = permutations(model.size);
  const identity = Array.from({ length: model.size }, (_, i) => i);
  const solutions: Solution[] = [];
  let evaluated = 0;

  const assignment: Solution = { [model.anchor.id]: identity };

  const step = (depth: number): boolean => {
    if (depth === model.others.length) {
      evaluated += 1;
      for (const clue of source.clues) {
        if (!checkClue(model, assignment, clue)) return false;
      }
      solutions.push(
        Object.fromEntries(Object.entries(assignment).map(([k, v]) => [k, [...v]])),
      );
      return solutions.length >= limit;
    }

    const category = model.others[depth];
    for (const perm of perms) {
      assignment[category.id] = perm;
      if (step(depth + 1)) return true;
    }
    delete assignment[category.id];
    return false;
  };

  step(0);
  return { solutions, evaluated, aborted: false };
}

/**
 * Дело тяжелее предохранителя: перебор не запускался, ответа нет.
 *
 * Отдельная ошибка, а не «ноль решений»: молча вернуть ноль означало бы
 * выдать отказ считать за доказанное отсутствие решений — худший вид
 * неверного ответа. Кто хочет обработать это мягко, зовёт assignmentCount()
 * до перебора; так и делает validateCase().
 */
export class TooHeavyError extends Error {
  constructor(source: Case) {
    super(
      `Дело «${source.id}» требует перебора ${assignmentCount(source).toLocaleString('ru')} ` +
        `расстановок при пределе ${MAX_ASSIGNMENTS.toLocaleString('ru')}. ` +
        'Число решений не проверено. Сверьтесь с assignmentCount() до вызова.',
    );
    this.name = 'TooHeavyError';
  }
}

/**
 * Сколько решений у дела: 0, 1 или 2 (2 означает «больше одного»).
 * Бросает TooHeavyError, если перебор запрещён предохранителем.
 */
export function countSolutions(source: Case): 0 | 1 | 2 {
  const result = solveCase(source, 2);
  if (result.aborted) throw new TooHeavyError(source);
  return result.solutions.length as 0 | 1 | 2;
}

/**
 * Единственное решение или null, если решений нет либо их несколько.
 * Бросает TooHeavyError, если перебор запрещён предохранителем.
 */
export function uniqueSolution(source: Case): Solution | null {
  const result = solveCase(source, 2);
  if (result.aborted) throw new TooHeavyError(source);
  return result.solutions.length === 1 ? result.solutions[0] : null;
}

/** Читаемая расшифровка решения: сущность -> её значения по категориям. */
export function describeSolution(source: Case, solution: Solution): string[] {
  const model = buildModel(source);
  return model.anchor.values.map((name, subject) => {
    const parts = model.others.map((category) => {
      const value = category.values[solution[category.id][subject]];
      return `${category.title.toLowerCase()}: ${value}`;
    });
    return `${name} — ${parts.join(', ')}`;
  });
}

export { indexOf, subjectOf };