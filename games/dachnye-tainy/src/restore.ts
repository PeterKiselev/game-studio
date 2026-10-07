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
export function restoreUrl(base: string, search: string): string | null {
  if (!base) return null;
  const params = new URLSearchParams(search);
  if (!params.get('sign')) return null;
  const forwarded = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('vk_') || key === 'sign') forwarded.append(key, value);
  }
  if (!forwarded.get('vk_user_id') || !forwarded.get('vk_app_id')) return null;
  const path = params.get('vk_client') === 'ok' ? 'ok/restore' : 'vk/restore';
  return `${base.replace(/\/+$/, '')}/${path}?${forwarded.toString()}`;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** Подтверждённые сервером SKU этой игры или null при любой ошибке. */
export async function fetchConfirmedSkus(
  url: string,
  fetchFn: FetchLike,
  timeoutMs = 5000,
): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { skus?: unknown };
    if (!body || !Array.isArray(body.skus) || !body.skus.every((s) => typeof s === 'string')) return null;
    return (body.skus as string[]).filter((sku) => Object.prototype.hasOwnProperty.call(SKU_FLAGS, sku));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
