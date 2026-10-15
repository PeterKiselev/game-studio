/**
 * Восстановление покупок из серверного журнала (`services/payments`).
 *
 * Покупка, за которую списаны голоса или ОКи, должна сохраниться, даже если
 * игра закрылась до ответа платёжного окна. Источник правды — журнал на
 * сервере: игра отправляет свои подписанные параметры запуска (`vk_*` и `sign`)
 * и получает список подтверждённых SKU.
 *
 * Правила, которые здесь держатся:
 *  - **только добавление**: восстановление никогда не снимает имеющееся право.
 *    Покупки ВК, сделанные до появления журнала, в нём отсутствуют, — пустой
 *    ответ не значит «ничего не куплено»;
 *  - любая ошибка (сеть, таймаут, не-200, кривой ответ) → `null`, состояние не
 *    меняется, игра не блокируется;
 *  - без адреса сервера или без подписи запуска запрос не отправляется вовсе.
 *
 * Разделение test/live — на сервере (режим деплоя); клиент знает только адрес.
 */

/** Права, которые даёт каждый SKU. Тот же список, что SHOP_EFFECTS в main.ts. */
export interface Purchases {
  noAds?: boolean;
  unlimitedHints?: boolean;
}

export const SKU_FLAGS: Record<string, keyof Purchases> = {
  dachnye_tainy_no_ads: 'noAds',
  dachnye_tainy_unlimited_hints: 'unlimitedHints',
};

/**
 * Адрес восстановления или null, если запрашивать нечего. Передаются только
 * `vk_*` и `sign` — то, что подписано; остальные параметры адреса (например
 * `lang`) серверу не нужны.
 */
export function restoreUrl(base: string, search: string, okBase = ''): string | null {
  const params = new URLSearchParams(search);
  const selectedBase = params.get('vk_client') === 'ok' && okBase ? okBase : base;
  if (!selectedBase) return null;
  if (!params.get('sign')) return null;
  const forwarded = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('vk_') || key === 'sign') forwarded.append(key, value);
  }
  if (!forwarded.get('vk_user_id') || !forwarded.get('vk_app_id')) return null;
  const path = params.get('vk_client') === 'ok' ? 'ok/restore' : 'vk/restore';
  return `${selectedBase.replace(/\/+$/, '')}/${path}?${forwarded.toString()}`;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}>;

/**
 * Что ответил журнал — с причиной ошибки. Нужен диагностике восстановления
 * (тестовая сборка): по нему видно, пришли права из журнала или нет, отдельно
 * от того, что лежит в сохранении.
 */
export type RestoreResult =
  | { kind: 'skus'; skus: string[]; unknown: number }
  | { kind: 'error'; reason: 'network' | 'timeout' | 'bad-response' | 'http'; status?: number };

export async function fetchRestore(url: string, fetchFn: FetchLike, timeoutMs = 5000): Promise<RestoreResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) return { kind: 'error', reason: 'http', status: res.status };
    const body = (await res.json()) as { skus?: unknown };
    if (!body || !Array.isArray(body.skus) || !body.skus.every((s) => typeof s === 'string')) {
      return { kind: 'error', reason: 'bad-response' };
    }
    const all = body.skus as string[];
    const skus = all.filter((sku) => Object.prototype.hasOwnProperty.call(SKU_FLAGS, sku));
    return { kind: 'skus', skus, unknown: all.length - skus.length };
  } catch {
    return { kind: 'error', reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** Подтверждённые сервером SKU этой игры или null при любой ошибке. */
export async function fetchConfirmedSkus(
  url: string,
  fetchFn: FetchLike,
  timeoutMs = 5000,
): Promise<string[] | null> {
  const result = await fetchRestore(url, fetchFn, timeoutMs);
  return result.kind === 'skus' ? result.skus : null;
}

const SKU_SHORT: Record<string, string> = {
  dachnye_tainy_no_ads: 'без рекламы',
  dachnye_tainy_unlimited_hints: 'подсказки',
};

/**
 * Строка диагностики для тестовой полосы: только ответ журнала — названия
 * товаров, «пусто» или вид ошибки. Ни идентификаторов, ни подписи, ни адреса
 * запроса. null — запрос не отправлялся (нет адреса сервера или подписи запуска).
 */
export function describeJournal(result: RestoreResult | null): string {
  if (!result) return 'журнал: не запрашивался';
  if (result.kind === 'error') {
    if (result.reason === 'http') return `журнал: ошибка ${result.status ?? 'сервера'}`;
    if (result.reason === 'timeout') return 'журнал: нет ответа';
    if (result.reason === 'bad-response') return 'журнал: неверный ответ';
    return 'журнал: ошибка сети';
  }
  const names = result.skus.map((sku) => SKU_SHORT[sku] ?? sku);
  const extra = result.unknown > 0 ? ` (+${result.unknown} чужих)` : '';
  return names.length > 0 ? `журнал: ${names.join(', ')}${extra}` : `журнал: пусто${extra}`;
}

/** Добавляет права из списка SKU. Возвращает добавленные SKU; ничего не снимает. */
export function mergePurchases(purchases: Purchases, skus: readonly string[]): string[] {
  const added: string[] = [];
  for (const sku of skus) {
    const flag = SKU_FLAGS[sku];
    if (flag && !purchases[flag]) {
      purchases[flag] = true;
      added.push(sku);
    }
  }
  return added;
}
