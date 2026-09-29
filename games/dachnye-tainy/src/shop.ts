/**
 * Каталог покупок «Дачных тайн».
 *
 * Отдельный модуль, а не массив внутри main.ts, по конкретной причине:
 * 28 сентября VK отклонил игру с замечанием «стоимость покупки должна быть
 * явно указана и видна до нажатия на кнопку „Купить“». Цена была только на
 * сервере (`services/payments`), и игрок впервые видел её уже в окне VK —
 * после клика. Теперь цена лежит в данных товара, показывается до клика и
 * сверяется тестом с каталогом Worker: два несверяемых списка цен
 * разъезжаются рано или поздно, и узнать об этом от модератора второй раз
 * было бы обидно.
 */

export const SKU_NO_ADS = 'dachnye_tainy_no_ads';
export const SKU_UNLIMITED_HINTS = 'dachnye_tainy_unlimited_hints';

export interface ShopItem {
  sku: string;
  title: string;
  description: string;
  /** Цена в голосах VK. Источник правды — `services/payments/src/index.ts`, сверяется тестом. */
  price: number;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    sku: SKU_NO_ADS,
    title: 'Без рекламы',
    description: 'Убирает рекламу между делами навсегда. Подсказки за рекламу остаются по желанию.',
    price: 20,
  },
  {
    sku: SKU_UNLIMITED_HINTS,
    title: 'Безлимитные подсказки',
    description: 'Все подсказки, кроме первой, становятся бесплатными — без рекламы.',
    price: 20,
  },
];

/** «1 голос», «2 голоса», «5 голосов», «21 голос» — цену показываем грамотно, а не «20 голос(ов)». */
export function votes(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun =
    mod100 >= 11 && mod100 <= 14
      ? 'голосов'
      : mod10 === 1
        ? 'голос'
        : mod10 >= 2 && mod10 <= 4
          ? 'голоса'
          : 'голосов';
  return `${count} ${noun}`;
}

/** Подпись кнопки покупки. Цена в ней — требование модератора VK, а не украшение. */
export function buyLabel(item: ShopItem): string {
  return `Купить за ${votes(item.price)}`;
}
