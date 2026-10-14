import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS, buyLabel, oks, priceText, votes } from '../src/shop';
import { ITEMS } from '../../../services/payments/src/index';

/**
 * Этот файл существует из-за конкретного отказа модерации VK 28 сентября:
 * «стоимость покупки должна быть явно указана и видна до нажатия на кнопку
 * „Купить“». Цена была только на сервере, игрок видел её уже после клика.
 *
 * Теперь цена продублирована в клиенте, и главный риск сместился: два
 * списка цен могут разъехаться молча. Сверка с каталогом Worker — ровно
 * про это; без неё исправление одного отказа готовит следующий.
 */

describe('каталог магазина сходится с платёжным сервером', () => {
  it.each(SHOP_ITEMS.map((item) => [item.sku, item] as const))('%s есть в каталоге Worker', (sku, item) => {
    expect(ITEMS[sku], `SKU ${sku} отсутствует в services/payments`).toBeDefined();
    expect(item.price, `цена ${sku} в игре разошлась с сервером`).toBe(ITEMS[sku].price);
    expect(item.priceOk, `цена ${sku} в ОКах в игре разошлась с сервером`).toBe(ITEMS[sku].priceOk);
  });

  it('цены в ОКах — решение владельца: по 20 ОК, целые', () => {
    for (const item of SHOP_ITEMS) {
      expect(item.priceOk).toBe(20);
      expect(Number.isInteger(ITEMS[item.sku].priceOk)).toBe(true);
    }
  });

  it('цена положительная и целая — VK принимает только целые голоса', () => {
    for (const item of SHOP_ITEMS) {
      expect(Number.isInteger(item.price)).toBe(true);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('в магазине ровно два товара, оба с названием и описанием', () => {
    expect(SHOP_ITEMS).toHaveLength(2);
    for (const item of SHOP_ITEMS) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('цена показывается по-русски грамотно', () => {
  it('склоняет «голос» по числу, а не пишет «20 голос»', () => {
    expect(votes(1)).toBe('1 голос');
    expect(votes(2)).toBe('2 голоса');
    expect(votes(5)).toBe('5 голосов');
    expect(votes(11)).toBe('11 голосов');
    expect(votes(20)).toBe('20 голосов');
    expect(votes(21)).toBe('21 голос');
  });

  it('в ОК цена и кнопка — в ОКах, во ВКонтакте — в голосах', () => {
    const [item] = SHOP_ITEMS;
    expect(oks(20)).toBe('20 ОК');
    expect(priceText(item, 'ok')).toBe('20 ОК');
    expect(buyLabel(item, 'ok')).toBe('Купить за 20 ОК');
    expect(priceText(item, 'vk-votes')).toBe('20 голосов');
    expect(buyLabel(item)).toBe('Купить за 20 голосов');
  });

  it('подпись кнопки называет цену — это и есть требование модератора', () => {
    for (const item of SHOP_ITEMS) {
      const label = buyLabel(item);
      expect(label).toContain(String(item.price));
      expect(label).toMatch(/^Купить за /);
    }
  });
});
