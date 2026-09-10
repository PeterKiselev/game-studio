import type { Case, Category, Ref, Solution } from './types';

/**
 * Разобранное дело: индексы значений, размер, якорь отдельно от остальных.
 * Строится один раз и переиспользуется решателем, валидатором и подсказками.
 */
export interface Model {
  size: number;
  anchor: Category;
  others: Category[];
  byId: Map<string, Category>;
  /** categoryId -> value -> индекс значения (он же позиция для ordered). */
  valueIndex: Map<string, Map<string, number>>;
}

export function buildModel(source: Case): Model {
  const byId = new Map<string, Category>();
  const valueIndex = new Map<string, Map<string, number>>();

  for (const category of source.categories) {
    byId.set(category.id, category);
    const index = new Map<string, number>();
    category.values.forEach((value, i) => index.set(value, i));
    valueIndex.set(category.id, index);
  }

  const anchor = byId.get(source.anchor);
  if (!anchor) throw new Error(`Категория-якорь не найдена: ${source.anchor}`);

  return {
    size: anchor.values.length,
    anchor,
    others: source.categories.filter((c) => c.id !== source.anchor),
    byId,
    valueIndex,
  };
}

export function indexOf(model: Model, ref: Ref): number {
  const index = model.valueIndex.get(ref.category)?.get(ref.value);
  return index === undefined ? -1 : index;
}

/**
 * Какой сущности якоря принадлежит эта ссылка в данном решении.
 * Работает одинаково для якоря и для остальных категорий, потому что
 * решение для якоря тождественно.
 */
export function subjectOf(model: Model, solution: Solution, ref: Ref): number {
  const value = indexOf(model, ref);
  if (value < 0) return -1;
  const assignment = solution[ref.category];
  if (!assignment) return -1;
  for (let subject = 0; subject < model.size; subject += 1) {
    if (assignment[subject] === value) return subject;
  }
  return -1;
}

/** Позиция сущности в упорядоченной категории. */
export function positionOf(solution: Solution, orderId: string, subject: number): number {
  return solution[orderId]?.[subject] ?? -1;
}

/**
 * Канонический ключ пары «значение — значение». Одинаков независимо от
 * порядка аргументов, поэтому интерфейс и движок ссылаются на одну клетку
 * сетки одним и тем же ключом.
 */
export function markKey(a: Ref, b: Ref): string {
  const straight =
    a.category < b.category || (a.category === b.category && a.value <= b.value);
  const [first, second] = straight ? [a, b] : [b, a];
  return `${first.category}|${first.value}~${second.category}|${second.value}`;
}

/**
 * Упорядоченная категория для отношения. Явно указанная имеет приоритет;
 * иначе подставляется единственная упорядоченная категория дела.
 * null означает, что подставить нечего — это ошибка дела, её ловит валидатор.
 */
export function resolveOrder(model: Model, explicit?: string): Category | null {
  if (explicit) {
    const category = model.byId.get(explicit);
    return category?.ordered ? category : null;
  }
  const ordered = [...model.byId.values()].filter((c) => c.ordered);
  return ordered.length === 1 ? ordered[0] : null;
}