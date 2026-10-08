import type { Case, PlayerMarks } from '@studio/rules';

/**
 * Подходят ли сохранённые отметки к текущей версии дела. Если значение
 * категории переименовали (в деле 2 «чек магазина» стал «прокатом лодки»),
 * старые ключи markKey ссылаются на несуществующие клетки: такая сетка
 * показала бы неполные отметки, а флаг «таблицы решены» — шаг, к которому
 * игрок с новыми фактами не приходил. Поэтому незаконченный прогресс
 * такого дела сбрасывается целиком, а не чинится по частям.
 */
export function marksFitCase(source: Case, marks: PlayerMarks): boolean {
  const cells = new Set(source.categories.flatMap((cat) => cat.values.map((value) => `${cat.id}|${value}`)));
  return Object.keys(marks).every((key) => key.split('~').every((part) => cells.has(part)));
}
