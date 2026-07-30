import { describe, expect, it } from 'vitest';
import { sanitizeSyncedPreferences } from '@/services/preferencesSync';
import type { SyncedPreferences } from '@/models/types';

const base: SyncedPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  onboardingComplete: true,
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  monthlyBudget: null,
  updatedAt: Date.UTC(2026, 6, 1),
};

describe('sanitizeSyncedPreferences', () => {
  it('replaces unsupported currency', () => {
    expect(sanitizeSyncedPreferences({ ...base, currency: 'XXXX' }).currency).toBe('EUR');
  });

  it('keeps valid month keys and maps legacy this_month', () => {
    expect(
      sanitizeSyncedPreferences({ ...base, analyticsPeriod: 'month:2026-07' }).analyticsPeriod,
    ).toBe('month:2026-07');
    expect(
      sanitizeSyncedPreferences({ ...base, analyticsPeriod: 'this_month' }).analyticsPeriod,
    ).toMatch(/^month:\d{4}-\d{2}$|^this_month$/);
  });

  it('falls back invalid analyticsPeriod', () => {
    expect(
      sanitizeSyncedPreferences({ ...base, analyticsPeriod: 'not-a-period' }).analyticsPeriod,
    ).toBe('this_month');
  });

  it('stamps updatedAt when missing', () => {
    const before = Date.now();
    const next = sanitizeSyncedPreferences({ ...base, updatedAt: 0 });
    expect(next.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
