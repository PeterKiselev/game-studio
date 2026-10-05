import type { ItemDef, OrderDef } from './rules';

/**
 * Каталог предметов и пять заказов. Форма и сложность подобраны перебором
 * (см. test/orders.test.ts): в каждом заказе есть хотя бы одна раскладка,
 * удовлетворяющая правилу, а доля «просто плотных» раскладок, нарушающих
 * правило, растёт от заказа к заказу.
 */
const ITEMS: Record<string, ItemDef> = {
  cup: { id: 'cup', kind: 'fragile', cells: [[0, 0]] },
  vase: { id: 'vase', kind: 'fragile', cells: [[0, 0], [0, 1]] },
  teapot: { id: 'teapot', kind: 'fragile', cells: [[0, 0], [1, 0], [0, 1]] },
  lamp: { id: 'lamp', kind: 'fragile', cells: [[0, 0], [0, 1], [0, 2]] },
  book: { id: 'book', kind: 'heavy', cells: [[0, 0], [1, 0]] },
  dumbbell: { id: 'dumbbell', kind: 'heavy', cells: [[0, 0], [1, 0], [2, 0]] },
  toolbox: { id: 'toolbox', kind: 'heavy', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  anvil: { id: 'anvil', kind: 'heavy', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  teddy: { id: 'teddy', kind: 'plain', cells: [[0, 1], [0, 0], [1, 1]] },
  cushion: { id: 'cushion', kind: 'plain', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

function order(id: string, width: number, height: number, itemIds: string[]): OrderDef {
  return { id, width, height, items: itemIds.map((itemId) => ITEMS[itemId]) };
}

export const ORDERS: readonly OrderDef[] = [
  // Обучающий: три предмета, просторно. Правило видно сразу, но легко соблюсти.
  order('order-1', 3, 3, ['cup', 'book', 'teddy']),
  // Плотная укладка «в угол» почти всегда сводит хрупкое с тяжёлым.
  order('order-2', 4, 4, ['teapot', 'vase', 'toolbox', 'teddy']),
  order('order-3', 5, 4, ['teapot', 'vase', 'dumbbell', 'toolbox', 'teddy']),
  order('order-4', 5, 5, ['lamp', 'teapot', 'vase', 'anvil', 'toolbox', 'cushion']),
  order('order-5', 4, 5, ['teapot', 'vase', 'anvil', 'toolbox', 'cushion']),
];

export const ORDER_IDS: readonly string[] = ORDERS.map((o) => o.id);
