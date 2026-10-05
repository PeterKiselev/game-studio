import { describe, expect, it } from 'vitest';
import { ORDERS } from '../src/orders';
import { evaluate } from '../src/rules';
import type { Placement } from '../src/rules';
import solutions from './solutions.json';
import tempting from './tempting.json';
import { solve } from './solver';

const known = solutions as Record<string, Placement[]>;

describe('заказы', () => {
  it('их ровно пять, идентификаторы уникальны, предметы помещаются по площади', () => {
    expect(ORDERS).toHaveLength(5);
    expect(new Set(ORDERS.map((o) => o.id)).size).toBe(5);
    for (const order of ORDERS) {
      const cells = order.items.reduce((sum, item) => sum + item.cells.length, 0);
      expect(cells).toBeLessThan(order.width * order.height);
    }
  });

  it('в каждом заказе есть и хрупкое, и тяжёлое — правило участвует во всех', () => {
    for (const order of ORDERS) {
      const kinds = new Set(order.items.map((i) => i.kind));
      expect(kinds.has('fragile')).toBe(true);
      expect(kinds.has('heavy')).toBe(true);
    }
  });

  it('для каждого заказа хранится проверенная раскладка, и все предметы в ней учтены', () => {
    for (const order of ORDERS) {
      const solution = known[order.id];
      expect(solution, order.id).toBeDefined();
      expect(solution.map((p) => p.itemId).sort()).toEqual(order.items.map((i) => i.id).sort());
    }
  });
});

describe('известные решения принимаются, испорченные — нет', () => {
  for (const order of ORDERS) {
    describe(order.id, () => {
      const solution = known[order.id];

      it('известное решение принято', () => {
        expect(evaluate(order, solution).complete).toBe(true);
      });

      it('без любого одного предмета заказ не собран', () => {
        for (let i = 0; i < solution.length; i += 1) {
          const partial = solution.filter((_, j) => j !== i);
          expect(evaluate(order, partial).complete).toBe(false);
        }
      });

      it('сдвиг любого предмета за край коробки не собран', () => {
        for (let i = 0; i < solution.length; i += 1) {
          const moved = solution.map((p, j) => (j === i ? { ...p, x: order.width } : p));
          const result = evaluate(order, moved);
          expect(result.complete).toBe(false);
          expect(result.outside).toContain(solution[i].itemId);
        }
      });

      it('наложение первого предмета на второй не собран', () => {
        const [a, b] = solution;
        const stacked = solution.map((p) => (p.itemId === b.itemId ? { ...p, x: a.x, y: a.y, rot: a.rot } : p));
        expect(evaluate(order, stacked).complete).toBe(false);
      });
    });
  }
});

describe('соблазнительная неверная раскладка во втором заказе', () => {
  const order = ORDERS[1];
  const wrong = (tempting as Record<string, Placement[]>)[order.id];

  it('предметы лежат в коробке без пересечений и все на месте — но заказ не собран', () => {
    const result = evaluate(order, wrong);
    expect(result.missing).toEqual([]);
    expect(result.outside).toEqual([]);
    expect(result.overlaps).toEqual([]);
    expect(result.touches.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });

  it('и это не случайность: нарушает правило подавляющее большинство плотных раскладок', () => {
    const all = solve(order, { respectRule: false, limit: 100000, keep: 0 });
    const ok = solve(order, { respectRule: true, limit: 100000, keep: 0 });
    expect(ok.count).toBeGreaterThan(0);
    expect(1 - ok.count / all.count).toBeGreaterThan(0.9);
  });
});

describe('правило ограничивает сильнее от заказа к заказу', () => {
  it('доля допустимых раскладок среди всех плотных в 1-м заказе заметно выше, чем в последнем', () => {
    const share = (index: number): number => {
      const order = ORDERS[index];
      const all = solve(order, { respectRule: false, limit: 500000, keep: 0 });
      const ok = solve(order, { respectRule: true, limit: 500000, keep: 0 });
      expect(ok.count, order.id).toBeGreaterThan(0);
      return ok.count / all.count;
    };
    expect(share(0)).toBeGreaterThan(0.4);
    expect(share(4)).toBeLessThan(0.05);
  });
});
