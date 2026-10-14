import { expect, it } from 'vitest';
import { selectOkMode } from '../src/ok-mode';
import worker from '../src/index';

const ready = { mode: 'live' as const, liveEnabled: '1', testListVerified: '1', testUids: '11,22' };
it('a separate OK Worker refuses VK routes', async () => {
  for (const path of ['/', '/vk/restore']) {
    expect((await worker.fetch(new Request('https://w' + path),
      { VK_APP_SECRET: 'test', OK_ONLY: '1' })).status).toBe(404);
  }
});
it('keeps the isolated test deployment entirely test', () => {
  expect(selectOkMode('33', { mode: 'test' })).toEqual({ mode: 'test', by: 'test-deploy' });
});
it('separates testers and real purchasers only with explicit release gates', () => {
  expect(selectOkMode('11', ready)).toEqual({ mode: 'test', by: 'uid-list' });
  expect(selectOkMode('33', ready)).toEqual({ mode: 'live', by: 'uid-list' });
});
it('fails closed for absent, malformed or unreconciled configuration', () => {
  for (const config of [{ ...ready, liveEnabled: '0' }, { ...ready, testListVerified: '0' },
    { ...ready, testUids: undefined }, { ...ready, testUids: '' }, { ...ready, testUids: '11,' },
    { ...ready, testUids: '11,11' }, { ...ready, testUids: '1e2' }]) {
    expect(selectOkMode('33', config)).toBeNull();
  }
  expect(selectOkMode('invalid', ready)).toBeNull();
});
