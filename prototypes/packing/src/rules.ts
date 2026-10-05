/**
 * Правила упаковки — чистые функции без DOM, таймеров и случайности.
 *
 * Предмет — набор клеток на плоской сетке. Предмет можно повернуть на 90°
 * по часовой стрелке (rot = 0..3). Заказ собран, когда каждый предмет
 * лежит в коробке ровно один раз, предметы не пересекаются, и хрупкий
 * предмет ни одной стороной не касается тяжёлого (по диагонали — можно).
 * «Обычные» предметы могут касаться кого угодно.
 */

/** Клетка в виде [x, y]; y растёт вниз, как на экране. */
export type Cell = readonly [number, number];

export type Kind = 'fragile' | 'heavy' | 'plain';

export interface ItemDef {
  id: string;
  kind: Kind;
  cells: readonly Cell[];
}

export interface Placement {
  itemId: string;
  /** Левый верхний угол габаритной рамки предмета (после поворота). */
  x: number;
  y: number;
  rot: number;
}

export interface OrderDef {
  id: string;
  width: number;
  height: number;
  items: readonly ItemDef[];
}

export type PlacementProblem = 'outside' | 'overlap';

/** Сдвигает клетки так, чтобы минимальные x и y стали нулями, и упорядочивает их. */
export function normalize(cells: readonly Cell[]): Cell[] {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map((c): Cell => [c[0] - minX, c[1] - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Поворот на 90° по часовой стрелке `rot` раз; (x, y) → (−y, x) при оси y вниз. */
export function rotateCells(cells: readonly Cell[], rot: number): Cell[] {
  const turns = ((rot % 4) + 4) % 4;
  let current: Cell[] = normalize(cells);
  for (let i = 0; i < turns; i += 1) {
    current = normalize(current.map((c): Cell => [-c[1], c[0]]));
  }
  return current;
}

export function bounds(cells: readonly Cell[]): { w: number; h: number } {
  return {
    w: Math.max(...cells.map((c) => c[0])) + 1,
    h: Math.max(...cells.map((c) => c[1])) + 1,
  };
}

/** Абсолютные клетки предмета на доске для данного размещения. */
export function footprint(item: ItemDef, p: Placement): Cell[] {
  return rotateCells(item.cells, p.rot).map((c): Cell => [c[0] + p.x, c[1] + p.y]);
}

const key = (c: Cell): string => `${c[0]},${c[1]}`;

function itemById(order: OrderDef, id: string): ItemDef | undefined {
  return order.items.find((item) => item.id === id);
}

/**
 * Можно ли положить предмет сюда: внутри коробки и без пересечений с уже
 * лежащими. Касание хрупкого и тяжёлого здесь НЕ проверяется — оно
 * разрешено при укладке и блокирует только завершение заказа, чтобы игрок
 * видел, что именно не так, а не получал отказ без объяснения.
 */
export function placementProblem(
  order: OrderDef,
  placements: readonly Placement[],
  candidate: Placement,
): PlacementProblem | null {
  const item = itemById(order, candidate.itemId);
  if (!item) return 'outside';
  const cells = footprint(item, candidate);
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= order.width || y >= order.height) return 'outside';
  }
  const occupied = new Set<string>();
  for (const other of placements) {
    if (other.itemId === candidate.itemId) continue;
    const otherItem = itemById(order, other.itemId);
    if (!otherItem) continue;
    for (const c of footprint(otherItem, other)) occupied.add(key(c));
  }
  return cells.some((c) => occupied.has(key(c))) ? 'overlap' : null;
}

/** Пары [хрупкий, тяжёлый], которые соприкасаются сторонами. */
export function touchingPairs(order: OrderDef, placements: readonly Placement[]): [string, string][] {
  const byCell = new Map<string, string>();
  for (const p of placements) {
    const item = itemById(order, p.itemId);
    if (!item) continue;
    for (const c of footprint(item, p)) byCell.set(key(c), p.itemId);
  }
  const found = new Map<string, [string, string]>();
  for (const p of placements) {
    const item = itemById(order, p.itemId);
    if (!item || item.kind !== 'fragile') continue;
    for (const [x, y] of footprint(item, p)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const neighbourId = byCell.get(key([x + dx, y + dy]));
        if (!neighbourId || neighbourId === p.itemId) continue;
        if (itemById(order, neighbourId)?.kind === 'heavy') {
          found.set(`${p.itemId}|${neighbourId}`, [p.itemId, neighbourId]);
        }
      }
    }
  }
  return [...found.values()];
}

export interface Evaluation {
  /** Предметы, которых нет в коробке. */
  missing: string[];
  /** Предметы, вышедшие за коробку, или неизвестные идентификаторы. */
  outside: string[];
  /** Пары предметов, занявших одну клетку. */
  overlaps: [string, string][];
  /** Хрупкое касается тяжёлого. */
  touches: [string, string][];
  /** Заказ собран: все предметы на месте и ни одно правило не нарушено. */
  complete: boolean;
}

export function evaluate(order: OrderDef, placements: readonly Placement[]): Evaluation {
  const seen = new Set<string>();
  const outside: string[] = [];
  const owner = new Map<string, string>();
  const overlapKeys = new Map<string, [string, string]>();
  const duplicates: string[] = [];

  for (const p of placements) {
    const item = itemById(order, p.itemId);
    if (!item) {
      outside.push(p.itemId);
      continue;
    }
    if (seen.has(p.itemId)) {
      duplicates.push(p.itemId);
      continue;
    }
    seen.add(p.itemId);
    const cells = footprint(item, p);
    if (cells.some(([x, y]) => x < 0 || y < 0 || x >= order.width || y >= order.height)) {
      outside.push(p.itemId);
      continue;
    }
    for (const c of cells) {
      const prior = owner.get(key(c));
      if (prior && prior !== p.itemId) overlapKeys.set(`${prior}|${p.itemId}`, [prior, p.itemId]);
      else owner.set(key(c), p.itemId);
    }
  }

  const missing = order.items.filter((item) => !seen.has(item.id)).map((item) => item.id);
  const overlaps = [...overlapKeys.values()];
  const valid = placements.filter((p) => !outside.includes(p.itemId) && !duplicates.includes(p.itemId));
  const touches = touchingPairs(order, valid);
  return {
    missing,
    outside,
    overlaps,
    touches,
    complete:
      missing.length === 0 &&
      outside.length === 0 &&
      duplicates.length === 0 &&
      overlaps.length === 0 &&
      touches.length === 0,
  };
}
