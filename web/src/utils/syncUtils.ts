export const SYNC_OVERLAP_MS = 30_000;
export const FULL_PULL_STALE_MS = 24 * 60 * 60 * 1000;

export interface SyncPullMode {
  since: number;
  isIncremental: boolean;
  effectiveFullPull: boolean;
}

/** Resolve whether a sync should full-pull or use an incremental delta. */
export function resolveSyncPullMode(
  fullPull: boolean,
  lastSyncAt: number | null | undefined,
  now = Date.now(),
): SyncPullMode {
  const last = lastSyncAt ?? 0;
  const stale = last > 0 && now - last > FULL_PULL_STALE_MS;
  const effectiveFullPull = fullPull || last === 0 || stale;
  const isIncremental = !effectiveFullPull && last > 0;
  const since = isIncremental ? Math.max(0, last - SYNC_OVERLAP_MS) : 0;
  return { since, isIncremental, effectiveFullPull };
}
