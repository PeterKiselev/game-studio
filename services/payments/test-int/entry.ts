/**
 * Точка входа для интеграционных тестов: настоящий Worker из src/index.ts плюс
 * маршрут /ok-int с тестовым каталогом. В боевом каталоге цен в ОКах нет
 * (владелец их не назвал), поэтому через боевой /ok покупка ОК пройти не может;
 * тестовые цены живут только здесь и в production-сборку не попадают.
 */
import worker, { ITEMS } from '../src/index';
import type { Env, ShopItem } from '../src/index';
import { doLedger } from '../src/ledger';
import type { Mode } from '../src/ledger';
import { handleOkPayment, handleRestore } from '../src/ok';

export { LedgerDO } from '../src/ledger';

const TEST_CATALOG: Record<string, ShopItem> = {
  ...ITEMS,
  int_a: { app: 'dachnye-tainy', title: 'Тест А', price: 20, priceOk: 7 },
  int_b: { app: 'dachnye-tainy', title: 'Тест Б', price: 20, priceOk: 9 },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const base = {
      app: env.APP_SLUG,
      appId: env.VK_APP_ID,
      ledger: env.LEDGER ? doLedger(env.LEDGER) : undefined,
      catalog: TEST_CATALOG,
      mode: env.PAYMENTS_MODE as Mode,
    };
    // Прямой вызов журнала в обход обработчика (без предварительного lookup):
    // проверяет решения самого Durable Object — duplicate/conflict/new.
    if (url.pathname === '/ledger-int/record' && base.ledger) {
      const body = (await request.json()) as { uid: string; txId: string; sku: string; amount: number };
      const result = await base.ledger.record(
        { app: 'dachnye-tainy', platform: 'ok', mode: 'test', uid: body.uid },
        { txId: body.txId, sku: body.sku, amount: body.amount, at: '' },
      );
      return Response.json({ result });
    }
    if (url.pathname === '/ok-int') {
      return handleOkPayment(url.searchParams, { ...base, secret: env.OK_APP_SECRET, appKey: env.OK_APP_KEY });
    }
    if (url.pathname === '/ok-int/restore') {
      return handleRestore(url.searchParams, { ...base, platform: 'ok', secret: env.VK_APP_SECRET });
    }
    return worker.fetch(request, env);
  },
};
