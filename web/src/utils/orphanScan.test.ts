import { describe, expect, it } from 'vitest';
import { needsOrphanSweep, ORPHANS_SCAN_VERSION } from './orphanScan';

describe('needsOrphanSweep', () => {
  it('runs when there is no marker', () => {
    expect(needsOrphanSweep(undefined)).toBe(true);
    expect(needsOrphanSweep(null)).toBe(true);
    expect(needsOrphanSweep({})).toBe(true);
  });

  it('runs once more on a pre-versioned orphansScannedAt marker', () => {
    expect(needsOrphanSweep({ orphansScannedAt: Date.now() })).toBe(true);
  });

  it('skips when the recorded version is current', () => {
    expect(
      needsOrphanSweep({
        orphansScannedAt: Date.now(),
        orphansScanVersion: ORPHANS_SCAN_VERSION,
      }),
    ).toBe(false);
  });

  it('runs when the recorded version is older than the client', () => {
    expect(
      needsOrphanSweep({
        orphansScannedAt: Date.now(),
        orphansScanVersion: ORPHANS_SCAN_VERSION - 1,
      }),
    ).toBe(true);
  });
});
