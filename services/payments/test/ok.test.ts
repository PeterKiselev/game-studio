import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import worker, { ITEMS, handleGetItem } from '../src/index';
import type { Env, ShopItem } from '../src/index';
import { handleOkPayment, handleOkRestore } from '../src/ok';
import type { PurchaseStore } from '../src/ok';

/**
 * Одноклассники — подтверждение покупки, цены в ОКах, повторы, восстановление.
 *
 * Подписи считаются здесь независимым кодом (не переиспользуя src/signature.ts):
 * настоящий формат подтверждается только тестовым платежом на живом ОК.
 * Ключи ниже — выдуманные тестовые строки, реальные нигде не используются.
 *
 * ВАЖНО: цены в ОКах (`priceOk`) в боевом каталоге НЕ заданы — владелец их не
 * назвал. Тестовый каталог ниже придумывает числа только для проверки логики;
 * это не предложение цен.
 */
const OK_SECRET = 'test-ok-secret';
const VK_SECRET = 'test-vk-secret';

const CATALOG: Record<string, ShopItem> = {
  alpha: { title: 'Альфа', price: 20, priceOk: 7 },
  beta: { title: 'Бета', price: 20, priceOk: 9 },
  no_price_ok: { title: 'Без цены ОК', price: 20 },
};

function md5Sig(fields: Record<string, string>, secret: string): string {
  const str = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('');
  return createHash('md5').update(str + secret).digest('hex');
}

function okParams(over: Record<string, string> = {}, secret = OK_SECRET): URLSearchParams {
  const fields: Record<string, string> = {
    uid: '512005303399',
    transaction_id: 't-1001',
    transaction_time: '2026-10-07 12:00:00',
    amount: '7',
    product_code: 'alpha',
    method: 'callbacks.payment',
    application_key: 'APPKEY',
    call_id: '1510089670220',
    ...over,
  };
  for (const key of Object.keys(fields)) if (fields[key] === '__drop__') delete fields[key];
  return new URLSearchParams({ ...fields, sig: md5Sig(fields, secret) });
}

class MemoryStore implements PurchaseStore {
  data = new Map<string, string>();
  puts = 0;
  failPuts = false;
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    if (this.failPuts) throw new Error('kv down');
    this.puts += 1;
    this.data.set(key, value);
  }
  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
}

function ctx(store: PurchaseStore | undefined = new MemoryStore(), secret: string | undefined = OK_SECRET) {
  return { secret, store, catalog: CATALOG };
}

async function body(res: Response): Promise<string> {
  return res.text();
}

function errCode(res: Response): string | null {
  return res.headers.get('Invocation-error');
}

describe('handleOkPayment — подтверждение покупки', () => {
  it('верная покупка: ответ true и покупка записана', async () => {
    const store = new MemoryStore();
    const res = await handleOkPayment(okParams(), ctx(store));
    expect(await body(res)).toBe('true');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(errCode(res)).toBeNull();
    expect(await store.keys('ok:p:512005303399:')).toEqual(['ok:p:512005303399:alpha']);
  });

  it('повтор той же транзакции: снова true, второй записи нет', async () => {
    const store = new MemoryStore();
    await handleOkPayment(okParams(), ctx(store));
    const putsAfterFirst = store.puts;
    const second = await handleOkPayment(okParams(), ctx(store));
    expect(await body(second)).toBe('true');
    expect(store.puts).toBe(putsAfterFirst);
    expect(await store.keys('ok:p:')).toHaveLength(1);
  });

  it('тот же transaction_id для другого товара или пользователя — ошибка, ничего не меняется', async () => {
    const store = new MemoryStore();
    await handleOkPayment(okParams(), ctx(store));
    const putsAfterFirst = store.puts;

    const otherSku = await handleOkPayment(okParams({ product_code: 'beta', amount: '9' }), ctx(store));
    expect(errCode(otherSku)).toBe('1001');
    const otherUser = await handleOkPayment(okParams({ uid: '512005303400' }), ctx(store));
    expect(errCode(otherUser)).toBe('1001');
    expect(store.puts).toBe(putsAfterFirst);
  });

  it('два разных товара одного пользователя — две независимые записи', async () => {
    const store = new MemoryStore();
    await handleOkPayment(okParams(), ctx(store));
    await handleOkPayment(okParams({ transaction_id: 't-1002', product_code: 'beta', amount: '9' }), ctx(store));
    expect((await store.keys('ok:p:512005303399:')).sort()).toEqual([
      'ok:p:512005303399:alpha',
      'ok:p:512005303399:beta',
    ]);
  });

  it('неверная подпись: ошибка 104, ничего не записано', async () => {
    const store = new MemoryStore();
    const res = await handleOkPayment(okParams({}, 'чужой-секрет'), ctx(store));
    expect(errCode(res)).toBe('104');
    expect(store.puts).toBe(0);
  });

  it('подмена суммы после подписи: ошибка подписи', async () => {
    const store = new MemoryStore();
    const params = okParams();
    params.set('amount', '1');
    const res = await handleOkPayment(params, ctx(store));
    expect(errCode(res)).toBe('104');
    expect(store.puts).toBe(0);
  });

  it('сумма не по каталогу, даже с верной подписью: 1001 и ничего не выдано', async () => {
    const store = new MemoryStore();
    // Имитация «злоумышленной» покупки за 1 ОК вместо 7 (пример из требований ОК к валидации цены).
    const res = await handleOkPayment(okParams({ amount: '1' }), ctx(store));
    expect(errCode(res)).toBe('1001');
    expect(store.puts).toBe(0);
  });

  it('неизвестный товар: 1001', async () => {
    const res = await handleOkPayment(okParams({ product_code: 'нет-такого' }), ctx());
    expect(errCode(res)).toBe('1001');
  });

  it('товар без цены в ОКах не продаётся: 1001, а не «по голосам»', async () => {
    const store = new MemoryStore();
    const res = await handleOkPayment(okParams({ product_code: 'no_price_ok', amount: '20' }), ctx(store));
    expect(errCode(res)).toBe('1001');
    expect(store.puts).toBe(0);
  });

  it('боевой каталог пока не продаёт ничего в ОК (цены не названы)', async () => {
    // Намеренно: это сторож «не угадывать цену». Когда владелец назовёт цены, этот тест
    // меняется вместе с каталогом — осознанным коммитом.
    for (const sku of Object.keys(ITEMS)) {
      const res = await handleOkPayment(
        okParams({ product_code: sku, amount: '20' }),
        { secret: OK_SECRET, store: new MemoryStore(), catalog: ITEMS },
      );
      expect(errCode(res)).toBe('1001');
    }
  });

  it('подписки (extra_attributes) не поддерживаются', async () => {
    const res = await handleOkPayment(
      okParams({ extra_attributes: '{"action":"reg_subscription"}' }),
      ctx(),
    );
    expect(errCode(res)).toBe('1001');
  });

  it('чужой method отклоняется, отсутствующий — нет', async () => {
    expect(errCode(await handleOkPayment(okParams({ method: 'users.getInfo' }), ctx()))).toBe('1001');
    expect(await body(await handleOkPayment(okParams({ method: '__drop__' }), ctx()))).toBe('true');
  });

  it.each([
    ['uid', 'abc'],
    ['uid', '__drop__'],
    ['transaction_id', '__drop__'],
    ['amount', '7.5'],
    ['amount', '__drop__'],
  ])('неверное или отсутствующее поле %s=%s: 1001', async (field, value) => {
    const res = await handleOkPayment(okParams({ [field]: value }), ctx());
    expect(errCode(res)).toBe('1001');
  });

  it('значения с пробелом и плюсом в transaction_time декодируются до подписи', async () => {
    // В GET пробел приходит как «+» (PHP-кодировка); URLSearchParams декодирует так же.
    const raw = okParams({ transaction_time: '2017-11-08 00:21:10' }).toString();
    expect(raw).toContain('transaction_time=2017-11-08+00%3A21%3A10');
    const res = await handleOkPayment(new URLSearchParams(raw), ctx());
    expect(await body(res)).toBe('true');
  });

  it('нет секрета или хранилища: сервисная ошибка 2, ничего не подтверждено', async () => {
    const noSecret = { secret: undefined, store: new MemoryStore(), catalog: CATALOG };
    const noStore = { secret: OK_SECRET, store: undefined, catalog: CATALOG };
    expect(errCode(await handleOkPayment(okParams(), noSecret))).toBe('2');
    expect(errCode(await handleOkPayment(okParams(), noStore))).toBe('2');
  });

  it('сбой хранилища: ответ — ошибка 2, а не true (ОК повторит или вернёт деньги)', async () => {
    const store = new MemoryStore();
    store.failPuts = true;
    const res = await handleOkPayment(okParams(), ctx(store));
    expect(errCode(res)).toBe('2');
    expect(await body(res)).not.toBe('true');
  });

  it('после сбоя повтор записывает покупку и подтверждает', async () => {
    const store = new MemoryStore();
    store.failPuts = true;
    await handleOkPayment(okParams(), ctx(store));
    store.failPuts = false;
    expect(await body(await handleOkPayment(okParams(), ctx(store)))).toBe('true');
    expect(await store.keys('ok:p:512005303399:')).toHaveLength(1);
  });
});

describe('handleGetItem — цена для ОК', () => {
  it('site=OK возвращает цену в ОКах', async () => {
    const res = handleGetItem(new URLSearchParams({ item: 'alpha', site: 'OK' }), CATALOG);
    expect(await res.json()).toEqual({ response: { item_id: 'alpha', title: 'Альфа', price: 7 } });
  });

  it('site=OK без цены в ОКах — ошибка, голоса вместо ОКов не подставляются', async () => {
    const res = handleGetItem(new URLSearchParams({ item: 'no_price_ok', site: 'OK' }), CATALOG);
    const json = (await res.json()) as { error?: { critical: boolean }; response?: unknown };
    expect(json.response).toBeUndefined();
    expect(json.error?.critical).toBe(true);
  });

  it('site=VK или без site — цена в голосах как раньше (путь ВК не тронут)', async () => {
    for (const site of ['VK', undefined]) {
      const p = new URLSearchParams({ item: 'alpha' });
      if (site) p.set('site', site);
      expect(await handleGetItem(p, CATALOG).json()).toEqual({
        response: { item_id: 'alpha', title: 'Альфа', price: 20 },
      });
    }
  });

  it('боевой каталог: site=OK пока отказывает для всех товаров', async () => {
    for (const sku of Object.keys(ITEMS)) {
      const res = handleGetItem(new URLSearchParams({ item: sku, site: 'OK' }));
      expect(((await res.json()) as { response?: unknown }).response).toBeUndefined();
    }
  });
});

describe('маршрутизация Worker', () => {
  function env(store: MemoryStore | undefined): Env {
    const kv = store
      ? {
          get: (k: string) => store.get(k),
          put: (k: string, v: string) => store.put(k, v),
          list: async ({ prefix }: { prefix: string }) => ({
            keys: (await store.keys(prefix)).map((name) => ({ name })),
            list_complete: true,
          }),
        }
      : undefined;
    return { VK_APP_SECRET: VK_SECRET, OK_APP_SECRET: OK_SECRET, PURCHASES: kv };
  }

  it('GET /ok с верной подписью отвечает true (боевой каталог → без цены ОК: ошибка)', async () => {
    const res = await worker.fetch(new Request(`https://w.test/ok?${okParams({ product_code: 'sudoku_no_ads', amount: '20' })}`), env(new MemoryStore()));
    expect(res.headers.get('Invocation-error')).toBe('1001');
  });

  it('POST /ok и GET в корне — 405, как раньше для не-POST', async () => {
    expect((await worker.fetch(new Request('https://w.test/ok', { method: 'POST' }), env(undefined))).status).toBe(405);
    expect((await worker.fetch(new Request('https://w.test/'), env(undefined))).status).toBe(405);
  });

  it('GET /ok без KV: сервисная ошибка, не true', async () => {
    const res = await worker.fetch(new Request(`https://w.test/ok?${okParams()}`), env(undefined));
    expect(res.headers.get('Invocation-error')).toBe('2');
  });

  it('путь ВКонтакте не тронут: POST get_item с верной подписью отдаёт цену в голосах', async () => {
    const fields = { app_id: '1', item: 'sudoku_no_ads', notification_type: 'get_item_test', order_id: '5', user_id: '1', lang: 'ru_RU', version: '5.132' };
    const sig = md5Sig(fields, VK_SECRET);
    const res = await worker.fetch(
      new Request('https://w.test/', { method: 'POST', body: new URLSearchParams({ ...fields, sig }).toString() }),
      env(undefined),
    );
    expect(await res.json()).toEqual({ response: { item_id: 'sudoku_no_ads', title: 'Без рекламы', price: 20 } });
  });

  it('get_item с site=OK через Worker: ошибка, пока нет цены в ОКах', async () => {
    const fields = { app_id: '1', item: 'sudoku_no_ads', notification_type: 'get_item', order_id: '5', user_id: '1', lang: 'ru_RU', version: '5.132', site: 'OK' };
    const sig = md5Sig(fields, VK_SECRET);
    const res = await worker.fetch(
      new Request('https://w.test/', { method: 'POST', body: new URLSearchParams({ ...fields, sig }).toString() }),
      env(undefined),
    );
    const json = (await res.json()) as { response?: unknown; error?: unknown };
    expect(json.response).toBeUndefined();
    expect(json.error).toBeDefined();
  });
});

describe('handleOkRestore — восстановление покупок', () => {
  function launch(over: Record<string, string> = {}, secret = VK_SECRET): URLSearchParams {
    const fields: Record<string, string> = {
      vk_user_id: '512005303399',
      vk_app_id: '54767366',
      vk_client: 'ok',
      vk_platform: 'desktop_web',
      vk_language: 'ru',
      ...over,
    };
    for (const key of Object.keys(fields)) if (fields[key] === '__drop__') delete fields[key];
    const query = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(fields[k])}`)
      .join('&');
    const sign = createHmac('sha256', secret).update(query).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return new URLSearchParams({ ...fields, sign });
  }

  async function seeded(): Promise<MemoryStore> {
    const store = new MemoryStore();
    await handleOkPayment(okParams(), ctx(store));
    await handleOkPayment(okParams({ transaction_id: 't-1002', product_code: 'beta', amount: '9' }), ctx(store));
    await handleOkPayment(okParams({ uid: '512005303400', transaction_id: 't-2001' }), ctx(store));
    return store;
  }

  it('возвращает покупки пользователя из подписанного запуска и только их', async () => {
    const res = await handleOkRestore(launch(), { secret: VK_SECRET, store: await seeded() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skus: ['alpha', 'beta'] });
  });

  it('пользователь без покупок получает пустой список', async () => {
    const res = await handleOkRestore(launch({ vk_user_id: '777' }), { secret: VK_SECRET, store: await seeded() });
    expect(await res.json()).toEqual({ skus: [] });
  });

  it('подмена vk_user_id после подписи — отказ, чужие покупки не отдаются', async () => {
    const params = launch();
    params.set('vk_user_id', '512005303400');
    const res = await handleOkRestore(params, { secret: VK_SECRET, store: await seeded() });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('alpha');
  });

  it('неверная подпись, нет подписи, чужой ключ — отказ', async () => {
    const store = await seeded();
    expect((await handleOkRestore(launch({}, 'чужой'), { secret: VK_SECRET, store })).status).toBe(403);
    const unsigned = launch();
    unsigned.delete('sign');
    expect((await handleOkRestore(unsigned, { secret: VK_SECRET, store })).status).toBe(403);
  });

  it('запуск не из ОК (vk_client=vk или нет) — отказ: покупки ОК не отдаются во ВК', async () => {
    const store = await seeded();
    expect((await handleOkRestore(launch({ vk_client: 'vk' }), { secret: VK_SECRET, store })).status).toBe(403);
    expect((await handleOkRestore(launch({ vk_client: '__drop__' }), { secret: VK_SECRET, store })).status).toBe(403);
  });

  it('не настроено — 503, не пустой успех', async () => {
    expect((await handleOkRestore(launch(), { secret: undefined, store: new MemoryStore() })).status).toBe(503);
    expect((await handleOkRestore(launch(), { secret: VK_SECRET, store: undefined })).status).toBe(503);
  });

  it('через Worker: GET /ok/restore с CORS-заголовком', async () => {
    const store = await seeded();
    const kv = {
      get: (k: string) => store.get(k),
      put: (k: string, v: string) => store.put(k, v),
      list: async ({ prefix }: { prefix: string }) => ({ keys: (await store.keys(prefix)).map((name) => ({ name })), list_complete: true }),
    };
    const res = await worker.fetch(new Request(`https://w.test/ok/restore?${launch()}`), {
      VK_APP_SECRET: VK_SECRET,
      OK_APP_SECRET: OK_SECRET,
      PURCHASES: kv,
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ skus: ['alpha', 'beta'] });
  });
});
