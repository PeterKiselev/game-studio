import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { Unstable_DevWorker } from 'wrangler';

/**
 * Настоящий Durable Object `LedgerDO` в локальном Workers-runtime (workerd через
 * wrangler unstable_dev). Ничего не разворачивается в облако: wrangler поднимает
 * workerd на этой машине, состояние пишется во временную папку.
 *
 * Здесь проверяется то, чего не видит поддельное хранилище в test/: сериализация
 * параллельных запросов одним объектом, транзакция настоящего хранилища,
 * сохранность после перезапуска, маршрутизация Worker → DO.
 */
const VK_SECRET = 'int-vk-secret';
const OK_SECRET = 'int-ok-secret';
const OK_KEY = 'INTTESTKEY';
const DT_ID = '54767366';

function md5Sig(fields: Record<string, string>, secret: string): string {
  const str = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('');
  return createHash('md5').update(str + secret).digest('hex');
}

function okQuery(over: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    uid: '512005303399',
    transaction_id: 't-1',
    transaction_time: '2026-10-07 12:00:00',
    amount: '7',
    product_code: 'int_a',
    method: 'callbacks.payment',
    application_key: OK_KEY,
    ...over,
  };
  return new URLSearchParams({ ...fields, sig: md5Sig(fields, OK_SECRET) }).toString();
}

function launchQuery(over: Record<string, string> = {}): string {
  const fields: Record<string, string> = { vk_user_id: '512005303399', vk_app_id: DT_ID, vk_client: 'ok', vk_platform: 'desktop_web', ...over };
  for (const k of Object.keys(fields)) if (fields[k] === '__drop__') delete fields[k];
  const q = Object.keys(fields).sort().map((k) => `${k}=${encodeURIComponent(fields[k])}`).join('&');
  const sign = createHmac('sha256', VK_SECRET).update(q).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return new URLSearchParams({ ...fields, sign }).toString();
}

function vkBody(over: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    app_id: DT_ID,
    notification_type: 'order_status_change_test',
    status: 'chargeable',
    order_id: '777001',
    user_id: '574470572',
    receiver_id: '574470572',
    item: 'dachnye_tainy_no_ads',
    item_price: '20',
    date: '1790607282',
    ...over,
  };
  return new URLSearchParams({ ...fields, sig: md5Sig(fields, VK_SECRET) }).toString();
}

const persistTo = mkdtempSync(join(tmpdir(), 'ledger-int-'));
let worker: Unstable_DevWorker;

async function start(): Promise<Unstable_DevWorker> {
  return unstable_dev('test-int/entry.ts', {
    config: 'test-int/wrangler.int.toml',
    persistTo,
    logLevel: 'warn',
    experimental: { disableExperimentalWarning: true },
  });
}

const skus = async (path: string, query: string): Promise<string[]> =>
  ((await (await worker.fetch(`${path}?${query}`)).json()) as { skus: string[] }).skus;

beforeAll(async () => {
  worker = await start();
});

afterAll(async () => {
  await worker?.stop();
  rmSync(persistTo, { recursive: true, force: true });
});

describe('LedgerDO в workerd', () => {
  it('покупка ОК записывается и восстанавливается', async () => {
    const res = await worker.fetch(`/ok-int?${okQuery()}`);
    expect(await res.text()).toBe('true');
    expect(await skus('/ok-int/restore', launchQuery())).toEqual(['int_a']);
  });

  it('20 одновременных повторов одной транзакции: все true, одна покупка', async () => {
    const q = okQuery({ uid: '100', transaction_id: 'burst-1' });
    const answers = await Promise.all(Array.from({ length: 20 }, () => worker.fetch(`/ok-int?${q}`).then((r) => r.text())));
    expect(new Set(answers)).toEqual(new Set(['true']));
    expect(await skus('/ok-int/restore', launchQuery({ vk_user_id: '100' }))).toEqual(['int_a']);
  });

  it('гонка: один transaction_id одновременно с двумя товарами — принят ровно один', async () => {
    const a = okQuery({ uid: '200', transaction_id: 'race-1', product_code: 'int_a', amount: '7' });
    const b = okQuery({ uid: '200', transaction_id: 'race-1', product_code: 'int_b', amount: '9' });
    const [ra, rb] = await Promise.all([worker.fetch(`/ok-int?${a}`), worker.fetch(`/ok-int?${b}`)]);
    const results = [await ra.text(), await rb.text()];
    expect(results.filter((t) => t === 'true')).toHaveLength(1);
    expect(await skus('/ok-int/restore', launchQuery({ vk_user_id: '200' }))).toHaveLength(1);
  });

  it('разные транзакции одного пользователя одновременно — обе записаны', async () => {
    const a = okQuery({ uid: '300', transaction_id: 'p-1', product_code: 'int_a', amount: '7' });
    const b = okQuery({ uid: '300', transaction_id: 'p-2', product_code: 'int_b', amount: '9' });
    await Promise.all([worker.fetch(`/ok-int?${a}`), worker.fetch(`/ok-int?${b}`)]);
    expect(await skus('/ok-int/restore', launchQuery({ vk_user_id: '300' }))).toEqual(['int_a', 'int_b']);
  });

  it('ВК через настоящий Worker: заказ записан до подтверждения, /vk/restore отдаёт его', async () => {
    const res = await worker.fetch('/', { method: 'POST', body: vkBody() });
    expect(await res.json()).toEqual({ response: { order_id: 777001, app_order_id: 777001 } });
    const vkLaunch = launchQuery({ vk_user_id: '574470572', vk_client: '__drop__' });
    expect(await skus('/vk/restore', vkLaunch)).toEqual(['dachnye_tainy_no_ads']);
  });

  it('ВК без item_price — ошибка и ничего не записано', async () => {
    const fields = new URLSearchParams(vkBody({ order_id: '777002', user_id: '574470573', receiver_id: '574470573' }));
    fields.delete('item_price');
    fields.delete('sig');
    const plain = Object.fromEntries(fields);
    const body = new URLSearchParams({ ...plain, sig: md5Sig(plain, VK_SECRET) }).toString();
    const res = (await (await worker.fetch('/', { method: 'POST', body })).json()) as { error?: unknown };
    expect(res.error).toBeDefined();
    expect(await skus('/vk/restore', launchQuery({ vk_user_id: '574470573', vk_client: '__drop__' }))).toEqual([]);
  });

  it('/ok с настоящим каталогом: цена владельца 20 ОК принимается, другая сумма — нет', async () => {
    const wrong = okQuery({ uid: '400', transaction_id: 'prod-1', product_code: 'dachnye_tainy_no_ads', amount: '19' });
    expect((await worker.fetch(`/ok?${wrong}`)).headers.get('Invocation-error')).toBe('1001');
    const right = okQuery({ uid: '400', transaction_id: 'prod-2', product_code: 'dachnye_tainy_no_ads', amount: '20' });
    expect(await (await worker.fetch(`/ok?${right}`)).text()).toBe('true');
  });

  const record = async (tx: { uid: string; txId: string; sku: string; amount: number }): Promise<string> =>
    ((await (await worker.fetch('/ledger-int/record', { method: 'POST', body: JSON.stringify(tx) })).json()) as { result: string }).result;

  it('DO напрямую: повтор — duplicate, другой товар или сумма — conflict', async () => {
    const tx = { uid: '500', txId: 'd-1', sku: 'int_a', amount: 7 };
    expect(await record(tx)).toBe('new');
    expect(await record(tx)).toBe('duplicate');
    expect(await record({ ...tx, sku: 'int_b' })).toBe('conflict');
    expect(await record({ ...tx, amount: 8 })).toBe('conflict');
  });

  it('DO напрямую: 20 одновременных записей одной транзакции — ровно одна new', async () => {
    const tx = { uid: '600', txId: 'd-burst', sku: 'int_a', amount: 7 };
    const results = await Promise.all(Array.from({ length: 20 }, () => record(tx)));
    expect(results.filter((r) => r === 'new')).toHaveLength(1);
    expect(results.filter((r) => r === 'duplicate')).toHaveLength(19);
  });

  it('журнал переживает перезапуск runtime', async () => {
    await worker.stop();
    worker = await start();
    expect(await skus('/ok-int/restore', launchQuery())).toEqual(['int_a']);
    expect(await skus('/ok-int/restore', launchQuery({ vk_user_id: '300' }))).toEqual(['int_a', 'int_b']);
  });
});
