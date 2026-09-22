/**
 * Обработчик платёжных уведомлений VK Mini Apps для игр студии.
 *
 * Протокол — по официальной документации VK (dev.vk.ru/ru/games/settings/
 * payments/setting-up → «Обработка платёжных уведомлений ВКонтакте»):
 * POST с parametr=значение через `&`, подпись — MD5(отсортированные
 * параметры без sig, конкатенированные без разделителя, + секретный ключ).
 * Код здесь — прямое соответствие примеру из документации (PHP/JS), не
 * вольная интерпретация: строки протокола проверены по присланному тексту
 * документации, не по памяти общих знаний о VK API.
 *
 * Специально СТАТЕЛЕСС, без базы/KV: сервер не хранит и не «начисляет»
 * покупку сам — он только подтверждает VK, что заказ принят. Сама
 * покупка применяется на клиенте, когда VKWebAppShowOrderBox резолвится
 * успешно (см. buy() в games/dachnye-tainy/src/main.ts). Значит
 * повторное уведомление с тем же order_id и статусом chargeable можно
 * просто подтверждать заново — это ровно то идемпотентное поведение,
 * которое просит документация («возвращайте тот же успешный ответ»),
 * и никакого риска задвоить начисление нет, потому что сервер ничего
 * не начисляет сам.
 */

import { createHash } from 'node:crypto';

export interface Env {
  /** Защищённый ключ приложения из dev.vk.ru → Платежи → Подключение. Секрет Worker'а, не в коде. */
  VK_APP_SECRET: string;
}

interface ShopItem {
  title: string;
  /** Цена в голосах VK — целое число. */
  price: number;
}

/**
 * Каталог товаров — те же SKU, что в SHOP_ITEMS соответствующих игр.
 * Меняешь цену/название здесь — меняешь то, что видит игрок в окне покупки VK.
 * Один и тот же Worker можно развернуть отдельно для каждого приложения со
 * своим VK_APP_SECRET. До появления app_id Sudoku его сервер не разворачиваем.
 */
const ITEMS: Record<string, ShopItem> = {
  dachnye_tainy_no_ads: { title: 'Без рекламы', price: 20 },
  dachnye_tainy_unlimited_hints: { title: 'Безлимитные подсказки', price: 20 },
  sudoku_no_ads: { title: 'Без рекламы', price: 20 },
  sudoku_unlimited_hints: { title: 'Безлимитные подсказки', price: 20 },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function errorResponse(error_code: number, error_msg: string, critical: boolean): Response {
  return json({ error: { error_code, error_msg, critical } });
}

/**
 * Проверка подписи — буквально по разделу «Подпись параметров»: раскодировать
 * (URLSearchParams уже делает это при разборе тела запроса), отсортировать
 * пары параметр=значение кроме sig по имени параметра, склеить без
 * разделителя, добавить секретный ключ, посчитать MD5, сравнить с sig.
 */
export function verifySignature(params: URLSearchParams, secret: string): boolean {
  const sig = params.get('sig');
  if (!sig) return false;

  const pairs = [...params.entries()]
    .filter(([key]) => key !== 'sig')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('');

  const computed = createHash('md5').update(pairs + secret).digest('hex');
  return computed === sig;
}

export function handleGetItem(params: URLSearchParams): Response {
  const itemId = params.get('item');
  const item = itemId ? ITEMS[itemId] : undefined;

  if (!item) {
    return errorResponse(20, 'Товара не существует.', true);
  }

  return json({
    response: {
      item_id: itemId,
      title: item.title,
      price: item.price,
    },
  });
}

/**
 * order_status_change — единственный статус, который мы реально продаём,
 * это chargeable (списание). refund/остальное явно не обрабатываем: у нас
 * нет подписок и нет расходуемых (consumable) товаров, которые можно было
 * бы вернуть — оба SKU одноразовые и навсегда, отменять там нечего.
 */
export function handleOrderStatusChange(params: URLSearchParams): Response {
  const status = params.get('status');
  const orderId = params.get('order_id');

  if (status !== 'chargeable' || !orderId || !/^\d+$/.test(orderId)) {
    return errorResponse(11, 'Ожидался статус chargeable с числовым order_id.', true);
  }

  // Своего отдельного номера заказа у нас нет (нет базы) — переиспользуем
  // order_id VK и как app_order_id, обычная практика для сервисов без
  // собственной системы нумерации заказов.
  const orderIdNum = Number(orderId);
  return json({ response: { order_id: orderIdNum, app_order_id: orderIdNum } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const bodyText = await request.text();
    // application/x-www-form-urlencoded — то же самое, что PHP-URL-кодировка
    // из документации VK (+ как пробел, %XX как остальные символы);
    // URLSearchParams декодирует это тем же способом при разборе.
    const params = new URLSearchParams(bodyText);

    if (!env.VK_APP_SECRET) {
      // Секрет не настроен на этом деплое — честная ошибка вместо того,
      // чтобы молча сравнивать подпись с пустой строкой и что-то пропустить.
      return errorResponse(1, 'VK_APP_SECRET не настроен на сервере.', true);
    }

    if (!verifySignature(params, env.VK_APP_SECRET)) {
      return errorResponse(10, 'Несовпадение вычисленной и переданной подписи запроса.', true);
    }

    const type = params.get('notification_type');
    switch (type) {
      case 'get_item':
      case 'get_item_test':
        return handleGetItem(params);
      case 'order_status_change':
      case 'order_status_change_test':
        return handleOrderStatusChange(params);
      default:
        // get_subscription/subscription_status_change сюда тоже попадут —
        // подписок у нас нет, это осознанно не реализовано, не забыто.
        return errorResponse(11, `Неизвестный или неподдерживаемый тип уведомления: ${type}.`, true);
    }
  },
};
