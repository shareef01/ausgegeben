import { describe, expect, it } from 'vitest';
import {
  changedPreferenceFields,
  mergeUnreadEdits,
  prefsSnapshotAction,
} from '@/services/prefsSnapshotPolicy';
import type { SyncedPreferences } from '@/models/types';

const remote: SyncedPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  onboardingComplete: true,
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  monthlyBudget: null,
  updatedAt: 1_000,
};

/**
 * Regression coverage for the onboarding race: a cache-only "document does not exist"
 * must never be treated as the server's answer, because acting on it wrote local
 * defaults (onboardingComplete: false) over a returning user's real preferences.
 */
describe('prefsSnapshotAction', () => {
  it('waits for the server when a cached snapshot reports no document', () => {
    expect(
      prefsSnapshotAction({ exists: false, fromCache: true, remote: null, localUpdatedAt: 0 }),
    ).toBe('await_server');
  });

  it('creates the document only when the server confirms it is missing', () => {
    expect(
      prefsSnapshotAction({ exists: false, fromCache: false, remote: null, localUpdatedAt: 0 }),
    ).toBe('create_remote');
  });

  it('applies a newer remote document', () => {
    expect(
      prefsSnapshotAction({ exists: true, fromCache: false, remote, localUpdatedAt: 999 }),
    ).toBe('apply_remote');
  });

  it('pushes local preferences only when they are newer', () => {
    expect(
      prefsSnapshotAction({ exists: true, fromCache: false, remote, localUpdatedAt: 1_001 }),
    ).toBe('push_local');
  });

  it('holds when clocks are equal', () => {
    expect(
      prefsSnapshotAction({ exists: true, fromCache: false, remote, localUpdatedAt: 1_000 }),
    ).toBe('hold');
  });

  it('marks an existing but unparseable document as unusable, never as missing', () => {
    expect(
      prefsSnapshotAction({ exists: true, fromCache: false, remote: null, localUpdatedAt: 0 }),
    ).toBe('unusable');
    // Even from cache: the document exists, so this must not become "create defaults".
    expect(
      prefsSnapshotAction({ exists: true, fromCache: true, remote: null, localUpdatedAt: 0 }),
    ).toBe('await_server');
  });

  it('previews a newer cached document, so a reload keeps preferences instantly', () => {
    expect(
      prefsSnapshotAction({ exists: true, fromCache: true, remote, localUpdatedAt: 0 }),
    ).toBe('preview_cached');
  });

  it('never pushes or settles on a cached document', () => {
    expect(
      prefsSnapshotAction({ exists: true, fromCache: true, remote, localUpdatedAt: 5_000 }),
    ).toBe('await_server');
  });
});

describe('mergeUnreadEdits', () => {
  const local: SyncedPreferences = {
    ...remote,
    currency: 'EUR',
    locale: 'en',
    themeMode: 'dark',
    monthlyBudget: null,
    onboardingComplete: false,
    updatedAt: 2_000,
  };
  const cloudPrefs: SyncedPreferences = { ...remote, currency: 'CHF', locale: 'de', monthlyBudget: 300 };

  it('lays only the edited fields over the remote document', () => {
    const merged = mergeUnreadEdits({ remote: cloudPrefs, local, edited: new Set(['themeMode']), now: 0 });
    expect(merged).toMatchObject({ currency: 'CHF', locale: 'de', monthlyBudget: 300, themeMode: 'dark' });
  });

  it('keeps onboarding completion one-way', () => {
    const merged = mergeUnreadEdits({
      remote: cloudPrefs,
      local,
      edited: new Set(['onboardingComplete']),
      now: 0,
    });
    expect(merged.onboardingComplete).toBe(true);
  });

  it('stamps the result newer than both inputs', () => {
    const merged = mergeUnreadEdits({ remote: cloudPrefs, local, edited: new Set(), now: 0 });
    expect(merged.updatedAt).toBeGreaterThan(local.updatedAt);
    expect(merged.updatedAt).toBeGreaterThan(cloudPrefs.updatedAt);
  });
});

describe('changedPreferenceFields', () => {
  it('lists only fields that differ', () => {
    expect(changedPreferenceFields({ ...remote, currency: 'USD' }, remote)).toEqual(['currency']);
    expect(changedPreferenceFields(remote, remote)).toEqual([]);
  });
});
