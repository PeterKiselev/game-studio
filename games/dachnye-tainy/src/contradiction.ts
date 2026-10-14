import { buildModel, subjectOf } from '@studio/rules';
import type { Case, Solution, Testimony, VerdictVersion } from '@studio/rules';

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
 * Что таблицы установили о говорящем ровно в той категории, о которой его
 * показание: для «я был в бане» — место, «баня». Остальные категории и
 * остальное в реплике сюда не входят: объяснение подтверждает только то,
 * что таблица действительно проверяет. Строится из решения, не вручную.
 */
export function claimedFact(source: Case, solution: Solution, t: Testimony): string {
  const model = buildModel(source);
  const subject = subjectOf(model, solution, t.who);
  const category = source.categories.find((cat) => cat.id === t.claim.category)!;
  return category.values[solution[category.id][subject]];
}

/** Версия верна, если её подозреваемый по решению и есть ключевая клетка (кто был там в нужный час). */
export function versionHolds(source: Case, solution: Solution, v: VerdictVersion): boolean {
  const culprit = source.verdict?.culprit;
  if (!culprit) return false;
  const model = buildModel(source);
  const suspect = subjectOf(model, solution, v.who);
  return suspect >= 0 && suspect === subjectOf(model, solution, culprit);
}

/** Верные версии. В выпускаемом деле — ровно одна. */
export function trueVersions(source: Case, solution: Solution): VerdictVersion[] {
  return (source.verdict?.versions ?? []).filter((v) => versionHolds(source, solution, v));
}

/** Что таблицы установили о подозреваемом в категории ключевой клетки: для часа — «0:00». */
export function suspectFact(source: Case, solution: Solution, v: VerdictVersion): string {
  const category = source.categories.find((cat) => cat.id === source.verdict!.culprit.category)!;
  const subject = subjectOf(buildModel(source), solution, v.who);
  return category.values[solution[category.id][subject]];
}
