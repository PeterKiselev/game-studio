import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Модератор ОК отклонил «Дачные тайны»: «Платежи не работают». Тот же адаптер
 * VK обслуживает и ОК, а в официальной таблице совместимости VK Bridge в ОК
 * VKWebAppShowOrderBox помечен «не поддерживается». Здесь проверяется, что
 * адаптер различает платформы по vk_client=ok и не обещает платежи там, где их
 * нет, — и что в самом ВКонтакте ничего не изменилось.
 */
const send = vi.fn();
vi.mock('@vkontakte/vk-bridge', () => ({ default: { send } }));

async function initWith(search: string) {
  vi.stubGlobal('location', { search, href: `https://example.test/${search}` });
  const { VkPlatform } = await import('../src/adapters/vk');
  const platform = new VkPlatform();
  await platform.init();
  return platform;
}

describe('VkPlatform: ВКонтакте и Одноклассники', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockImplementation(async (method: string) => {
      if (method === 'VKWebAppCheckNativeAds') return { result: true };
      if (method === 'VKWebAppGetUserInfo') return { id: 7, first_name: 'Тест', last_name: 'Игрок' };
      return {};
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('во ВКонтакте без vk_client платежи включены — рабочий путь не тронут', async () => {
    const platform = await initWith('?vk_language=ru&vk_platform=desktop_web');
    expect(platform.caps.payments).toBe(true);
  });

  it('vk_client=vk (явно ВКонтакте) — платежи включены', async () => {
    const platform = await initWith('?vk_client=vk&vk_language=ru');
    expect(platform.caps.payments).toBe(true);
  });

  it('в Одноклассниках (vk_client=ok) платежи выключены, остальное работает', async () => {
    const platform = await initWith('?vk_client=ok&vk_language=ru');
    expect(platform.caps.payments).toBe(false);
    expect(platform.caps.rewarded).toBe(true);
    expect(platform.caps.interstitial).toBe(true);
    expect(platform.caps.cloudSave).toBe(true);
    expect(platform.caps.share).toBe(true);
    expect(platform.player.id).toBe('7');
  });

  it('инициализация в ОК не вызывает VKWebAppShowOrderBox', async () => {
    await initWith('?vk_client=ok');
    expect(send).not.toHaveBeenCalledWith('VKWebAppShowOrderBox', expect.anything());
  });

  it('только точное значение «ok» отключает платежи, другие значения — нет', async () => {
    expect((await initWith('?vk_client=OKX')).caps.payments).toBe(true);
    expect((await initWith('?vk_client=')).caps.payments).toBe(true);
  });
});
