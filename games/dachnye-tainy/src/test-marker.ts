/**
 * Маркер изолированной тестовой сборки — чтобы при запуске в настоящих
 * Одноклассниках было однозначно видно, какой адрес загрузила площадка:
 * тестовый (режим разработки) или основной. Подробно —
 * docs/ok-test-build-2026-10.md.
 *
 * Показываются только текст маркера (дата и коммит сборки) и значения двух
 * параметров запуска — vk_client (ok / vk) и vk_platform. Остальные
 * параметры, в том числе подпись и id пользователя, не выводятся.
 *
 * В обычных сборках __TEST_MARKER__ пустой: ни полосы, ни изменений заголовка.
 */

declare const __TEST_MARKER__: string;

export function markerText(marker: string, search: string): string {
  const params = new URLSearchParams(search);
  const client = params.get('vk_client') ?? '—';
  const platform = params.get('vk_platform') ?? '—';
  return `${marker} · клиент: ${client} · платформа: ${platform}`;
}

export function showTestMarker(): void {
  if (!__TEST_MARKER__) return;
  const ribbon = document.createElement('div');
  ribbon.className = 'test-marker';
  ribbon.setAttribute('aria-hidden', 'true');
  ribbon.textContent = markerText(__TEST_MARKER__, location.search);
  document.body.append(ribbon);
  document.title = `[ТЕСТ] ${document.title}`;
}
