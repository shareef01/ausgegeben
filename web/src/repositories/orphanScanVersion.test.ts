import { describe, expect, it } from 'vitest';
import { needsOrphanScan, ORPHAN_SCAN_VERSION } from '@/repositories/expenseRepository';

/**
 * Regression cover for AUS-106.
 *
 * The sweep used to be gated on the mere *presence* of `orphansScannedAt`. That is what
 * made a shipped orphan repair permanently unrunnable once: the marker was already set on
 * every account that had ever cold-started, so the fix could never fire on the long-lived
 * accounts it was written for. Gating on a version makes a future sweep re-runnable by
 * bumping one number.
 */
describe('needsOrphanScan', () => {
  it('runs on an account with no marker at all', () => {
    expect(needsOrphanScan(undefined)).toBe(true);
  });

  it('runs on a pre-versioning marker, however old the scan timestamp is', () => {
    expect(needsOrphanScan({ orphansScannedAt: 1_600_000_000_000 })).toBe(true);
    expect(needsOrphanScan({ categoriesDeduped: true, ranAt: 1 })).toBe(true);
  });

  it('skips an account already swept by the current generation', () => {
    expect(
      needsOrphanScan({ orphansScannedAt: 1, orphanScanVersion: ORPHAN_SCAN_VERSION }),
    ).toBe(false);
  });

  it('re-runs when the version is bumped past what the account recorded', () => {
    expect(
      needsOrphanScan({ orphansScannedAt: 1, orphanScanVersion: ORPHAN_SCAN_VERSION - 1 }),
    ).toBe(true);
  });

  it('does not re-run for a marker from a newer build than this one', () => {
    expect(
      needsOrphanScan({ orphansScannedAt: 1, orphanScanVersion: ORPHAN_SCAN_VERSION + 1 }),
    ).toBe(false);
  });

  it('treats a non-numeric version as unversioned rather than trusting it', () => {
    expect(needsOrphanScan({ orphanScanVersion: 'v1' })).toBe(true);
    expect(needsOrphanScan({ orphanScanVersion: null })).toBe(true);
  });
});
