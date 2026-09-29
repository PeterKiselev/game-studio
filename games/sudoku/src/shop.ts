/**
 * Каталог покупок «Академии Sudoku».
 *
 * Тот же урок, что и у «Дачных тайн»: 28 сентября VK отклонил их с
 * замечанием «стоимость покупки должна быть явно указана и видна до нажатия
 * на кнопку „Купить“». У Sudoku магазин был скопирован с тем же дефектом,
 * поэтому чиним до ответа её модератора, а не после второго отказа.
 *
 * Цена — данные товара, а не часть подписи кнопки: подпись меняется на
 * «Куплено», а стоимость должна оставаться на экране. Совпадение с
 * `services/payments/src/index.ts` держит тест.
 */

export const SKU_NO_ADS = 'sudoku_no_ads';
export const SKU_UNLIMITED_HINTS = 'sudoku_unlimited_hints';

export interface ShopItem {
  sku: string;
  /** Цена в голосах VK. Источник правды — каталог Worker, сверяется тестом. */
  price: number;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { sku: SKU_NO_ADS, price: 20 },
  { sku: SKU_UNLIMITED_HINTS, price: 20 },
];
