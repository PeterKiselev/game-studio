import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleGetItem, handleOrderStatusChange, verifySignature } from '../src/index';

/**
 * У документации VK нет проверяемого известного результата подписи
 * (пример уведомления в начале раздела использует секрет, который нигде
 * не назван) — поэтому подпись тестируем на самосогласованность:
 * считаем ожидаемый md5 здесь, независимым кодом, а не переиспользуя
 * сортировку/склейку из src/index.ts, и сравниваем. Настоящая проверка
 * «а действительно ли формат совпадает с тем, что шлёт VK» — только
 * живым тестовым платежом через «Тестировщики платежей» после деплоя,
 * это не заменяет данный тест, а дополняет его.
 */
function referenceSignature(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params).sort();
  const str = sorted.map((k) => `${k}=${params[k]}`).join('');
  return createHash('md5').update(str + secret).digest('hex');
}

function makeParams(fields: Record<string, string>, secret: string): URLSearchParams {
  const sig = referenceSignature(fields, secret);
  return new URLSearchParams({ ...fields, sig });
}

/** Тело ответа нам не типизирует workers-types (Response.json() -> unknown) — читаем как any, форму проверяем через toEqual. */
async function readJson(res: Response): Promise<any> {
  return res.json();
}

describe('verifySignature', () => {
  const secret = 'test-secret-key';
  const fields = {
    app_id: '1524456',
    notification_type: 'get_item_test',
    item: 'dachnye_tainy_no_ads',
    order_id: '2044594',
    user_id: '1',
    receiver_id: '1',
    lang: 'ru_RU',
    version: '5.132',
  };

  it('принимает правильную подпись, посчитанную независимо', () => {
    expect(verifySignature(makeParams(fields, secret), secret)).toBe(true);
  });

  it('отвергает, если секрет не совпадает', () => {
    expect(verifySignature(makeParams(fields, secret), 'другой-секрет')).toBe(false);
  });

  it('отвергает, если подменили значение параметра после подписи', () => {
    const params = makeParams(fields, secret);
    params.set('order_id', '9999999');
    expect(verifySignature(params, secret)).toBe(false);
  });

  it('отвергает, если подписи вообще нет', () => {
    const params = new URLSearchParams(fields);
    expect(verifySignature(params, secret)).toBe(false);
  });

  it('не зависит от порядка параметров в запросе — сортировка своя', () => {
    const inOrder = makeParams(fields, secret);
    const shuffled = new URLSearchParams();
    // Тот же набор пар, но добавлены в другом порядке — подпись всё равно верна,
    // потому что verifySignature сортирует сама, а не полагается на порядок в теле.
    for (const key of ['sig', 'version', 'app_id', 'lang', 'notification_type', 'item', 'order_id', 'user_id', 'receiver_id']) {
      shuffled.append(key, inOrder.get(key)!);
    }
    expect(verifySignature(shuffled, secret)).toBe(true);
  });
});

describe('handleGetItem', () => {
  it('возвращает известный товар с ценой', async () => {
    const res = handleGetItem(new URLSearchParams({ item: 'dachnye_tainy_no_ads' }));
    const body = await readJson(res);
    expect(body).toEqual({ response: { item_id: 'dachnye_tainy_no_ads', title: 'Без рекламы', price: 20 } });
  });

  it('оба SKU из магазина в main.ts существуют в каталоге сервера', async () => {
    const res = handleGetItem(new URLSearchParams({ item: 'dachnye_tainy_unlimited_hints' }));
    const body = await readJson(res);
    expect(body.response.item_id).toBe('dachnye_tainy_unlimited_hints');
  });

  it.each([
    ['sudoku_no_ads', 'Без рекламы'],
    ['sudoku_unlimited_hints', 'Безлимитные подсказки'],
  ])('SKU Sudoku %s существует в каталоге сервера', async (sku, title) => {
    const body = await readJson(handleGetItem(new URLSearchParams({ item: sku })));
    expect(body).toEqual({ response: { item_id: sku, title, price: 20 } });
  });

  it('код ошибки 20 для неизвестного товара — как требует документация VK', async () => {
    const res = handleGetItem(new URLSearchParams({ item: 'несуществующий' }));
    const body = await readJson(res);
    expect(body).toEqual({ error: { error_code: 20, error_msg: 'Товара не существует.', critical: true } });
  });
});

describe('handleOrderStatusChange', () => {
  it('подтверждает заказ при status=chargeable', async () => {
    const res = handleOrderStatusChange(new URLSearchParams({ status: 'chargeable', order_id: '2044594' }));
    const body = await readJson(res);
    expect(body).toEqual({ response: { order_id: 2044594, app_order_id: 2044594 } });
  });

  it('повторное уведомление с тем же order_id подтверждается тем же ответом', async () => {
    const params = new URLSearchParams({ status: 'chargeable', order_id: '2044594' });
    const first = await readJson(handleOrderStatusChange(params));
    const second = await readJson(handleOrderStatusChange(params));
    expect(first).toEqual(second);
  });

  it('код ошибки для статуса, который мы не продаём (например refund)', async () => {
    const res = handleOrderStatusChange(new URLSearchParams({ status: 'refund', order_id: '1' }));
    const body = await readJson(res);
    expect(body.error.critical).toBe(true);
  });

  it('код ошибки для отсутствующего или нечислового order_id', async () => {
    const res = handleOrderStatusChange(new URLSearchParams({ status: 'chargeable', order_id: 'abc' }));
    const body = await readJson(res);
    expect(body.error).toBeDefined();
  });
});
