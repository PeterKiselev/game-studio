import { footprint, normalize, rotateCells } from '../src/rules';
import type { ItemDef, OrderDef, Placement } from '../src/rules';

/**
 * Перебор всех раскладок заказа — только для тестов и подбора заказов.
 * В игру не попадает: подсказок и автоматического решения у игрока нет.
 */

interface Option {
  placement: Placement;
  keys: string[];
}

function orientations(item: ItemDef): number[] {
  const seen = new Set<string>();
  const rots: number[] = [];
  for (let rot = 0; rot < 4; rot += 1) {
    const sig = JSON.stringify(normalize(rotateCells(item.cells, rot)));
    if (!seen.has(sig)) {
      seen.add(sig);
      rots.push(rot);
    }
  }
  return rots;
}

function optionsFor(order: OrderDef, item: ItemDef): Option[] {
  const options: Option[] = [];
  for (const rot of orientations(item)) {
    for (let y = 0; y < order.height; y += 1) {
      for (let x = 0; x < order.width; x += 1) {
        const placement: Placement = { itemId: item.id, x, y, rot };
        const cells = footprint(item, placement);
        if (cells.some(([cx, cy]) => cx >= order.width || cy >= order.height)) continue;
        options.push({ placement, keys: cells.map(([cx, cy]) => `${cx},${cy}`) });
      }
    }
  }
  return options;
}

function neighbours(keys: string[]): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const [x, y] = k.split(',').map(Number);
    out.add(`${x + 1},${y}`);
    out.add(`${x - 1},${y}`);
    out.add(`${x},${y + 1}`);
    out.add(`${x},${y - 1}`);
  }
  return out;
}

export interface SolveResult {
  count: number;
  solutions: Placement[][];
}

/**
 * Считает раскладки (до `limit`), в которых все предметы лежат без
 * пересечений. При `respectRule` хрупкое не касается тяжёлого сторонами.
 */
export function solve(
  order: OrderDef,
  options: { respectRule: boolean; limit?: number; keep?: number },
): SolveResult {
  const limit = options.limit ?? 100000;
  const keep = options.keep ?? 3;
  const all = order.items.map((item) => ({ item, opts: optionsFor(order, item) }));
  // Сначала самые «тесные» предметы — меньше ветвлений.
  all.sort((a, b) => a.opts.length - b.opts.length);

  const solutions: Placement[][] = [];
  let count = 0;
  const occupied = new Set<string>();
  const kindAt = new Map<string, 'fragile' | 'heavy' | 'plain'>();
  const chosen: Placement[] = [];

  function violates(item: ItemDef, keys: string[]): boolean {
    if (!options.respectRule || item.kind === 'plain') return false;
    const wanted = item.kind === 'fragile' ? 'heavy' : 'fragile';
    for (const n of neighbours(keys)) {
      if (kindAt.get(n) === wanted) return true;
    }
    return false;
  }

  function go(index: number): void {
    if (count >= limit) return;
    if (index === all.length) {
      count += 1;
      if (solutions.length < keep) solutions.push([...chosen]);
      return;
    }
    const { item, opts } = all[index];
    for (const option of opts) {
      if (option.keys.some((k) => occupied.has(k))) continue;
      if (violates(item, option.keys)) continue;
      for (const k of option.keys) {
        occupied.add(k);
        kindAt.set(k, item.kind);
      }
      chosen.push(option.placement);
      go(index + 1);
      chosen.pop();
      for (const k of option.keys) {
        occupied.delete(k);
        kindAt.delete(k);
      }
    }
  }

  go(0);
  return { count, solutions };
}
