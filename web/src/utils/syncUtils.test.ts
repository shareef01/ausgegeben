import { describe, expect, it } from 'vitest';
import { FULL_PULL_STALE_MS, SYNC_OVERLAP_MS, resolveSyncPullMode } from '@/utils/syncUtils';

describe('resolveSyncPullMode', () => {
  const now = 1_700_000_000_000;

  it('full-pulls on first sync', () => {
    expect(resolveSyncPullMode(false, null, now)).toEqual({
      since: 0,
      isIncremental: false,
      effectiveFullPull: true,
    });
  });

  it('full-pulls when forced', () => {
    expect(resolveSyncPullMode(true, now - 60_000, now)).toEqual({
      since: 0,
      isIncremental: false,
      effectiveFullPull: true,
    });
  });

  it('incremental pull with overlap after recent sync', () => {
    const lastSyncAt = now - 5 * 60_000;
    expect(resolveSyncPullMode(false, lastSyncAt, now)).toEqual({
      since: lastSyncAt - SYNC_OVERLAP_MS,
      isIncremental: true,
      effectiveFullPull: false,
    });
  });

  it('full-pulls when last sync is stale', () => {
    const lastSyncAt = now - FULL_PULL_STALE_MS - 1;
    expect(resolveSyncPullMode(false, lastSyncAt, now)).toEqual({
      since: 0,
      isIncremental: false,
      effectiveFullPull: true,
    });
  });
});
