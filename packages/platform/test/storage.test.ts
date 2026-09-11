import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BasePlatform } from '../src/base';
import { SaveStore } from '../src/storage';

class TestPlatform extends BasePlatform { readonly id = 'web' as const; }
const envelope = (n: number, t = 1) => ({ v: 1, t, data: { n } });

describe('SaveStore cloud failures', () => {
  let values: Map<string, string>;
  let platform: TestPlatform;
  beforeEach(() => {
    vi.useFakeTimers();
    values = new Map([['studio:test', JSON.stringify(envelope(7))]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    platform = new TestPlatform();
    platform.caps.cloudSave = true;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const store = (platform: TestPlatform) => new SaveStore(platform, 'test', { n: 0 });

  it('loads local data within the deadline when cloud hangs', async () => {
    platform.storage.load = () => new Promise(() => {});
    const result = store(platform).load();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual({ n: 7 });
  });

  it('uses defaults if cloud hangs and no local save exists', async () => {
    values.clear();
    platform.storage.load = () => new Promise(() => {});
    const result = store(platform).load();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual({ n: 0 });
  });

  it('bounds flush and retains the local write when cloud hangs', async () => {
    platform.storage.save = () => new Promise(() => {});
    const save = store(platform);
    save.data.n = 9;
    save.markDirty();
    const result = save.flush();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBeUndefined();
    expect(JSON.parse(values.get('studio:test')!).data).toEqual({ n: 9 });
  });

  it('handles rejected cloud reads and writes', async () => {
    platform.storage.load = async () => { throw new Error('offline'); };
    platform.storage.save = async () => { throw new Error('offline'); };
    const save = store(platform);
    await expect(save.load()).resolves.toEqual({ n: 7 });
    save.markDirty();
    await expect(save.flush()).resolves.toBeUndefined();
  });

  it('handles synchronous adapter failures', async () => {
    platform.storage.load = () => { throw new Error('offline'); };
    platform.storage.save = () => { throw new Error('offline'); };
    const save = store(platform);
    await expect(save.load()).resolves.toEqual({ n: 7 });
    save.markDirty();
    await expect(save.flush()).resolves.toBeUndefined();
  });

  it('still selects a newer cloud save when it arrives promptly', async () => {
    platform.storage.load = async <T>() => envelope(8, 2) as T;
    await expect(store(platform).load()).resolves.toEqual({ n: 8 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a late cloud response after the player resumes locally', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(r => { resolve = r; });
    platform.storage.load = <T>() => pending as Promise<T>;
    const save = store(platform);
    const result = save.load();
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    save.data.n = 9;
    resolve(envelope(88, 99));
    await vi.advanceTimersByTimeAsync(0);
    expect(save.data).toEqual({ n: 9 });
  });

  it('does not access the cloud when the capability is absent', async () => {
    platform.caps.cloudSave = false;
    const read = vi.spyOn(platform.storage, 'load');
    const write = vi.spyOn(platform.storage, 'save');
    const save = store(platform);
    await expect(save.load()).resolves.toEqual({ n: 7 });
    save.markDirty();
    await save.flush();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
