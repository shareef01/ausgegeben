import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readErrorReportingEnabled, writeErrorReportingEnabled } from '@/services/errorReportPreference';

describe('error reporting preference', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });

  it('is off until the user turns it on', () => {
    expect(readErrorReportingEnabled()).toBe(false);
    writeErrorReportingEnabled(true);
    expect(readErrorReportingEnabled()).toBe(true);
    writeErrorReportingEnabled(false);
    expect(readErrorReportingEnabled()).toBe(false);
  });

  it('stays off when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(readErrorReportingEnabled()).toBe(false);
  });
});
