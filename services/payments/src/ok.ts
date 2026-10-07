/**
 * Одноклассники: подтверждение покупки (callbacks.payment) и восстановление.
 *
 * Схема — по документации VK Mini Apps «Продажа виртуальных ценностей в
 * Одноклассниках» и «Обработка платёжных уведомлений в Одноклассниках»
 * (dev.vk.com/ru/api/payments/…): на «URL для платёжных уведомлений
 * Одноклассников» площадка шлёт GET, мы проверяем подпись, товар и сумму и
 * отвечаем `true`; ОКи переводятся только после ответа. До трёх попыток с
 * паузой 5 с — значит повторное подтверждение уже учтённой транзакции обязано
 * снова давать `true`, но ничего второй раз не записывать.
 *
 * Чего здесь НЕТ намеренно (не угадываем):
 *  - цен в ОКах: у товаров нет `priceOk`, пока их не назвал владелец;
 *    без цены покупка отклоняется, а не принимается по «похожей» сумме;
 *  - ключа подписи ОК: берётся из окружения (OK_APP_SECRET);
 *  - уверенности, что `uid` из уведомления ОК равен `vk_user_id` запуска в ОК.
 *    Восстановление опирается на это равенство; если оно ложно, результат
 *    пуст (никому ничего не выдаётся), а не неверен. Проверяется тестовым
 *    платежом на настоящем ОК.
 */
import { verifyLaunchSign, verifySignature } from './signature';

export interface OkShopItem {
  /** Цена в ОКах. Пока не задана ни у одного товара — владелец её не назвал. */
  priceOk?: number;
}

/** Минимальный интерфейс хранилища (Cloudflare KV удовлетворяет через `kvStore`). */
export interface PurchaseStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  /** Ключи с данным префиксом. */
  keys(prefix: string): Promise<string[]>;
}

/** Структурно совместимая часть KVNamespace — без привязки к типам workers-types в тестах. */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export function kvStore(kv: KvLike): PurchaseStore {
  return {
    get: (key) => kv.get(key),
    put: (key, value) => kv.put(key, value),
    async keys(prefix) {
      const out: string[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await kv.list({ prefix, cursor });
        out.push(...page.keys.map((k) => k.name));
        if (page.list_complete) return out;
        cursor = page.cursor;
      }
    },
  };
}

export interface OkContext {
  /** Секрет подписи уведомлений ОК (OK_APP_SECRET). */
  secret?: string;
  store?: PurchaseStore;
  catalog: Record<string, OkShopItem>;
}

/** Коды ошибок ОК: UNKNOWN 1, SERVICE 2, PARAM_SIGNATURE 104, CALLBACK_INVALID_PAYMENT 1001. */
const SERVICE = 2;
const PARAM_SIGNATURE = 104;
const INVALID_PAYMENT = 1001;

function okError(code: number, message: string): Response {
  // Документация: при ошибке заголовок Invocation-error содержит код; тело — объект ошибки.
  // Какой HTTP-статус ожидает ОК при ошибке, документация не говорит — отдаём 200.
  return new Response(JSON.stringify({ error_code: code, error_msg: message, error_data: null }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Invocation-error': String(code) },
  });
}

function okTrue(): Response {
  return new Response('true', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

const purchaseKey = (uid: string, sku: string): string => `ok:p:${uid}:${sku}`;
const txKey = (transactionId: string): string => `ok:tx:${transactionId}`;

export async function handleOkPayment(params: URLSearchParams, ctx: OkContext): Promise<Response> {
  if (!ctx.secret) return okError(SERVICE, 'OK_APP_SECRET не настроен на сервере.');
  if (!ctx.store) return okError(SERVICE, 'Хранилище покупок не подключено.');
  if (!verifySignature(params, ctx.secret)) return okError(PARAM_SIGNATURE, 'Неверная подпись.');

  // method есть в примере запроса из документации; если его нет — не считаем это ошибкой,
  // но чужой метод отклоняем.
  const method = params.get('method');
  if (method !== null && method !== 'callbacks.payment') {
    return okError(INVALID_PAYMENT, 'Неожиданный метод уведомления.');
  }

  // Непустое extra_attributes — подписки и пр. Подписок у нас нет.
  if ((params.get('extra_attributes') ?? '') !== '') {
    return okError(INVALID_PAYMENT, 'Подписки не поддерживаются.');
  }

  const uid = params.get('uid') ?? '';
  const transactionId = params.get('transaction_id') ?? '';
  const sku = params.get('product_code') ?? '';
  const amountRaw = params.get('amount') ?? '';
  if (!/^\d+$/.test(uid) || !transactionId || !/^\d+$/.test(amountRaw)) {
    return okError(INVALID_PAYMENT, 'Не хватает или неверны uid, transaction_id или amount.');
  }

  const item = Object.prototype.hasOwnProperty.call(ctx.catalog, sku) ? ctx.catalog[sku] : undefined;
  if (!item) return okError(INVALID_PAYMENT, 'Товара не существует.');
  if (item.priceOk === undefined) return okError(INVALID_PAYMENT, 'Цена в ОКах для товара не задана.');
  if (Number(amountRaw) !== item.priceOk) {
    // Обязательное требование ОК: сумма не по каталогу — ошибка, ничего не выдаём.
    return okError(INVALID_PAYMENT, 'Сумма не совпадает с ценой товара.');
  }

  try {
    const seen = await ctx.store.get(txKey(transactionId));
    if (seen !== null) {
      const prev = JSON.parse(seen) as { uid?: string; sku?: string };
      // Повтор той же транзакции — тот же успешный ответ, второй записи нет.
      if (prev.uid === uid && prev.sku === sku) return okTrue();
      return okError(INVALID_PAYMENT, 'transaction_id уже использован для другой покупки.');
    }
    // Сначала покупка, потом отметка транзакции: если сбой между ними, повтор
    // перезапишет ту же запись — результат тот же.
    await ctx.store.put(
      purchaseKey(uid, sku),
      JSON.stringify({ transactionId, at: params.get('transaction_time') ?? '' }),
    );
    await ctx.store.put(txKey(transactionId), JSON.stringify({ uid, sku }));
  } catch {
    // Не подтверждаем, если не смогли записать: ОК повторит запрос или отменит платёж и вернёт деньги.
    return okError(SERVICE, 'Не удалось сохранить покупку.');
  }
  return okTrue();
}

export interface RestoreContext {
  /** Защищённый ключ приложения (VK_APP_SECRET) — им подписаны параметры запуска. */
  secret?: string;
  store?: PurchaseStore;
}

function restoreJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Ответ отдаётся только при верной подписи запуска; игра открывается с другого домена.
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Восстановление покупок: игра присылает свои vk_* параметры запуска и sign,
 * сервер проверяет подпись и отдаёт список купленных SKU этого пользователя.
 * Только для запуска из ОК (`vk_client=ok`); покупки ВК здесь не учитываются.
 */
export async function handleOkRestore(search: URLSearchParams, ctx: RestoreContext): Promise<Response> {
  if (!ctx.secret || !ctx.store) return restoreJson(503, { error: 'not_configured' });
  if (!verifyLaunchSign(search, ctx.secret)) return restoreJson(403, { error: 'bad_sign' });
  if (search.get('vk_client') !== 'ok') return restoreJson(403, { error: 'not_ok' });

  const uid = search.get('vk_user_id') ?? '';
  if (!/^\d+$/.test(uid)) return restoreJson(403, { error: 'bad_user' });

  try {
    const prefix = `ok:p:${uid}:`;
    const skus = (await ctx.store.keys(prefix)).map((key) => key.slice(prefix.length));
    return restoreJson(200, { skus: skus.sort() });
  } catch {
    return restoreJson(503, { error: 'store_failed' });
  }
}
