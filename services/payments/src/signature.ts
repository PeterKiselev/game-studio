import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка подписи — буквально по разделу «Подпись параметров»: раскодировать
 * (URLSearchParams уже делает это при разборе запроса), отсортировать
 * пары параметр=значение кроме sig по имени параметра, склеить без
 * разделителя, добавить секретный ключ, посчитать MD5, сравнить с sig.
 *
 * Тот же алгоритм описан и для GET-уведомления Одноклассников
 * (callbacks.payment): «сортируем и склеиваем параметры запроса и secret_key,
 * считаем MD5». Какой именно секрет подписывает уведомление ОК у приложения,
 * созданного через VK Mini Apps, документация не уточняет — ключ задаётся
 * снаружи (OK_APP_SECRET) и здесь не угадывается.
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

/**
 * Подпись параметров запуска мини-приложения — по странице «Подпись параметров
 * запуска» (dev.vk.com/ru/mini-apps/development/launch-params-sign): взять
 * параметры с префиксом vk_, отсортировать по имени, склеить `имя=значение`
 * через `&` (значения в URL-кодировке), HMAC-SHA256 защищённым ключом,
 * base64, затем `+`→`-`, `/`→`_` и убрать `=` на конце — это и есть `sign`.
 *
 * Ключ тот же «Защищённый ключ» приложения, что и для платёжных уведомлений
 * ВК. Подписывает ли запуск в ОК тем же ключом — документация не говорит,
 * проверяется только на настоящем запуске.
 */
export function verifyLaunchSign(search: URLSearchParams, secret: string): boolean {
  const sign = search.get('sign');
  if (!sign) return false;

  const query = [...search.entries()]
    .filter(([key]) => key.startsWith('vk_'))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  const expected = createHmac('sha256', secret)
    .update(query)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const a = Buffer.from(expected);
  const b = Buffer.from(sign);
  return a.length === b.length && timingSafeEqual(a, b);
}
