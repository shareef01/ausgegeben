import { prefsLwwAction } from '@/services/prefsLww';
import type { SyncedPreferences } from '@/models/types';

export type PrefsSnapshotAction =
  /** Not authoritative yet — keep listening. */
  | 'await_server'
  /** Server confirms the document is absent: create it from local preferences. */
  | 'create_remote'
  /** Remote is newer: adopt it. */
  | 'apply_remote'
  /** Local is newer: push it. */
  | 'push_local'
  /** Nothing to do. */
  | 'hold'
  /** The document exists but cannot be understood (legacy/corrupt). */
  | 'unusable'
  /**
   * A cached copy newer than local: show it for theme/locale while waiting, but it is
   * not the server's answer — nothing is written or settled on it.
   */
  | 'preview_cached';

/**
 * What to do with one preferences snapshot.
 *
 * The race this exists for: Firestore delivers a cached snapshot before the server
 * answers. A cache that has never seen the document reports `exists === false`, which
 * the sync loop used to treat as "no preferences yet" — it immediately wrote local
 * *defaults* (`onboardingComplete: false`, default currency/locale/budget) and marked
 * preferences ready. That both re-entered onboarding for returning accounts and risked
 * clobbering real cloud preferences with defaults. A missing document is only proof
 * once it comes from the server (`fromCache === false`).
 *
 * A document that exists but cannot be parsed (legacy/incomplete) is not a licence to
 * overwrite either: `unusable` is treated as an authoritative "preferences exist", so
 * the gate neither re-onboards that account nor sits in the recovery screen forever.
 *
 * The same holds for a cached document that *does* exist: it can be arbitrarily stale,
 * so settling the gate or running last-write-wins against it would decide onboarding
 * and push local values based on old data. It is only previewed.
 */
export function prefsSnapshotAction(params: {
  exists: boolean;
  fromCache: boolean;
  remote: SyncedPreferences | null;
  localUpdatedAt: number;
}): PrefsSnapshotAction {
  const { exists, fromCache, remote, localUpdatedAt } = params;
  if (!exists) return fromCache ? 'await_server' : 'create_remote';
  if (fromCache) {
    return remote && remote.updatedAt > localUpdatedAt ? 'preview_cached' : 'await_server';
  }
  if (!remote) return 'unusable';
  return prefsLwwAction(remote.updatedAt, localUpdatedAt);
}

/** Synced fields a user can change; `updatedAt` is bookkeeping, not a setting. */
export type SyncedPreferenceField = Exclude<keyof SyncedPreferences, 'updatedAt'>;

export const SYNCED_PREFERENCE_FIELDS: readonly SyncedPreferenceField[] = [
  'currency',
  'locale',
  'themeMode',
  'onboardingComplete',
  'dailyReminder',
  'reminderHour',
  'reminderMinute',
  'analyticsPeriod',
  'monthlyBudget',
];

/** Which synced fields differ between two preference states. */
export function changedPreferenceFields(
  next: Pick<SyncedPreferences, SyncedPreferenceField>,
  prev: Pick<SyncedPreferences, SyncedPreferenceField>,
): SyncedPreferenceField[] {
  return SYNCED_PREFERENCE_FIELDS.filter((field) => next[field] !== prev[field]);
}

/**
 * Combine the first server read with settings the user changed before it arrived.
 *
 * Last-write-wins is wrong for that first read: local holds defaults for everything
 * the user did *not* touch, but carries a fresh timestamp, so "local is newer" would
 * push those defaults over the real cloud preferences. Instead the remote document is
 * the base and only the fields actually edited on this device are laid over it.
 * Onboarding completion stays one-way, matching applySyncedPreferences.
 *
 * The result is stamped newer than both inputs so it wins the next comparison and is
 * written back.
 */
export function mergeUnreadEdits(params: {
  remote: SyncedPreferences;
  local: SyncedPreferences;
  edited: ReadonlySet<SyncedPreferenceField>;
  now: number;
}): SyncedPreferences {
  const { remote, local, edited, now } = params;
  const merged: SyncedPreferences = { ...remote };
  for (const field of edited) {
    (merged as Record<SyncedPreferenceField, unknown>)[field] = local[field];
  }
  merged.onboardingComplete = remote.onboardingComplete || local.onboardingComplete;
  merged.updatedAt = Math.max(now, remote.updatedAt + 1, local.updatedAt + 1);
  return merged;
}
