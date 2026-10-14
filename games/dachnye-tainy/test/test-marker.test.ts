import { describe, expect, it } from 'vitest';
import { markerText } from '../src/test-marker';

describe('маркер тестовой сборки', () => {
  const marker = 'ТЕСТ ОК · 2026-10-14 · 4d423a5';

  it('показывает клиент и платформу запуска', () => {
    expect(markerText(marker, '?vk_client=ok&vk_platform=desktop_web')).toBe(
      'ТЕСТ ОК · 2026-10-14 · 4d423a5 · клиент: ok · платформа: desktop_web',
    );
  });

  it('без параметров запуска — прочерки, видно, что это не ОК', () => {
    expect(markerText(marker, '')).toBe('ТЕСТ ОК · 2026-10-14 · 4d423a5 · клиент: — · платформа: —');
  });

  it('id пользователя, подпись и прочие параметры не выводятся', () => {
    const text = markerText(marker, '?vk_user_id=574470572&sign=SECRET&vk_app_id=54767366&vk_client=ok&vk_access_token_settings=x');
    expect(text).not.toMatch(/574470572|SECRET|54767366|access/);
  });
});
