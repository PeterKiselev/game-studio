import type { Mode } from './ledger';

export interface OkModeConfig {
  mode?: Mode;
  liveEnabled?: string;
  testListVerified?: string;
  testUids?: string;
}

/** The UID list is a manually reconciled copy, not a platform-supplied test flag. */
export function selectOkMode(uid: string, config: OkModeConfig):
  { mode: Mode; by: 'test-deploy' | 'uid-list' } | null {
  if (!/^\d+$/.test(uid)) return null;
  if (config.mode === 'test') return { mode: 'test', by: 'test-deploy' };
  if (config.mode !== 'live' || config.liveEnabled !== '1' || config.testListVerified !== '1' ||
    typeof config.testUids !== 'string' || !config.testUids.trim()) return null;
  const ids = config.testUids.split(',').map(id => id.trim());
  if (ids.some(id => !/^[1-9]\d*$/.test(id)) || new Set(ids).size !== ids.length) return null;
  return { mode: ids.includes(uid) ? 'test' : 'live', by: 'uid-list' };
}
