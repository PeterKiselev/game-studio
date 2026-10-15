import { describe, expect, it } from 'vitest';
import { SKU_FLAGS, describeJournal, fetchConfirmedSkus, fetchRestore, mergePurchases, restoreUrl } from '../src/restore';
import type { FetchLike, Purchases } from '../src/restore';
import { SHOP_ITEMS } from '../src/shop';

const BASE = 'https://pay.example';
const VK_LAUNCH = '?vk_user_id=574470572&vk_app_id=54767366&vk_platform=desktop_web&sign=abc&lang=ru';
const OK_LAUNCH = '?vk_user_id=512005303399&vk_app_id=54767366&vk_client=ok&sign=abc';

it('separate OK server never receives a VK restore request', () => {
  const okBase = 'https://ok-pay.example';
  expect(restoreUrl('', VK_LAUNCH, okBase)).toBeNull();
  expect(restoreUrl(BASE, VK_LAUNCH, okBase)).toMatch(/^https:\/\/pay\.example\/vk\/restore\?/);
  const url = restoreUrl('', OK_LAUNCH + '&vk_ok_user_id=99', okBase)!;
  expect(url).toMatch(/^https:\/\/ok-pay\.example\/ok\/restore\?/);
  expect(new URL(url).searchParams.get('vk_ok_user_id')).toBe('99');
});

function reply(status: number, body: unknown): FetchLike {
  return async () => ({ ok: status >= 200 && status < 300, json: async () => body });
}

describe('restoreUrl', () => {
  it('ВК → /vk/restore, ОК → /ok/restore', () => {
    expect(restoreUrl(BASE, VK_LAUNCH)).toMatch(/^https:\/\/pay\.example\/vk\/restore\?/);
    expect(restoreUrl(BASE, OK_LAUNCH)).toMatch(/^https:\/\/pay\.example\/ok\/restore\?/);
  });

  it('передаёт только vk_* и sign, без лишних параметров', () => {
    const url = new URL(restoreUrl(BASE, VK_LAUNCH)!);
    expect([...url.searchParams.keys()].sort()).toEqual(['sign', 'vk_app_id', 'vk_platform', 'vk_user_id']);
  });

  it('без адреса сервера, без sign или без пользователя — запроса нет', () => {
    expect(restoreUrl('', VK_LAUNCH)).toBeNull();
    expect(restoreUrl(BASE, '?vk_user_id=1&vk_app_id=54767366')).toBeNull();
    expect(restoreUrl(BASE, '?vk_app_id=54767366&sign=x')).toBeNull();
    expect(restoreUrl(BASE, '?lang=ru')).toBeNull();
  });

  it('лишний слэш в адресе сервера не ломает путь', () => {
    expect(restoreUrl(`${BASE}/`, VK_LAUNCH)).toMatch(/^https:\/\/pay\.example\/vk\/restore\?/);
  });
});

describe('fetchConfirmedSkus', () => {
  it('возвращает известные SKU этой игры, чужие отбрасывает', async () => {
    const skus = await fetchConfirmedSkus('u', reply(200, { skus: ['dachnye_tainy_no_ads', 'sudoku_no_ads', 'x'] }));
    expect(skus).toEqual(['dachnye_tainy_no_ads']);
  });

  it.each([
    ['503', reply(503, { error: 'not_configured' })],
    ['403', reply(403, { error: 'bad_sign' })],
    ['не тот формат', reply(200, { skus: 'dachnye_tainy_no_ads' })],
    ['не строки', reply(200, { skus: [1, 2] })],
    ['пустое тело', reply(200, null)],
    ['кривой JSON', (async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })) as FetchLike],
    ['сеть недоступна', (async () => { throw new TypeError('Failed to fetch'); }) as FetchLike],
  ])('%s → null', async (_label, fetchFn) => {
    expect(await fetchConfirmedSkus('u', fetchFn)).toBeNull();
  });

  it('зависший сервер — null по таймауту, а не вечное ожидание', async () => {
    const hang: FetchLike = (_u, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const started = Date.now();
    expect(await fetchConfirmedSkus('u', hang, 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('пустой список — это [], а не ошибка', async () => {
    expect(await fetchConfirmedSkus('u', reply(200, { skus: [] }))).toEqual([]);
  });
});

describe('mergePurchases', () => {
  it('добавляет недостающие права и сообщает, какие', () => {
    const p: Purchases = {};
    expect(mergePurchases(p, ['dachnye_tainy_unlimited_hints'])).toEqual(['dachnye_tainy_unlimited_hints']);
    expect(p).toEqual({ unlimitedHints: true });
  });

  it('пустой ответ не снимает старую покупку ВК, которой нет в журнале', () => {
    const p: Purchases = { noAds: true };
    expect(mergePurchases(p, [])).toEqual([]);
    expect(p).toEqual({ noAds: true });
  });

  it('повторное восстановление ничего не меняет', () => {
    const p: Purchases = {};
    mergePurchases(p, ['dachnye_tainy_no_ads']);
    expect(mergePurchases(p, ['dachnye_tainy_no_ads'])).toEqual([]);
    expect(p).toEqual({ noAds: true });
  });
});

it('каждый товар магазина восстанавливаем, и лишних SKU нет', () => {
  expect(Object.keys(SKU_FLAGS).sort()).toEqual(SHOP_ITEMS.map((i) => i.sku).sort());
});

describe('диагностика восстановления: ответ журнала для тестовой полосы', () => {
  const reply = (status: number, body: unknown) => async () => ({ ok: status === 200, status, json: async () => body });
  const url = 'https://payments-oktest.example/ok/restore?vk_user_id=574470572&sign=SECRET';

  it('два товара, пусто, чужие SKU — ответ журнала как есть', async () => {
    expect(describeJournal(await fetchRestore(url, reply(200, { skus: ['dachnye_tainy_no_ads', 'dachnye_tainy_unlimited_hints'] })))).toBe(
      'журнал: без рекламы, подсказки',
    );
    expect(describeJournal(await fetchRestore(url, reply(200, { skus: [] })))).toBe('журнал: пусто');
    expect(describeJournal(await fetchRestore(url, reply(200, { skus: ['sudoku_no_ads'] })))).toBe('журнал: пусто (+1 чужих)');
  });

  it('ошибки различаются: код ответа, сеть, таймаут, неверный ответ, не запрашивался', async () => {
    expect(describeJournal(await fetchRestore(url, reply(403, { error: 'bad_sign' })))).toBe('журнал: ошибка 403');
    expect(describeJournal(await fetchRestore(url, reply(503, { error: 'not_configured' })))).toBe('журнал: ошибка 503');
    expect(describeJournal(await fetchRestore(url, async () => { throw new Error('offline'); }))).toBe('журнал: ошибка сети');
    const hang = (_u: string, init?: { signal?: AbortSignal }) =>
      new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(describeJournal(await fetchRestore(url, hang, 20))).toBe('журнал: нет ответа');
    expect(describeJournal(await fetchRestore(url, reply(200, { skus: 'x' })))).toBe('журнал: неверный ответ');
    expect(describeJournal(null)).toBe('журнал: не запрашивался');
  });

  it('в строке нет идентификаторов, подписи и адреса', async () => {
    for (const result of [
      await fetchRestore(url, reply(200, { skus: ['dachnye_tainy_no_ads'] })),
      await fetchRestore(url, reply(403, {})),
    ]) {
      const text = describeJournal(result);
      expect(text).not.toMatch(/574470572|SECRET|http|oktest|sign|vk_/);
    }
  });

  it('прежний fetchConfirmedSkus ведёт себя как раньше', async () => {
    expect(await fetchConfirmedSkus(url, reply(200, { skus: ['dachnye_tainy_no_ads'] }))).toEqual(['dachnye_tainy_no_ads']);
    expect(await fetchConfirmedSkus(url, reply(403, {}))).toBeNull();
  });
});
