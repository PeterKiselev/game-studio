import { buildModel, indexOf, markKey, resolveOrder } from './model';
import type { Model } from './model';
import type { Case, Category, Clue, Deduction, HintReason, PlayerMarks, Ref } from './types';

/**
 * Пошаговое рассуждение по делу.
 *
 * Перебор из solve.ts отвечает на вопрос «сколько решений», но не умеет
 * объяснять. Здесь наоборот: движок ведёт сетку возможностей и выводит
 * следствия по нескольким понятным правилам, запоминая, откуда взялся
 * каждый вывод. Из этой записи и получается подсказка — не раскрытие
 * случайной клетки, а следующий обоснованный шаг с объяснением.
 *
 * Правил ровно столько, сколько нужно для дел пилота:
 *   1. прямое следствие улики;
 *   2. значение уже занято другой сущностью;
 *   3. остался единственный вариант;
 *   4. перенос связи через третью сущность;
 *   5. в упорядоченной категории не остаётся места.
 *
 * Если делу этих правил не хватает, валидатор скажет об этом автору
 * на этапе сборки — такое дело в пилот не попадает.
 */

export type CellState = 'yes' | 'no' | 'unknown';

export interface DeduceResult {
  steps: Deduction[];
  /** Первое найденное противоречие: дело собрано неверно. */
  contradiction: string | null;
  /** Рассуждение довело дело до конца без перебора и догадок. */
  solved: boolean;
  /** Сколько клеток осталось неопределёнными. */
  unresolved: number;
}

class Board {
  private readonly positive = new Set<string>();
  private readonly impossible = new Set<string>();
  private readonly positivePairs: Array<[Ref, Ref]> = [];
  readonly steps: Deduction[] = [];
  contradiction: string | null = null;

  constructor(
    private readonly model: Model,
    private readonly clues: Clue[],
  ) {}

  private get categories(): Category[] {
    return [...this.model.byId.values()];
  }

  state(a: Ref, b: Ref): CellState {
    const key = markKey(a, b);
    if (this.positive.has(key)) return 'yes';
    if (this.impossible.has(key)) return 'no';
    return 'unknown';
  }

  /** Возможные значения категории для этой сущности. */
  private candidates(from: Ref, to: Category): number[] {
    if (from.category === to.id) {
      const own = indexOf(this.model, from);
      return own < 0 ? [] : [own];
    }
    const out: number[] = [];
    to.values.forEach((value, i) => {
      if (this.state(from, { category: to.id, value }) !== 'no') out.push(i);
    });
    return out;
  }

  private fail(message: string): void {
    if (!this.contradiction) this.contradiction = message;
  }

  /** Записывает вывод. true, если это новое знание. */
  private assert(a: Ref, b: Ref, isPositive: boolean, reason: HintReason): boolean {
    if (this.contradiction) return false;
    if (a.category === b.category) return false;

    const key = markKey(a, b);
    const known = this.state(a, b);
    if (known === (isPositive ? 'yes' : 'no')) return false;
    if (known !== 'unknown') {
      this.fail(
        `Противоречие: «${a.value}» и «${b.value}» одновременно связаны и не связаны.`,
      );
      return false;
    }

    if (isPositive) {
      this.positive.add(key);
      this.positivePairs.push([a, b]);
    } else {
      this.impossible.add(key);
    }

    this.steps.push({ a, b, positive: isPositive, reason, text: explain(a, b, isPositive, reason, this.clues) });

    if (isPositive) this.excludeRest(a, b, reason);
    return true;
  }

  /** Одна сущность — одно значение: остальное в строке и столбце отпадает. */
  private excludeRest(a: Ref, b: Ref, _from: HintReason): void {
    const categoryB = this.model.byId.get(b.category);
    const categoryA = this.model.byId.get(a.category);

    if (categoryB) {
      for (const value of categoryB.values) {
        if (value === b.value) continue;
        this.assert(a, { category: b.category, value }, false, { rule: 'taken', by: b.value });
      }
    }
    if (categoryA) {
      for (const value of categoryA.values) {
        if (value === a.value) continue;
        this.assert({ category: a.category, value }, b, false, { rule: 'taken', by: a.value });
      }
    }
  }

  private applyClues(): boolean {
    let changed = false;

    this.clues.forEach((clue, clueIndex) => {
      if (this.contradiction) return;
      const sameCategory = clue.a.category === clue.b.category;

      if (clue.kind === 'same') {
        if (sameCategory) {
          if (clue.a.value !== clue.b.value) {
            this.fail(
              `Улика ${clueIndex + 1} требует, чтобы «${clue.a.value}» и «${clue.b.value}» ` +
                `из одной категории были одной сущностью.`,
            );
          }
          return;
        }
        changed = this.assert(clue.a, clue.b, true, { rule: 'clue', clueIndex }) || changed;
        return;
      }

      if (clue.kind === 'different') {
        if (sameCategory) {
          if (clue.a.value === clue.b.value) {
            this.fail(`Улика ${clueIndex + 1} противоречит себе: «${clue.a.value}» не равно себе.`);
          }
          return;
        }
        changed = this.assert(clue.a, clue.b, false, { rule: 'clue', clueIndex }) || changed;
        return;
      }

      changed = this.applyOrderClue(clue, clueIndex) || changed;
    });

    return changed;
  }

  /** Отношения before, after и adjacent: сужают позиции с двух сторон. */
  private applyOrderClue(clue: Clue, clueIndex: number): boolean {
    const order = resolveOrder(this.model, clue.order);
    if (!order) {
      this.fail(
        `Улика ${clueIndex + 1} использует отношение «${clue.kind}», ` +
          `но упорядоченная категория не определена.`,
      );
      return false;
    }

    let changed = false;

    // Речь о двух разных сущностях: одна не может быть раньше самой себя.
    if (clue.a.category !== clue.b.category) {
      changed = this.assert(clue.a, clue.b, false, { rule: 'clue', clueIndex }) || changed;
    }

    const positionsA = this.candidates(clue.a, order);
    const positionsB = this.candidates(clue.b, order);
    if (!positionsA.length || !positionsB.length) {
      this.fail(`Улика ${clueIndex + 1}: в категории «${order.title}» не осталось вариантов.`);
      return changed;
    }

    const drop = (ref: Ref, position: number): void => {
      changed =
        this.assert(ref, { category: order.id, value: order.values[position] }, false, {
          rule: 'order',
          clueIndex,
        }) || changed;
    };

    const fits = (kind: Clue['kind'], own: number, other: number): boolean => {
      if (kind === 'before') return own < other;
      if (kind === 'after') return own > other;
      return Math.abs(own - other) === 1;
    };

    const mirror = clue.kind === 'before' ? 'after' : clue.kind === 'after' ? 'before' : 'adjacent';

    for (const position of positionsA) {
      if (!positionsB.some((other) => fits(clue.kind, position, other))) drop(clue.a, position);
    }
    for (const position of positionsB) {
      if (!positionsA.some((other) => fits(mirror, position, other))) drop(clue.b, position);
    }

    return changed;
  }

  /** Если вариант остался один — он и есть ответ. */
  private applyUniqueness(): boolean {
    let changed = false;
    const categories = this.categories;

    for (const from of categories) {
      for (const to of categories) {
        if (from.id === to.id) continue;
        for (const value of from.values) {
          const ref: Ref = { category: from.id, value };
          const options = this.candidates(ref, to);

          if (options.length === 0) {
            this.fail(`У «${value}» не осталось вариантов в категории «${to.title}».`);
            return changed;
          }
          if (options.length === 1) {
            const only: Ref = { category: to.id, value: to.values[options[0]] };
            if (this.state(ref, only) !== 'yes') {
              changed = this.assert(ref, only, true, { rule: 'last-option' }) || changed;
            }
          }
        }
      }
    }

    return changed;
  }

  /** Связь переносится: если A — это B, то всё известное про B верно и для A. */
  private applyTransitivity(): boolean {
    let changed = false;
    const categories = this.categories;

    // Копия: assert по ходу дела дописывает в positivePairs.
    for (const [a, b] of [...this.positivePairs]) {
      for (const third of categories) {
        if (third.id === a.category || third.id === b.category) continue;
        for (const value of third.values) {
          const target: Ref = { category: third.id, value };
          const viaB = this.state(b, target);
          const viaA = this.state(a, target);
          const through = (side: Ref): HintReason => ({ rule: 'transitive', through: side.value });

          if (viaB !== 'unknown' && viaA === 'unknown') {
            changed = this.assert(a, target, viaB === 'yes', through(b)) || changed;
          } else if (viaA !== 'unknown' && viaB === 'unknown') {
            changed = this.assert(b, target, viaA === 'yes', through(a)) || changed;
          }
        }
      }
    }

    return changed;
  }

  run(): DeduceResult {
    let guard = 0;
    let changed = true;

    while (changed && !this.contradiction && guard < 100) {
      guard += 1;
      changed = this.applyClues();
      changed = this.applyUniqueness() || changed;
      changed = this.applyTransitivity() || changed;
    }

    let unresolved = 0;
    const categories = this.categories;
    for (let i = 0; i < categories.length; i += 1) {
      for (let j = i + 1; j < categories.length; j += 1) {
        for (const valueA of categories[i].values) {
          for (const valueB of categories[j].values) {
            const cell = this.state(
              { category: categories[i].id, value: valueA },
              { category: categories[j].id, value: valueB },
            );
            if (cell === 'unknown') unresolved += 1;
          }
        }
      }
    }

    return {
      steps: this.steps,
      contradiction: this.contradiction,
      solved: !this.contradiction && unresolved === 0,
      unresolved,
    };
  }
}

/** Человеческое объяснение вывода. Структура остаётся в reason. */
function explain(a: Ref, b: Ref, positive: boolean, reason: HintReason, clues: Clue[]): string {
  const mark = positive ? '«да»' : '«нет»';
  const cell = `${a.value} — ${b.value}`;

  switch (reason.rule) {
    case 'clue': {
      const clue = clues[reason.clueIndex];
      return `Отметьте ${mark} в клетке «${cell}»: это прямо следует из улики ${reason.clueIndex + 1} — «${clue?.text ?? ''}».`;
    }
    case 'taken':
      return `Отметьте ${mark} в клетке «${cell}»: «${reason.by}» уже занято другой сущностью.`;
    case 'last-option':
      return `Отметьте ${mark} в клетке «${cell}»: других вариантов для «${a.value}» не осталось.`;
    case 'transitive':
      return `Отметьте ${mark} в клетке «${cell}»: связь переносится через «${reason.through}».`;
    case 'order': {
      const clue = clues[reason.clueIndex];
      return `Отметьте ${mark} в клетке «${cell}»: по улике ${reason.clueIndex + 1} — «${clue?.text ?? ''}» — такая позиция не подходит.`;
    }
  }
}

/** Полное рассуждение по делу с записью каждого шага. */
export function deduceCase(source: Case): DeduceResult {
  return new Board(buildModel(source), source.clues).run();
}

/**
 * Следующий обоснованный шаг с учётом того, что игрок уже отметил.
 * Возвращается и не отмеченная клетка, и отмеченная неверно —
 * во втором случае подсказка мягко исправляет игрока.
 */
export function nextHint(source: Case, marks: PlayerMarks = {}): Deduction | null {
  const { steps } = deduceCase(source);
  for (const step of steps) {
    const expected = step.positive ? 'yes' : 'no';
    if (marks[markKey(step.a, step.b)] !== expected) return step;
  }
  return null;
}

export { markKey };