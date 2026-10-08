import { markKey } from '@studio/rules';
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

/** Переименования значений: категория → старое значение → новое. */
export type ValueRenames = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Переносит отметки на новые имена значений, когда значение переименовано,
 * а смысл клетки тот же (порядок «первой» → «1»). Так незаконченное дело у
 * игроков не теряется. Если же значение заменено другим по смыслу, переноса
 * нет — такие отметки отбрасывает marksFitCase().
 */
export function renameMarks(marks: PlayerMarks, renames: ValueRenames): PlayerMarks {
  const out: PlayerMarks = {};
  for (const [key, value] of Object.entries(marks)) {
    const [a, b] = key.split('~').map((part) => {
      const sep = part.indexOf('|');
      const category = part.slice(0, sep);
      const old = part.slice(sep + 1);
      return { category, value: renames[category]?.[old] ?? old };
    });
    out[b ? markKey(a, b) : key] = value;
  }
  return out;
}
