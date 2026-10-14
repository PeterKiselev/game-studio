/**
 * Подтверждение покупок с учётом (ОК и ВК) и восстановление.
 *
 * Схема ОК — по документации VK Mini Apps «Продажа виртуальных ценностей в
 * Одноклассниках» / «Обработка платёжных уведомлений в Одноклассниках»: GET на
 * «URL для платёжных уведомлений Одноклассников», ответ `true` после обработки,
 * до трёх повторов. Схема ВК — `order_status_change` (POST), как раньше.
 *
 * Порядок обработки одинаков для обеих площадок:
 *  1. настройки и подпись; 2. принадлежность приложению (ключ ОК, SKU из каталога
 *  этого приложения); 3. **сначала поиск транзакции в журнале** — повтор уже
 *  принятой покупки подтверждается, даже если цена в каталоге с тех пор
 *  изменилась (иначе площадка отменит оплаченную покупку); 4. для новой —
 *  проверка суммы по текущему каталогу; 5. атомарная запись; 6. только потом ответ.
 *
 * Не угадываем: цены в ОКах (`priceOk`), секрет подписи ОК, признак тестового
 * режима в GET-уведомлении ОК (режим ОК задаётся деплою, PAYMENTS_MODE).
 */
import type { ShopItem } from './index';
import type { Ledger, Mode, Platform, Scope } from './ledger';
import { verifyLaunchSign, verifySignature } from './signature';

export interface AppCtx {
  /** Ключ приложения в каталоге: товары с другим `app` этому приложению не продаются. */
  app?: string;
  /** VK ID приложения — сверяется с `vk_app_id` при восстановлении. */
  appId?: string;
  ledger?: Ledger;
  catalog: Record<string, ShopItem>;
}

function appItem(ctx: AppCtx, sku: string): ShopItem | undefined {
  if (!Object.prototype.hasOwnProperty.call(ctx.catalog, sku)) return undefined;
  const item = ctx.catalog[sku];
  return item.app === ctx.app ? item : undefined;
}

// --- Одноклассники ----------------------------------------------------------

export interface OkCtx extends AppCtx {
  /** Секрет подписи уведомлений ОК (OK_APP_SECRET). */
  secret?: string;
  /** Публичный application_key ОК-приложения (OK_APP_KEY). */
  appKey?: string;
  /** Режим журнала для ОК (PAYMENTS_MODE): признак теста в GET ОК не документирован. */
  mode?: Mode;
}

const SERVICE = 2;
const PARAM_SIGNATURE = 104;
const INVALID_PAYMENT = 1001;

function okError(code: number, message: string): Response {
  return new Response(JSON.stringify({ error_code: code, error_msg: message, error_data: null }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Invocation-error': String(code) },
  });
}

function okTrue(): Response {
  return new Response('true', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function handleOkPayment(params: URLSearchParams, ctx: OkCtx): Promise<Response> {
  if (!ctx.secret || !ctx.appKey || !ctx.mode || !ctx.ledger || !ctx.app) {
    return okError(SERVICE, 'Платежи ОК не настроены на сервере.');
  }
  // Временное ограничение, не защита: признак тестового режима в GET-уведомлении ОК
  // не документирован, режим берётся из настройки деплоя. Пока он не подтверждён,
  // рабочий режим ОК заблокирован — работает только изолированный тестовый сервер.
  if (ctx.mode !== 'test') return okError(SERVICE, 'Рабочий режим платежей ОК заблокирован.');
  if (!verifySignature(params, ctx.secret)) return okError(PARAM_SIGNATURE, 'Неверная подпись.');
  if (params.get('application_key') !== ctx.appKey) {
    return okError(INVALID_PAYMENT, 'Уведомление другого приложения.');
  }
  const method = params.get('method');
  if (method !== null && method !== 'callbacks.payment') {
    return okError(INVALID_PAYMENT, 'Неожиданный метод уведомления.');
  }
  if ((params.get('extra_attributes') ?? '') !== '') {
    return okError(INVALID_PAYMENT, 'Подписки не поддерживаются.');
  }

  const uid = params.get('uid') ?? '';
  const txId = params.get('transaction_id') ?? '';
  const sku = params.get('product_code') ?? '';
  const amountRaw = params.get('amount') ?? '';
  if (!/^\d+$/.test(uid) || !txId || !/^\d+$/.test(amountRaw)) {
    return okError(INVALID_PAYMENT, 'Не хватает или неверны uid, transaction_id или amount.');
  }
  const amount = Number(amountRaw);
  const item = appItem(ctx, sku);
  if (!item) return okError(INVALID_PAYMENT, 'Товара нет в каталоге этого приложения.');

  const scope: Scope = { app: ctx.app, platform: 'ok', mode: ctx.mode, uid };
  const tx = { txId, sku, amount, at: params.get('transaction_time') ?? '' };
  try {
    const seen = await ctx.ledger.lookup(scope, txId);
    if (seen) {
      return seen.sku === sku && seen.amount === amount
        ? okTrue()
        : okError(INVALID_PAYMENT, 'transaction_id уже использован для другой покупки.');
    }
    if (item.priceOk === undefined) return okError(INVALID_PAYMENT, 'Цена в ОКах для товара не задана.');
    if (amount !== item.priceOk) return okError(INVALID_PAYMENT, 'Сумма не совпадает с ценой товара.');

    const result = await ctx.ledger.record(scope, tx);
    if (result === 'conflict') return okError(INVALID_PAYMENT, 'transaction_id уже использован для другой покупки.');
  } catch {
    // Запись не подтверждена — не отвечаем true: ОК повторит запрос или вернёт деньги.
    return okError(SERVICE, 'Не удалось сохранить покупку.');
  }
  return okTrue();
}

// --- ВКонтакте: order_status_change с учётом ---------------------------------

function vkJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
const vkError = (code: number, msg: string, critical: boolean): Response =>
  vkJson({ error: { error_code: code, error_msg: msg, critical } });

/**
 * Подпись уже проверена в index.ts. Состав уведомления — по документации
 * «Изменение статуса заказа (order_status_change)»: `item_price` — цена в
 * голосах, которую наш сервер отдал в `get_item`; `item_discount` — скидка, если
 * мы её давали (мы не даём). Режим — по `_test` в типе уведомления.
 *
 * Оплаченная сумма берётся **только** из уведомления. Текущая цена каталога
 * доказательством оплаты не служит: новый заказ без корректного `item_price`
 * отклоняется. Повтор уже принятого заказа документация опознаёт по `order_id` и
 * статусу — ему отвечаем тем же успехом по сохранённой записи; если `item_price`
 * в повторе есть, он обязан совпасть с записанной суммой.
 */
export async function handleVkOrder(params: URLSearchParams, ctx: AppCtx): Promise<Response> {
  if (!ctx.ledger || !ctx.app) return vkError(2, 'Учёт покупок не настроен.', false);

  const status = params.get('status');
  const orderId = params.get('order_id') ?? '';
  const uid = params.get('user_id') ?? '';
  const sku = params.get('item') ?? '';
  if (status !== 'chargeable' || !/^\d+$/.test(orderId) || !/^\d+$/.test(uid)) {
    return vkError(11, 'Ожидался статус chargeable с числовыми order_id и user_id.', true);
  }
  if (ctx.appId && params.get('app_id') !== ctx.appId) {
    return vkError(11, 'Уведомление другого приложения.', true);
  }
  const item = appItem(ctx, sku);
  if (!item) return vkError(20, 'Товара нет в каталоге этого приложения.', true);

  const priceRaw = params.get('item_price');
  const paid = priceRaw !== null && /^\d+$/.test(priceRaw) ? Number(priceRaw) : undefined;

  const mode: Mode = (params.get('notification_type') ?? '').endsWith('_test') ? 'test' : 'live';
  const scope: Scope = { app: ctx.app, platform: 'vk', mode, uid };
  const ok = (): Response => vkJson({ response: { order_id: Number(orderId), app_order_id: Number(orderId) } });
  const conflict = (): Response => vkError(11, 'order_id уже использован для другой покупки.', true);
  try {
    const seen = await ctx.ledger.lookup(scope, orderId);
    if (seen) {
      if (seen.sku !== sku) return conflict();
      if (priceRaw !== null && paid !== seen.amount) return conflict();
      return ok();
    }
    if (paid === undefined) return vkError(11, 'В уведомлении нет корректного item_price.', true);
    const discount = params.get('item_discount');
    if (discount !== null && discount !== '0') return vkError(11, 'Скидки на товары не предоставляются.', true);
    if (paid !== item.price) return vkError(11, 'Цена заказа не совпадает с каталогом.', true);
    const result = await ctx.ledger.record(scope, { txId: orderId, sku, amount: paid, at: params.get('date') ?? '' });
    if (result === 'conflict') return conflict();
  } catch {
    return vkError(2, 'Не удалось сохранить покупку.', false);
  }
  return ok();
}

// --- восстановление ---------------------------------------------------------

export interface RestoreCtx extends AppCtx {
  platform: Platform;
  /** Защищённый ключ приложения (VK_APP_SECRET) — им подписаны параметры запуска. */
  secret?: string;
  /** Какой журнал отдавать (PAYMENTS_MODE): в рабочем деплое тестовые покупки не восстанавливаются. */
  mode?: Mode;
}

function restoreJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function handleRestore(search: URLSearchParams, ctx: RestoreCtx): Promise<Response> {
  if (!ctx.secret || !ctx.ledger || !ctx.mode || !ctx.app || !ctx.appId) {
    return restoreJson(503, { error: 'not_configured' });
  }
  if (ctx.platform === 'ok' && ctx.mode !== 'test') return restoreJson(503, { error: 'ok_live_blocked' });
  if (!verifyLaunchSign(search, ctx.secret)) return restoreJson(403, { error: 'bad_sign' });
  if (search.get('vk_app_id') !== ctx.appId) return restoreJson(403, { error: 'other_app' });
  const isOk = search.get('vk_client') === 'ok';
  if (isOk !== (ctx.platform === 'ok')) return restoreJson(403, { error: 'other_platform' });

  // Use the OK-specific identity only after verifying the entire vk_* signature.
  // Older launches can still carry their OK identity in vk_user_id.
  if (isOk && search.getAll('vk_ok_user_id').length > 1) return restoreJson(403, { error: 'bad_user' });
  const uid = isOk && search.has('vk_ok_user_id')
    ? search.get('vk_ok_user_id') ?? ''
    : search.get('vk_user_id') ?? '';
  if (!/^\d+$/.test(uid)) return restoreJson(403, { error: 'bad_user' });
  try {
    const skus = await ctx.ledger.list({ app: ctx.app, platform: ctx.platform, mode: ctx.mode, uid });
    return restoreJson(200, { skus: skus.filter((sku) => appItem(ctx, sku)) });
  } catch {
    return restoreJson(503, { error: 'store_failed' });
  }
}
