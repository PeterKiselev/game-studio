import { describe, expect, it } from 'vitest';
import { bounds, evaluate, footprint, normalize, placementProblem, rotateCells, touchingPairs } from '../src/rules';
import type { ItemDef, OrderDef, Placement } from '../src/rules';

const cup: ItemDef = { id: 'cup', kind: 'fragile', cells: [[0, 0]] };
const book: ItemDef = { id: 'book', kind: 'heavy', cells: [[0, 0], [1, 0]] };
const teddy: ItemDef = { id: 'teddy', kind: 'plain', cells: [[0, 0], [0, 1], [1, 1]] };
const lamp: ItemDef = { id: 'lamp', kind: 'fragile', cells: [[0, 0], [0, 1], [0, 2]] };

const order: OrderDef = { id: 't', width: 4, height: 3, items: [cup, book, teddy] };

const place = (itemId: string, x: number, y: number, rot = 0): Placement => ({ itemId, x, y, rot });

describe('поворот и форма', () => {
  it('нормализует клетки к нулю и упорядочивает их', () => {
    expect(normalize([[3, 5], [4, 5], [3, 6]])).toEqual([[0, 0], [1, 0], [0, 1]]);
  });

  it('поворот по часовой: горизонтальная тройка становится вертикальной', () => {
    expect(rotateCells([[0, 0], [1, 0], [2, 0]], 1)).toEqual([[0, 0], [0, 1], [0, 2]]);
  });

  it('четыре поворота возвращают исходную форму, пять равны одному', () => {
    const l = [[0, 0], [0, 1], [1, 1]] as const;
    expect(rotateCells(l, 4)).toEqual(normalize(l));
    expect(rotateCells(l, 5)).toEqual(rotateCells(l, 1));
    expect(rotateCells(l, -1)).toEqual(rotateCells(l, 3));
  });

  it('L-образный предмет после поворота на 90° занимает другие клетки', () => {
    const l = [[0, 0], [0, 1], [1, 1]] as const;
    expect(rotateCells(l, 1)).toEqual([[0, 0], [1, 0], [0, 1]]);
    expect(bounds(rotateCells(l, 1))).toEqual({ w: 2, h: 2 });
  });

  it('габариты вертикальной тройки: 1×3, после поворота 3×1', () => {
    expect(bounds(rotateCells(lamp.cells, 0))).toEqual({ w: 1, h: 3 });
    expect(bounds(rotateCells(lamp.cells, 1))).toEqual({ w: 3, h: 1 });
  });

  it('footprint сдвигает повёрнутую форму на позицию размещения', () => {
    expect(footprint(book, place('book', 2, 1, 1))).toEqual([[2, 1], [2, 2]]);
  });
});

describe('placementProblem', () => {
  it('принимает размещение внутри коробки', () => {
    expect(placementProblem(order, [], place('book', 2, 0))).toBeNull();
  });

  it('отвергает выход за правый, нижний, левый и верхний край', () => {
    expect(placementProblem(order, [], place('book', 3, 0))).toBe('outside');
    expect(placementProblem(order, [], place('teddy', 0, 2))).toBe('outside');
    expect(placementProblem(order, [], place('cup', -1, 0))).toBe('outside');
    expect(placementProblem(order, [], place('cup', 0, -1))).toBe('outside');
  });

  it('отвергает пересечение с уже лежащим предметом', () => {
    expect(placementProblem(order, [place('book', 0, 0)], place('cup', 1, 0))).toBe('overlap');
  });

  it('не считает пересечением сам предмет при перекладывании', () => {
    expect(placementProblem(order, [place('book', 0, 0)], place('book', 1, 0))).toBeNull();
  });

  it('позволяет поставить хрупкое вплотную к тяжёлому — это блокирует только завершение', () => {
    expect(placementProblem(order, [place('book', 0, 0)], place('cup', 2, 0))).toBeNull();
  });
});

describe('хрупкое и тяжёлое', () => {
  it('сторона к стороне — касание, в любую из четырёх сторон', () => {
    const base = place('book', 1, 1);
    for (const [x, y] of [[0, 1], [3, 1], [1, 0], [2, 2]]) {
      expect(touchingPairs(order, [base, place('cup', x, y)])).toEqual([['cup', 'book']]);
    }
  });

  it('по диагонали — не касание', () => {
    expect(touchingPairs(order, [place('book', 1, 1), place('cup', 0, 0)])).toEqual([]);
    expect(touchingPairs(order, [place('book', 1, 1), place('cup', 3, 2)])).toEqual([]);
  });

  it('обычный предмет не создаёт касаний ни с хрупким, ни с тяжёлым', () => {
    expect(touchingPairs(order, [place('teddy', 1, 0), place('cup', 0, 0), place('book', 2, 1)])).toEqual([]);
  });

  it('два хрупких или два тяжёлых рядом — допустимо', () => {
    const o: OrderDef = {
      id: 'two',
      width: 3,
      height: 1,
      items: [cup, { id: 'cup2', kind: 'fragile', cells: [[0, 0]] }],
    };
    expect(touchingPairs(o, [place('cup', 0, 0), place('cup2', 1, 0)])).toEqual([]);
  });
});

describe('evaluate', () => {
  const good = [place('cup', 0, 0), place('book', 2, 2), place('teddy', 0, 1)];

  it('принимает полную раскладку без нарушений', () => {
    const result = evaluate(order, good);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('неполный заказ — не собран, и называет недостающее', () => {
    const result = evaluate(order, good.slice(0, 2));
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['teddy']);
  });

  it('предмет за границей коробки — не собран', () => {
    const result = evaluate(order, [place('cup', 0, 0), place('book', 3, 2), place('teddy', 0, 1)]);
    expect(result.complete).toBe(false);
    expect(result.outside).toEqual(['book']);
  });

  it('пересечение предметов — не собран', () => {
    const result = evaluate(order, [place('cup', 0, 0), place('book', 0, 0), place('teddy', 2, 1)]);
    expect(result.complete).toBe(false);
    expect(result.overlaps.length).toBe(1);
  });

  it('касание хрупкого и тяжёлого — полная раскладка, но не собран', () => {
    const touching = [place('cup', 0, 0), place('book', 1, 0), place('teddy', 0, 1)];
    const result = evaluate(order, touching);
    expect(result.missing).toEqual([]);
    expect(result.overlaps).toEqual([]);
    expect(result.touches).toEqual([['cup', 'book']]);
    expect(result.complete).toBe(false);
  });

  it('тот же предмет дважды — не собран', () => {
    expect(evaluate(order, [...good, place('cup', 3, 0)]).complete).toBe(false);
  });

  it('неизвестный предмет — не собран', () => {
    expect(evaluate(order, [...good, place('ghost', 3, 0)]).complete).toBe(false);
  });

  it('поворот учитывается: тот же предмет с поворотом может выйти за край', () => {
    const rotated = [place('cup', 0, 0), place('book', 2, 2, 1), place('teddy', 0, 1)];
    expect(evaluate(order, rotated).outside).toEqual(['book']);
    const fits = [place('cup', 0, 0), place('book', 3, 1, 1), place('teddy', 0, 1)];
    expect(evaluate(order, fits).complete).toBe(true);
  });
});
