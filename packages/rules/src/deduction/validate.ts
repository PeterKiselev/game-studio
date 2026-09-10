import { deduceCase } from './board';
import { buildModel, resolveOrder } from './model';
import { MAX_ASSIGNMENTS, assignmentCount, countSolutions } from './solve';
import type { Case } from './types';

/**
 * Проверка дела на этапе сборки, а не на этапе игры.
 *
 * Смысл в том, чтобы автор узнавал о проблеме сразу: дело без решения,
 * дело с двумя решениями и дело, которое нельзя решить рассуждением
 * (только угадыванием) — всё это ошибки контента, а не игрока.
 */

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
}

export function validateCase(source: Case): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string): void => {
    issues.push({ level: 'error', code, message });
  };
  const warn = (code: string, message: string): void => {
    issues.push({ level: 'warning', code, message });
  };

  // --- структура ----------------------------------------------------------

  const ids = new Set<string>();
  for (const category of source.categories) {
    if (ids.has(category.id)) error('duplicate-category', `Категория «${category.id}» объявлена дважды.`);
    ids.add(category.id);

    const values = new Set<string>();
    for (const value of category.values) {
      if (values.has(value)) {
        error('duplicate-value', `В категории «${category.title}» значение «${value}» повторяется.`);
      }
      values.add(value);
    }
  }

  if (source.categories.length < 2) {
    error('too-few-categories', 'В деле должно быть минимум две категории.');
    return issues;
  }

  if (!ids.has(source.anchor)) {
    error('missing-anchor', `Категория-якорь «${source.anchor}» отсутствует среди категорий.`);
    return issues;
  }

  const size = source.categories.find((c) => c.id === source.anchor)!.values.length;
  if (size < 2) {
    error('too-small', 'В категориях должно быть минимум по два значения.');
    return issues;
  }
  for (const category of source.categories) {
    if (category.values.length !== size) {
      error(
        'size-mismatch',
        `Категория «${category.title}» содержит ${category.values.length} значений вместо ${size}. ` +
          'Во всех категориях число значений должно совпадать.',
      );
    }
  }

  if (issues.some((i) => i.level === 'error')) return issues;

  // --- улики --------------------------------------------------------------

  const model = buildModel(source);
  const orderedCount = source.categories.filter((c) => c.ordered).length;

  source.clues.forEach((clue, index) => {
    const number = index + 1;
    if (!clue.text.trim()) warn('clue-no-text', `У улики ${number} пустой текст для игрока.`);

    for (const [side, ref] of [['a', clue.a], ['b', clue.b]] as const) {
      const category = model.byId.get(ref.category);
      if (!category) {
        error('clue-bad-category', `Улика ${number}: категории «${ref.category}» нет в деле (${side}).`);
        continue;
      }
      if (!category.values.includes(ref.value)) {
        error(
          'clue-bad-value',
          `Улика ${number}: в категории «${category.title}» нет значения «${ref.value}» (${side}).`,
        );
      }
    }

    const needsOrder = clue.kind === 'before' || clue.kind === 'after' || clue.kind === 'adjacent';
    if (needsOrder) {
      if (clue.order && !model.byId.get(clue.order)?.ordered) {
        error(
          'clue-order-not-ordered',
          `Улика ${number} ссылается на категорию «${clue.order}» как на упорядоченную, ` +
            'но у неё не выставлен признак ordered.',
        );
      } else if (!clue.order && orderedCount !== 1) {
        error(
          'clue-order-ambiguous',
          `Улика ${number} использует отношение «${clue.kind}» без указания категории порядка, ` +
            `а упорядоченных категорий в деле ${orderedCount}. Укажите order явно.`,
        );
      } else if (!resolveOrder(model, clue.order)) {
        error('clue-order-missing', `Улика ${number}: не удалось определить упорядоченную категорию.`);
      }
    } else if (clue.order) {
      warn(
        'clue-order-unused',
        `У улики ${number} указан order, но отношение «${clue.kind}» его не использует.`,
      );
    }
  });

  if (issues.some((i) => i.level === 'error')) return issues;

  // --- разрешимость -------------------------------------------------------

  const assignments = assignmentCount(source);
  if (assignments > MAX_ASSIGNMENTS) {
    error(
      'too-heavy',
      `Дело требует перебора ${assignments.toLocaleString('ru')} расстановок, ` +
        `предел — ${MAX_ASSIGNMENTS.toLocaleString('ru')}. ` +
        'Уменьшите число значений или категорий: иначе проверка подвесит телефон.',
    );
    return issues;
  }

  const solutions = countSolutions(source);
  if (solutions === 0) {
    error('no-solution', 'У дела нет ни одного решения — улики противоречат друг другу.');
    return issues;
  }
  if (solutions === 2) {
    error(
      'ambiguous',
      'У дела больше одного решения. Добавьте улику, иначе игрок не сможет прийти к однозначному ответу.',
    );
    return issues;
  }

  const deduction = deduceCase(source);
  if (deduction.contradiction) {
    error('deduction-contradiction', `Рассуждение приводит к противоречию: ${deduction.contradiction}`);
  } else if (!deduction.solved) {
    warn(
      'needs-guessing',
      `Дело решается только перебором: рассуждением не выводится ${deduction.unresolved} клеток. ` +
        'Переформулируйте улики — иначе подсказка не сможет объяснить путь до конца.',
    );
  }

  return issues;
}

/** Дело пригодно к выпуску: без ошибок и без предупреждений. */
export function isReleasable(source: Case): boolean {
  return validateCase(source).length === 0;
}

/** Читаемый отчёт для консоли. */
export function formatIssues(source: Case, issues: ValidationIssue[]): string {
  if (!issues.length) return `${source.id}: дело в порядке.`;
  return [
    `${source.id} — ${source.title}`,
    ...issues.map((i) => `  [${i.level === 'error' ? 'ОШИБКА' : 'внимание'}] ${i.code}: ${i.message}`),
  ].join('\n');
}