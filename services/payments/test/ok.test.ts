import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import worker, { ITEMS, handleGetItem } from '../src/index';
import type { Env, ShopItem } from '../src/index';
import { LedgerDO, doLedger } from '../src/ledger';
import type { Mode, NamespaceLike, StorageLike, TxnLike } from '../src/ledger';
import { handleOkPayment, handleRestore, handleVkOrder } from '../src/ok';
import type { OkCtx, RestoreCtx } from '../src/ok';

/**
 * Подтверждение и восстановление покупок (ОК и ВК) через журнал на Durable Object.
 *
 * Подписи считаются здесь независимым кодом. Ключи — выдуманные тестовые строки.
 * Цены в ОКах в тестовом каталоге придуманы для проверки логики — это не
 * предложение цен; в боевом каталоге `priceOk` не задан.
 */
const OK_SECRET = 'test-ok-secret';
const VK_SECRET = 'test-vk-secret';
const OK_KEY = 'CBAKMLELABABABABE';
const DT_ID = '54767366';

function catalog(priceAlpha = 7): Record<string, ShopItem> {
  return {
    alpha: { app: 'dachnye-tainy', title: 'Альфа', price: 20, priceOk: priceAlpha },
    beta: { app: 'dachnye-tainy', title: 'Бета', price: 20, priceOk: 9 },
    no_price_ok: { app: 'dachnye-tainy', title: 'Без цены ОК', price: 20 },
    sudoku_x: { app: 'sudoku', title: 'Чужой', price: 20, priceOk: 7 },
  };
}

// --- поддельный Durable Object с настоящей семантикой транзакции -------------

/** Хранилище, которое откатывает транзакцию целиком при исключении (как DurableObjectStorage). */
class FakeStorage implements StorageLike {
  data = new Map<string, unknown>();
  constructor(private readonly control: { failOnPut: number }) {}
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async list<T>({ prefix }: { prefix: string }): Promise<Map<string, T>> {
    return new Map([...this.data].filter(([k]) => k.startsWith(prefix))) as Map<string, T>;
  }
  async transaction<T>(closure: (txn: TxnLike) => Promise<T>): Promise<T> {
    const draft = new Map(this.data);
    let n = 0;
    const txn: TxnLike = {
      get: async <V>(key: string) => draft.get(key) as V | undefined,
      put: async (key, value) => {
        n += 1;
        if (this.control.failOnPut === n) throw new Error('сбой хранилища');
        draft.set(key, structuredClone(value));
      },
    };
    const result = await closure(txn); // исключение → draft выбрасывается
    this.data = draft;
    return result;
  }
}

class FakeNamespace implements NamespaceLike {
  control = { failOnPut: 0 };
  storages = new Map<string, FakeStorage>();
  idFromName(name: string): unknown {
    return name;
  }
  get(id: unknown) {
    const name = String(id);
    if (!this.storages.has(name)) this.storages.set(name, new FakeStorage(this.control));
    const object = new LedgerDO({ storage: this.storages.get(name)! });
    return { fetch: (request: Request) => object.fetch(request) };
  }
  /** Все записи всех объектов — чтобы проверять «ничего не записано». */
  allKeys(): string[] {
    return [...this.storages].flatMap(([name, s]) => [...s.data.keys()].map((k) => `${name}/${k}`)).sort();
  }
}

// --- конструкторы запросов --------------------------------------------------

function md5Sig(fields: Record<string, string>, secret: string): string {
  const str = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('');
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
    application_key: OK_KEY,
    call_id: '1510089670220',
    ...over,
  };
  for (const key of Object.keys(fields)) if (fields[key] === '__drop__') delete fields[key];
  return new URLSearchParams({ ...fields, sig: md5Sig(fields, secret) });
}

function vkOrder(over: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    app_id: DT_ID,
    notification_type: 'order_status_change_test',
    status: 'chargeable',
    order_id: '2363385',
    user_id: '574470572',
    item: 'alpha',
    item_price: '20',
    date: '1790607282',
    ...over,
  });
}

function launch(over: Record<string, string> = {}, secret = VK_SECRET): URLSearchParams {
  const fields: Record<string, string> = {
    vk_user_id: '512005303399',
    vk_app_id: DT_ID,
    vk_client: 'ok',
    vk_platform: 'desktop_web',
    vk_language: 'ru',
    ...over,
  };
  for (const key of Object.keys(fields)) if (fields[key] === '__drop__') delete fields[key];
  const query = Object.keys(fields).sort().map((k) => `${k}=${encodeURIComponent(fields[k])}`).join('&');
  const sign = createHmac('sha256', secret).update(query).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return new URLSearchParams({ ...fields, sign });
}

function okCtx(ns: FakeNamespace, over: Partial<OkCtx> = {}): OkCtx {
  return { app: 'dachnye-tainy', appId: DT_ID, secret: OK_SECRET, appKey: OK_KEY, mode: 'test', ledger: doLedger(ns), catalog: catalog(), ...over };
}

function restoreCtx(ns: FakeNamespace, over: Partial<RestoreCtx> = {}): RestoreCtx {
  return { app: 'dachnye-tainy', appId: DT_ID, platform: 'ok', secret: VK_SECRET, mode: 'test', ledger: doLedger(ns), catalog: catalog(), ...over };
}

const errCode = (res: Response): string | null => res.headers.get('Invocation-error');
const restored = async (res: Response): Promise<string[]> => ((await res.json()) as { skus: string[] }).skus;

// --- ОК: подтверждение -------------------------------------------------------

describe('ОК: подтверждение покупки', () => {
  it('верная покупка: true, покупка восстанавливается', async () => {
    const ns = new FakeNamespace();
    const res = await handleOkPayment(okParams(), okCtx(ns));
    expect(await res.text()).toBe('true');
    expect(errCode(res)).toBeNull();
    expect(await restored(await handleRestore(launch(), restoreCtx(ns)))).toEqual(['alpha']);
  });

  it('повтор той же транзакции: снова true, журнал не меняется', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams(), okCtx(ns));
    const before = ns.allKeys();
    expect(await (await handleOkPayment(okParams(), okCtx(ns))).text()).toBe('true');
    expect(ns.allKeys()).toEqual(before);
  });

  it('тот же transaction_id с другим товаром или суммой — 1001, журнал не меняется', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams(), okCtx(ns));
    const before = ns.allKeys();
    expect(errCode(await handleOkPayment(okParams({ product_code: 'beta', amount: '9' }), okCtx(ns)))).toBe('1001');
    expect(ns.allKeys()).toEqual(before);
  });

  it('неверная подпись или подмена суммы после подписи — 104, ничего не записано', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams({}, 'чужой'), okCtx(ns)))).toBe('104');
    const tampered = okParams();
    tampered.set('amount', '1');
    expect(errCode(await handleOkPayment(tampered, okCtx(ns)))).toBe('104');
    expect(ns.allKeys()).toEqual([]);
  });

  it('сумма не по каталогу при верной подписи — 1001, ничего не записано', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams({ amount: '1' }), okCtx(ns)))).toBe('1001');
    expect(ns.allKeys()).toEqual([]);
  });

  it('товар без цены в ОКах и неизвестный товар — 1001', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams({ product_code: 'no_price_ok', amount: '20' }), okCtx(ns)))).toBe('1001');
    expect(errCode(await handleOkPayment(okParams({ product_code: 'нет' }), okCtx(ns)))).toBe('1001');
    expect(ns.allKeys()).toEqual([]);
  });

  it('боевой каталог: товары «Дачных тайн» продаются в ОК ровно за 20 ОК (цена владельца)', async () => {
    for (const sku of Object.keys(ITEMS).filter((x) => ITEMS[x].app === 'dachnye-tainy')) {
      expect(ITEMS[sku].priceOk, sku).toBe(20);
      const ok = await handleOkPayment(okParams({ product_code: sku, amount: '20', transaction_id: `price-${sku}` }), okCtx(new FakeNamespace(), { catalog: ITEMS }));
      expect(await ok.text(), sku).toBe('true');
      for (const amount of ['19', '21', '1']) {
        const res = await handleOkPayment(okParams({ product_code: sku, amount, transaction_id: `bad-${sku}-${amount}` }), okCtx(new FakeNamespace(), { catalog: ITEMS }));
        expect(errCode(res), `${sku} за ${amount}`).toBe('1001');
      }
    }
  });

  it('подписки, чужой method и битые поля — 1001; отсутствующий method допустим', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams({ extra_attributes: '{"action":"reg_subscription"}' }), okCtx(ns)))).toBe('1001');
    expect(errCode(await handleOkPayment(okParams({ method: 'users.getInfo' }), okCtx(ns)))).toBe('1001');
    for (const [f, v] of [['uid', 'abc'], ['transaction_id', '__drop__'], ['amount', '7.5']]) {
      expect(errCode(await handleOkPayment(okParams({ [f]: v }), okCtx(ns)))).toBe('1001');
    }
    expect(await (await handleOkPayment(okParams({ method: '__drop__' }), okCtx(ns))).text()).toBe('true');
  });

  it.each(['secret', 'appKey', 'mode', 'ledger', 'app'] as const)('без настройки %s — ошибка 2, а не true', async (field) => {
    const res = await handleOkPayment(okParams(), okCtx(new FakeNamespace(), { [field]: undefined }));
    expect(errCode(res)).toBe('2');
  });
});

// --- сбой между записями -----------------------------------------------------

describe('Сбой между записями транзакции', () => {
  it('ОК: сбой на второй записи — ответ 2, в журнале ничего (ни tx, ни покупки)', async () => {
    const ns = new FakeNamespace();
    ns.control.failOnPut = 2; // tx: записан в черновик, p: падает
    const res = await handleOkPayment(okParams(), okCtx(ns));
    expect(errCode(res)).toBe('2');
    expect(await res.text()).not.toBe('true');
    expect(ns.allKeys()).toEqual([]);
    expect(await restored(await handleRestore(launch(), restoreCtx(ns)))).toEqual([]);
  });

  it('ОК: повтор после сбоя записывает обе записи и подтверждает', async () => {
    const ns = new FakeNamespace();
    ns.control.failOnPut = 2;
    await handleOkPayment(okParams(), okCtx(ns));
    ns.control.failOnPut = 0;
    expect(await (await handleOkPayment(okParams(), okCtx(ns))).text()).toBe('true');
    expect(ns.allKeys().map((k) => k.split('/')[1])).toEqual(['p:alpha', 'tx:t-1001']);
  });

  it('ВК: сбой на второй записи — ошибка, не подтверждение; журнал пуст', async () => {
    const ns = new FakeNamespace();
    ns.control.failOnPut = 2;
    const body = (await (await handleVkOrder(vkOrder(), { app: 'dachnye-tainy', ledger: doLedger(ns), catalog: catalog() })).json()) as Record<string, unknown>;
    expect(body.response).toBeUndefined();
    expect(body.error).toBeDefined();
    expect(ns.allKeys()).toEqual([]);
  });
});

// --- test / live ------------------------------------------------------------

describe('Разделение тестового и рабочего режимов', () => {
  it('ОК: рабочий режим заблокирован — и подтверждение (2), и восстановление (503)', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams(), okCtx(ns, { mode: 'live' })))).toBe('2');
    expect(ns.allKeys()).toEqual([]);
    await handleOkPayment(okParams(), okCtx(ns, { mode: 'test' }));
    expect((await handleRestore(launch(), restoreCtx(ns, { mode: 'live' }))).status).toBe(503);
    expect(await restored(await handleRestore(launch(), restoreCtx(ns, { mode: 'test' })))).toEqual(['alpha']);
  });

  it('ВК: order_status_change_test попадает только в тестовый журнал', async () => {
    const ns = new FakeNamespace();
    const ctx = { app: 'dachnye-tainy', ledger: doLedger(ns), catalog: catalog() };
    await handleVkOrder(vkOrder(), ctx);
    const vkLaunch = launch({ vk_user_id: '574470572', vk_client: '__drop__' });
    expect(await restored(await handleRestore(vkLaunch, restoreCtx(ns, { platform: 'vk', mode: 'live' })))).toEqual([]);
    expect(await restored(await handleRestore(vkLaunch, restoreCtx(ns, { platform: 'vk', mode: 'test' })))).toEqual(['alpha']);
  });

  it('один и тот же номер транзакции в test и live — независимые записи, не конфликт', async () => {
    const ns = new FakeNamespace();
    const ctx = { app: 'dachnye-tainy', ledger: doLedger(ns), catalog: catalog() };
    await handleVkOrder(vkOrder({ item: 'alpha' }), ctx);
    const live = (await (await handleVkOrder(vkOrder({ notification_type: 'order_status_change', item: 'beta' }), ctx)).json()) as Record<string, unknown>;
    expect(live.response).toBeDefined();
  });
});

// --- повтор после изменения цены ---------------------------------------------

describe('Повтор после изменения цены', () => {
  it('ОК: повтор принятой транзакции подтверждается и после смены цены', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams({ amount: '7' }), okCtx(ns, { catalog: catalog(7) }));
    const replay = await handleOkPayment(okParams({ amount: '7' }), okCtx(ns, { catalog: catalog(8) }));
    expect(await replay.text()).toBe('true');
  });

  it('ОК: новая транзакция по старой цене после смены — 1001', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams({ amount: '7' }), okCtx(ns, { catalog: catalog(7) }));
    const fresh = await handleOkPayment(okParams({ transaction_id: 't-2002', amount: '7' }), okCtx(ns, { catalog: catalog(8) }));
    expect(errCode(fresh)).toBe('1001');
  });

  it('ВК: повтор заказа подтверждается после смены цены, новый по старой цене — ошибка', async () => {
    const ns = new FakeNamespace();
    const old = { app: 'dachnye-tainy', ledger: doLedger(ns), catalog: catalog() };
    await handleVkOrder(vkOrder(), old);
    const changed = { ...old, catalog: { ...catalog(), alpha: { ...catalog().alpha, price: 25 } } };
    expect(((await (await handleVkOrder(vkOrder(), changed)).json()) as Record<string, unknown>).response).toBeDefined();
    expect(((await (await handleVkOrder(vkOrder({ order_id: '999' }), changed)).json()) as Record<string, unknown>).error).toBeDefined();
  });
});

// --- ВК: оплаченная сумма только из уведомления -------------------------------

describe('ВК: item_price', () => {
  const vkCtx = (ns: FakeNamespace, c = catalog()) => ({ app: 'dachnye-tainy', appId: DT_ID, ledger: doLedger(ns), catalog: c });
  const body = async (res: Response) => (await res.json()) as { response?: unknown; error?: { error_code: number } };

  it.each([['отсутствует', '__drop__'], ['пустой', ''], ['не число', 'abc'], ['дробный', '20.5']])(
    'новый заказ, item_price %s — ошибка, хотя цена каталога совпала бы; ничего не записано',
    async (_label, value) => {
      const ns = new FakeNamespace();
      const fields = Object.fromEntries(vkOrder());
      if (value === '__drop__') delete fields.item_price;
      else fields.item_price = value;
      expect((await body(await handleVkOrder(new URLSearchParams(fields), vkCtx(ns)))).error).toBeDefined();
      expect(ns.allKeys()).toEqual([]);
    },
  );

  it('повтор после изменения каталога без item_price — тот же успех по записи, журнал не меняется', async () => {
    const ns = new FakeNamespace();
    await handleVkOrder(vkOrder(), vkCtx(ns));
    const before = ns.allKeys();
    const changed = { ...catalog(), alpha: { ...catalog().alpha, price: 25 } };
    const fields = Object.fromEntries(vkOrder());
    delete fields.item_price;
    const res = await body(await handleVkOrder(new URLSearchParams(fields), vkCtx(ns, changed)));
    expect(res.response).toEqual({ order_id: 2363385, app_order_id: 2363385 });
    expect(ns.allKeys()).toEqual(before);
  });

  it('повтор с другим item_price — конфликт; с другим товаром — конфликт', async () => {
    const ns = new FakeNamespace();
    await handleVkOrder(vkOrder(), vkCtx(ns));
    expect((await body(await handleVkOrder(vkOrder({ item_price: '25' }), vkCtx(ns)))).error).toBeDefined();
    expect((await body(await handleVkOrder(vkOrder({ item: 'beta' }), vkCtx(ns)))).error).toBeDefined();
  });

  it('item_discount, отличный от 0, — ошибка (скидок мы не даём); 0 — допустим', async () => {
    const ns = new FakeNamespace();
    expect((await body(await handleVkOrder(vkOrder({ item_discount: '3' }), vkCtx(ns)))).error).toBeDefined();
    expect((await body(await handleVkOrder(vkOrder({ item_discount: '0' }), vkCtx(ns)))).response).toBeDefined();
  });

  it('уведомление с чужим app_id — ошибка', async () => {
    const ns = new FakeNamespace();
    expect((await body(await handleVkOrder(vkOrder({ app_id: '54788542' }), vkCtx(ns)))).error).toBeDefined();
    expect(ns.allKeys()).toEqual([]);
  });
});

// --- изоляция приложений ------------------------------------------------------

describe('Изоляция приложений', () => {
  it('ОК: SKU другого приложения не продаётся', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams({ product_code: 'sudoku_x' }), okCtx(ns)))).toBe('1001');
    expect(ns.allKeys()).toEqual([]);
  });

  it('ОК: уведомление с чужим application_key отклоняется', async () => {
    const ns = new FakeNamespace();
    expect(errCode(await handleOkPayment(okParams({ application_key: 'OTHERAPP' }), okCtx(ns)))).toBe('1001');
    expect(ns.allKeys()).toEqual([]);
  });

  it('ВК: SKU другого приложения — ошибка 20', async () => {
    const ns = new FakeNamespace();
    const body = (await (await handleVkOrder(vkOrder({ item: 'sudoku_x' }), { app: 'dachnye-tainy', ledger: doLedger(ns), catalog: catalog() })).json()) as { error?: { error_code: number } };
    expect(body.error?.error_code).toBe(20);
  });

  it('общий журнал: покупка одного приложения не видна восстановлению другого', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams({ product_code: 'sudoku_x' }), okCtx(ns, { app: 'sudoku' }));
    const dt = await restored(await handleRestore(launch(), restoreCtx(ns)));
    expect(dt).toEqual([]);
    const su = await restored(await handleRestore(launch({ vk_app_id: '54788542' }), restoreCtx(ns, { app: 'sudoku', appId: '54788542' })));
    expect(su).toEqual(['sudoku_x']);
  });

  it('восстановление с vk_app_id другого приложения — 403', async () => {
    const res = await handleRestore(launch({ vk_app_id: '54788542' }), restoreCtx(new FakeNamespace()));
    expect(res.status).toBe(403);
  });
});

// --- восстановление -----------------------------------------------------------

describe('Восстановление', () => {
  it('ОК: подписанный vk_ok_user_id выбирает журнал независимо от vk_user_id', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams(), okCtx(ns));
    const p = launch({ vk_user_id: '123', vk_ok_user_id: '512005303399' });
    expect(await restored(await handleRestore(p, restoreCtx(ns)))).toEqual(['alpha']);
    p.set('vk_ok_user_id', '456');
    expect((await handleRestore(p, restoreCtx(ns))).status).toBe(403);
  });

  it('неверный подписанный ID ОК не заменяется ID VK', async () => {
    const ns = new FakeNamespace();
    expect((await handleRestore(launch({ vk_ok_user_id: '' }), restoreCtx(ns))).status).toBe(403);
    expect((await handleRestore(launch({ vk_ok_user_id: 'invalid' }), restoreCtx(ns))).status).toBe(403);
  });

  it('маршрут VK продолжает использовать vk_user_id, а не поле ОК', async () => {
    const ns = new FakeNamespace();
    await handleVkOrder(vkOrder(), { app: 'dachnye-tainy', appId: DT_ID,
      ledger: doLedger(ns), catalog: catalog() });
    expect(await restored(await handleRestore(launch({ vk_client: 'vk', vk_user_id: '574470572',
      vk_ok_user_id: '123' }), restoreCtx(ns, { platform: 'vk' })))).toEqual(['alpha']);
  });

  it('подмена vk_user_id после подписи — 403', async () => {
    const ns = new FakeNamespace();
    await handleOkPayment(okParams(), okCtx(ns));
    const p = launch({ vk_user_id: '1' });
    p.set('vk_user_id', '512005303399');
    expect((await handleRestore(p, restoreCtx(ns))).status).toBe(403);
  });

  it('площадка запуска должна совпадать с маршрутом', async () => {
    const ns = new FakeNamespace();
    expect((await handleRestore(launch({ vk_client: 'vk' }), restoreCtx(ns, { platform: 'ok' }))).status).toBe(403);
    expect((await handleRestore(launch(), restoreCtx(ns, { platform: 'vk' }))).status).toBe(403);
  });

  it.each(['secret', 'ledger', 'mode', 'app', 'appId'] as const)('без настройки %s — 503', async (field) => {
    expect((await handleRestore(launch(), restoreCtx(new FakeNamespace(), { [field]: undefined }))).status).toBe(503);
  });
});

// --- цена для ОК в get_item ---------------------------------------------------

describe('get_item для ОК', () => {
  it('site=OK — цена в ОКах; без неё — ошибка; site=VK — голоса', async () => {
    const c = catalog();
    expect(await handleGetItem(new URLSearchParams({ item: 'alpha', site: 'OK' }), c).json()).toEqual({ response: { item_id: 'alpha', title: 'Альфа', price: 7 } });
    expect(((await handleGetItem(new URLSearchParams({ item: 'no_price_ok', site: 'OK' }), c).json()) as { response?: unknown }).response).toBeUndefined();
    expect(await handleGetItem(new URLSearchParams({ item: 'alpha', site: 'VK' }), c).json()).toEqual({ response: { item_id: 'alpha', title: 'Альфа', price: 20 } });
  });
});

// --- маршрутизация Worker -----------------------------------------------------

describe('Worker', () => {
  function env(ns?: FakeNamespace, mode: Mode = 'test'): Env {
    return { VK_APP_SECRET: VK_SECRET, OK_APP_SECRET: OK_SECRET, OK_APP_KEY: OK_KEY, APP_SLUG: 'dachnye-tainy', VK_APP_ID: DT_ID, PAYMENTS_MODE: mode, LEDGER: ns };
  }
  const post = (fields: Record<string, string>) =>
    new Request('https://w.test/', { method: 'POST', body: new URLSearchParams({ ...fields, sig: md5Sig(fields, VK_SECRET) }).toString() });

  it('ВК-заказ с журналом записывается, /vk/restore его отдаёт', async () => {
    const ns = new FakeNamespace();
    const fields = Object.fromEntries(vkOrder({ item: 'dachnye_tainy_no_ads' }));
    const res = await worker.fetch(post(fields), env(ns));
    expect(await res.json()).toEqual({ response: { order_id: 2363385, app_order_id: 2363385 } });
    const r = await worker.fetch(new Request(`https://w.test/vk/restore?${launch({ vk_user_id: '574470572', vk_client: '__drop__' })}`), env(ns));
    expect(await r.json()).toEqual({ skus: ['dachnye_tainy_no_ads'] });
  });

  it('без журнала ВК-заказ подтверждается по-старому (рабочий путь не сломан)', async () => {
    const fields = Object.fromEntries(vkOrder({ item: 'dachnye_tainy_no_ads' }));
    const res = await worker.fetch(post(fields), env(undefined));
    expect(await res.json()).toEqual({ response: { order_id: 2363385, app_order_id: 2363385 } });
  });

  it('GET /ok без журнала — ошибка 2; POST /ok и GET / — 405', async () => {
    expect((await worker.fetch(new Request(`https://w.test/ok?${okParams()}`), env(undefined))).headers.get('Invocation-error')).toBe('2');
    expect((await worker.fetch(new Request('https://w.test/ok', { method: 'POST' }), env())).status).toBe(405);
    expect((await worker.fetch(new Request('https://w.test/'), env())).status).toBe(405);
  });

  it('get_item ВК в боевом каталоге не изменился', async () => {
    const fields = { app_id: DT_ID, item: 'dachnye_tainy_no_ads', notification_type: 'get_item_test', order_id: '2366069', user_id: '574470572', lang: 'ru_RU', receiver_id: '574470572' };
    expect(await (await worker.fetch(post(fields), env())).json()).toEqual({ response: { item_id: 'dachnye_tainy_no_ads', title: 'Без рекламы', price: 20 } });
  });
});
