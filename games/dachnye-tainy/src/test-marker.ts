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

/**
 * Вторая строка полосы — диагностика восстановления (только сборка с
 * --restore-diag): что ответил журнал на последнем запросе. Текст готовит
 * describeJournal() — без идентификаторов, подписи и адреса.
 */
export function setMarkerJournal(text: string): void {
  if (!__TEST_MARKER__) return;
  let line = document.querySelector<HTMLElement>('.test-marker-journal');
  if (!line) {
    line = document.createElement('div');
    line.className = 'test-marker-journal';
    line.setAttribute('aria-hidden', 'true');
    document.body.append(line);
  }
  line.textContent = text;
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
