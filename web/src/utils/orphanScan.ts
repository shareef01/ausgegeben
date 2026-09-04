/**
 * Version of the orphan-expense sweep. Bump when repair logic changes so
 * accounts that already have `orphansScannedAt` still run the new pass once.
 *
 * Missing version + existing `orphansScannedAt` is treated as version 0
 * (the unversioned scan that shipped first).
 */
export const ORPHANS_SCAN_VERSION = 1;

export function needsOrphanSweep(
  marker: Record<string, unknown> | undefined | null,
): boolean {
  if (!marker) return true;
  const raw = marker.orphansScanVersion;
  const recorded =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : typeof marker.orphansScannedAt === 'number'
        ? 0
        : -1;
  return recorded < ORPHANS_SCAN_VERSION;
}
