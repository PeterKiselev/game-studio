import type { Kind } from './rules';

export type Locale = 'ru' | 'en';

export interface Strings {
  title: string;
  orderOf: (n: number, total: number) => string;
  goal: (count: number) => string;
  rule: string;
  kinds: Record<Kind, string>;
  items: Record<string, string>;
  tray: string;
  trayEmpty: string;
  rotate: string;
  reset: string;
  next: string;
  allDone: string;
  backToStart: string;
  boardLabel: string;
  cellLabel: (row: number, col: number, content: string) => string;
  empty: string;
  hintStart: string;
  holding: (name: string, kind: string) => string;
  occupied: string;
  picked: (name: string) => string;
  touching: (fragile: string, heavy: string) => string;
  placedMore: (left: number) => string;
  complete: string;
  completeAll: string;
  deselect: string;
  lockedOrder: string;
  doneMark: string;
}

const ru: Strings = {
  title: 'Бережная посылка',
  orderOf: (n, total) => `Заказ ${n} из ${total}`,
  goal: (count) => `Уложи все предметы (${count}) в коробку.`,
  rule: 'Хрупкое не должно касаться тяжёлого сторонами. По диагонали — можно.',
  kinds: { fragile: 'Хрупкое', heavy: 'Тяжёлое', plain: 'Обычное' },
  items: {
    cup: 'Кружка',
    vase: 'Ваза',
    teapot: 'Чайник',
    lamp: 'Лампа',
    book: 'Книга',
    dumbbell: 'Гантель',
    toolbox: 'Ящик с инструментом',
    anvil: 'Наковальня',
    teddy: 'Мишка',
    cushion: 'Подушка',
  },
  tray: 'Предметы',
  trayEmpty: 'Все предметы в коробке',
  rotate: 'Повернуть',
  reset: 'Начать заново',
  next: 'Следующий заказ',
  allDone: 'Все пять заказов собраны. Спасибо, что поиграли!',
  backToStart: 'К первому заказу',
  boardLabel: 'Коробка',
  cellLabel: (row, col, content) => `Ряд ${row}, колонка ${col}: ${content}`,
  empty: 'пусто',
  hintStart: 'Выбери предмет внизу, затем коснись клетки коробки. «Повернуть» поворачивает предмет в руке.',
  holding: (name, kind) => `В руке: ${name} (${kind.toLowerCase()}). Коснись клетки коробки.`,
  occupied: 'Здесь занято — выбери другое место.',
  picked: (name) => `${name} снова в руке. Положи в другое место или поверни.`,
  touching: (fragile, heavy) => `${fragile} и ${heavy.toLowerCase()} соприкасаются сторонами. Разведи их: по диагонали можно.`,
  placedMore: (left) => `Осталось предметов: ${left}.`,
  complete: 'Заказ собран!',
  completeAll: 'Заказ собран! Это был последний.',
  deselect: 'Убрать из руки',
  lockedOrder: 'Откроется после предыдущего заказа',
  doneMark: 'собран',
};

const en: Strings = {
  title: 'Careful Parcel',
  orderOf: (n, total) => `Order ${n} of ${total}`,
  goal: (count) => `Fit all ${count} items into the box.`,
  rule: 'Fragile items must not touch heavy ones along a side. Diagonal is fine.',
  kinds: { fragile: 'Fragile', heavy: 'Heavy', plain: 'Plain' },
  items: {
    cup: 'Cup',
    vase: 'Vase',
    teapot: 'Teapot',
    lamp: 'Lamp',
    book: 'Book',
    dumbbell: 'Dumbbell',
    toolbox: 'Toolbox',
    anvil: 'Anvil',
    teddy: 'Teddy bear',
    cushion: 'Cushion',
  },
  tray: 'Items',
  trayEmpty: 'All items are in the box',
  rotate: 'Rotate',
  reset: 'Start over',
  next: 'Next order',
  allDone: 'All five orders packed. Thanks for playing!',
  backToStart: 'Back to order 1',
  boardLabel: 'Box',
  cellLabel: (row, col, content) => `Row ${row}, column ${col}: ${content}`,
  empty: 'empty',
  hintStart: 'Pick an item below, then tap a cell in the box. “Rotate” turns the item in your hand.',
  holding: (name, kind) => `Holding: ${name} (${kind.toLowerCase()}). Tap a cell in the box.`,
  occupied: 'That spot is taken — pick another place.',
  picked: (name) => `${name} is back in your hand. Put it elsewhere or rotate it.`,
  touching: (fragile, heavy) => `${fragile} and ${heavy.toLowerCase()} touch along a side. Separate them: diagonal is fine.`,
  placedMore: (left) => `Items left: ${left}.`,
  complete: 'Order packed!',
  completeAll: 'Order packed! That was the last one.',
  deselect: 'Put down',
  lockedOrder: 'Unlocks after the previous order',
  doneMark: 'packed',
};

export const DICTS: Record<Locale, Strings> = { ru, en };

/** `?lang=` главнее языка браузера; без него русский только для русских локалей. */
export function detectLocale(search: string, browserLanguage: string): Locale {
  const requested = new URLSearchParams(search).get('lang');
  if (requested === 'ru' || requested === 'en') return requested;
  return browserLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
