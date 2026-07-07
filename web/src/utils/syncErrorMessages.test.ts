import { describe, expect, it } from 'vitest';
import { mapSyncError } from '@/utils/syncErrorMessages';

describe('mapSyncError', () => {
  it('maps permission-denied', () => {
    expect(mapSyncError({ code: 'permission-denied' })).toContain('cloud sync');
  });

  it('maps network errors', () => {
    expect(mapSyncError({ code: 'unavailable' })).toContain('internet');
    expect(mapSyncError({ code: 'network-request-failed' })).toContain('internet');
  });

  it('falls back to generic message', () => {
    expect(mapSyncError(new Error('boom'))).toBe('boom');
    expect(mapSyncError(null)).toContain('sync');
  });
});
