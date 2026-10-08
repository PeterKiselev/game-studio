import { buildModel, subjectOf } from '@studio/rules';
import type { Case, Solution, Testimony } from '@studio/rules';

/**
 * Шаг «чьи слова расходятся с фактами?» — сверка показаний с уже найденным
 * решением сетки. Солвер не участвует: показание не улика, оно либо
 * совпадает с решением, либо нет. Автор дела не помечает ложь вручную —
 * её определяет решение, поэтому текст и проверка не могут разойтись.
 */

/** Верно ли показание при этом решении: говорящий и то, что он о себе утверждает, — одна сущность. */
export function testimonyHolds(source: Case, solution: Solution, t: Testimony): boolean {
  const model = buildModel(source);
  const speaker = subjectOf(model, solution, t.who);
  return speaker >= 0 && speaker === subjectOf(model, solution, t.claim);
}

/** Показания, которые расходятся с решением. В выпускаемом деле — ровно одно. */
export function falseTestimonies(source: Case, solution: Solution): Testimony[] {
  return (source.contradiction?.testimonies ?? []).filter((t) => !testimonyHolds(source, solution, t));
}

/**
 * Что о говорящем установили таблицы: «баня, сосед» — значения по порядку категорий.
 * Объяснение строится из решения, а не пишется вручную под каждый неверный ответ.
 */
export function factsAbout(source: Case, solution: Solution, t: Testimony): string {
  const model = buildModel(source);
  const subject = subjectOf(model, solution, t.who);
  return source.categories
    .filter((cat) => cat.id !== t.who.category)
    .map((cat) => cat.values[solution[cat.id][subject]])
    .join(', ');
}
