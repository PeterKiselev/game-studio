import { describe, expect, it } from 'vitest';
import { PackingGame } from '../src/game';
import { ORDERS } from '../src/orders';
import type { Placement } from '../src/rules';
import solutions from './solutions.json';
import tempting from './tempting.json';

const known = solutions as Record<string, Placement[]>;

/** Играет раскладку через те же методы, что вызывает интерфейс: выбрать, повернуть, коснуться клетки. */
function playLayout(game: PackingGame, layout: readonly Placement[]) {
  let last: ReturnType<PackingGame['tapCell']> = { type: 'noop' };
  for (const p of layout) {
    game.select(p.itemId);
    for (let i = 0; i < p.rot; i += 1) game.rotate();
    last = game.tapCell(p.x, p.y);
  }
  return last;
}

describe('PackingGame: рука и поворот', () => {
  it('выбор предмета берёт его в руку, повторный выбор — убирает', () => {
    const game = new PackingGame(ORDERS[0]);
    game.select('cup');
    expect(game.heldId).toBe('cup');
    game.select('cup');
    expect(game.heldId).toBeNull();
  });

  it('повернуть можно только предмет в руке', () => {
    const game = new PackingGame(ORDERS[0]);
    expect(game.rotate()).toBe(false);
    game.select('book');
    expect(game.rotate()).toBe(true);
    expect(game.rotationOf('book')).toBe(1);
  });

  it('предпросмотр прижимает предмет к краю, а не отвергает касание у границы', () => {
    const game = new PackingGame(ORDERS[0]); // 3×3
    game.select('book'); // 2×1
    const preview = game.previewAt(2, 2)!;
    expect(preview.placement).toMatchObject({ x: 1, y: 2 });
    expect(preview.problem).toBeNull();
  });

  it('предпросмотр без предмета в руке пуст', () => {
    expect(new PackingGame(ORDERS[0]).previewAt(0, 0)).toBeNull();
  });
});

describe('PackingGame: укладка', () => {
  it('размещение на занятое место отвергнуто, предмет остаётся в руке', () => {
    const game = new PackingGame(ORDERS[0]);
    game.select('teddy');
    game.tapCell(0, 0);
    game.select('cup');
    const result = game.tapCell(0, 0);
    expect(result).toEqual({ type: 'rejected', problem: 'overlap' });
    expect(game.heldId).toBe('cup');
    expect(game.placements).toHaveLength(1);
  });

  it('касание уложенного предмета возвращает его в руку вместе с поворотом', () => {
    const game = new PackingGame(ORDERS[0]);
    game.select('book');
    game.rotate();
    game.tapCell(0, 0);
    expect(game.placements).toHaveLength(1);
    const result = game.tapCell(0, 1); // вертикальная книга занимает (0,0) и (0,1)
    expect(result).toEqual({ type: 'picked', itemId: 'book' });
    expect(game.placements).toHaveLength(0);
    expect(game.heldId).toBe('book');
    expect(game.rotationOf('book')).toBe(1);
  });

  it('касание пустой клетки без предмета в руке ничего не делает', () => {
    expect(new PackingGame(ORDERS[0]).tapCell(1, 1)).toEqual({ type: 'noop' });
  });

  it('первое размещение отмечено, последующие — нет', () => {
    const game = new PackingGame(ORDERS[0]);
    game.select('teddy');
    const first = game.tapCell(0, 0);
    game.select('cup');
    const second = game.tapCell(2, 0);
    expect(first).toMatchObject({ type: 'placed', first: true });
    expect(second).toMatchObject({ type: 'placed', first: false });
  });
});

describe('PackingGame: известные решения играются до конца', () => {
  for (const order of ORDERS) {
    it(`${order.id}: решение через выбор, поворот и касание собирает заказ`, () => {
      const game = new PackingGame(order);
      const last = playLayout(game, known[order.id]);
      expect(last).toMatchObject({ type: 'placed' });
      expect(game.completed).toBe(true);
      expect(game.evaluation().complete).toBe(true);
      expect(game.trayIds()).toEqual([]);
    });
  }

  it('после сборки поле заблокировано: брать и ставить предметы нельзя', () => {
    const game = new PackingGame(ORDERS[0]);
    playLayout(game, known['order-1']);
    expect(game.tapCell(0, 0)).toEqual({ type: 'noop' });
    expect(game.rotate()).toBe(false);
    game.select('cup');
    expect(game.heldId).toBeNull();
  });
});

describe('PackingGame: неверная полная раскладка не даёт победу', () => {
  const order = ORDERS[1];
  const wrong = (tempting as Record<string, Placement[]>)[order.id];

  it('все предметы уложены, но хрупкое касается тяжёлого — заказ не собран', () => {
    const game = new PackingGame(order);
    const last = playLayout(game, wrong);
    expect(last).toMatchObject({ type: 'placed' });
    expect(game.completed).toBe(false);
    expect(game.trayIds()).toEqual([]);
    const ev = game.evaluation();
    expect(ev.touches.length).toBeGreaterThan(0);
    expect(ev.missing).toEqual([]);
  });

  it('игрок исправляет раскладку, переложив предметы, — и тогда заказ собран', () => {
    const game = new PackingGame(order);
    playLayout(game, wrong);
    // Взять каждый предмет в руку и положить обратно в ряд, затем сыграть решение.
    for (const p of [...game.placements]) {
      expect(game.tapCell(p.x, p.y)).toMatchObject({ type: 'picked', itemId: p.itemId });
      game.deselect();
    }
    expect(game.placements).toHaveLength(0);
    expect(game.trayIds()).toHaveLength(order.items.length);
    playLayout(game, known[order.id]);
    expect(game.completed).toBe(true);
  });

  it('сброс очищает коробку, руку, повороты и признак завершения', () => {
    const game = new PackingGame(ORDERS[0]);
    playLayout(game, known['order-1']);
    game.reset();
    expect(game.completed).toBe(false);
    expect(game.placements).toEqual([]);
    expect(game.heldId).toBeNull();
    expect(game.rotationOf('book')).toBe(0);
    expect(game.trayIds()).toHaveLength(ORDERS[0].items.length);
  });
});
