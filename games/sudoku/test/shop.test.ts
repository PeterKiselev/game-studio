import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS } from '../src/shop';
import { locale, setLocale, t } from '../src/i18n';
import { ITEMS } from '../../../services/payments/src/index';

/** См. games/dachnye-tainy/test/shop.test.ts — тот же отказ модерации, та же защита от расхождения цен. */

const LOCALES = ['ru', 'en'] as const;

function withLocale<T>(value: (typeof LOCALES)[number], run: () => T): T {
  const previous = locale();
  setLocale(value);
  try {
    return run();
  } finally {
    setLocale(previous);
  }
}

describe('каталог магазина сходится с платёжным сервером', () => {
  it.each(SHOP_ITEMS.map((item) => [item.sku, item] as const))('%s есть в каталоге Worker', (sku, item) => {
    expect(ITEMS[sku], `SKU ${sku} отсутствует в services/payments`).toBeDefined();
    expect(item.price, `цена ${sku} в игре разошлась с сервером`).toBe(ITEMS[sku].price);
  });

  it('цена положительная и целая — VK принимает только целые голоса', () => {
    for (const item of SHOP_ITEMS) {
      expect(Number.isInteger(item.price)).toBe(true);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('у каждого товара есть строки в обоих языках', () => {
    for (const value of LOCALES) {
      withLocale(value, () => {
        for (const item of SHOP_ITEMS) {
          const copy = t().shop.items[item.sku];
          expect(copy, `нет строк для ${item.sku} в ${value}`).toBeDefined();
          expect(copy.title.trim().length).toBeGreaterThan(0);
          expect(copy.description.trim().length).toBeGreaterThan(0);
        }
      });
    }
  });
});

describe('цена в интерфейсе', () => {
  it('русский склоняет «голос» по числу', () => {
    withLocale('ru', () => {
      expect(t().shop.price(1)).toBe('1 голос');
      expect(t().shop.price(2)).toBe('2 голоса');
      expect(t().shop.price(20)).toBe('20 голосов');
      expect(t().shop.price(21)).toBe('21 голос');
      expect(t().shop.buyFor(20)).toBe('Купить за 20 голосов');
    });
  });

  it('английский различает единственное и множественное', () => {
    withLocale('en', () => {
      expect(t().shop.price(1)).toBe('1 vote');
      expect(t().shop.price(20)).toBe('20 votes');
      expect(t().shop.buyFor(20)).toBe('Buy for 20 votes');
      expect(t().shop.buyFor(20)).not.toMatch(/[А-Яа-яЁё]/);
    });
  });

  it.each(LOCALES)('%s: подпись кнопки всегда называет цену до покупки', (value) => {
    withLocale(value, () => {
      for (const item of SHOP_ITEMS) {
        expect(t().shop.buyFor(item.price)).toContain(String(item.price));
        // Цена доступна и отдельно от кнопки: после покупки кнопка станет
        // «Куплено», а стоимость по требованию модератора остаётся на экране.
        expect(t().shop.price(item.price)).toContain(String(item.price));
      }
    });
  });
});
