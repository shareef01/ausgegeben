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

  // Rules reject an unknown themeMode/locale outright, and the failure arrives as a
  // bare permission-denied — so the outbound path has to clamp them, not just the
  // inbound one, or a bad local value wedges preference sync with no clue why.
  it('replaces an unsupported themeMode', () => {
    const next = sanitizeSyncedPreferences({
      ...base,
      themeMode: 'not-a-theme' as SyncedPreferences['themeMode'],
    });
    expect(next.themeMode).toBe('system');
  });

  it('replaces an unsupported locale', () => {
    const next = sanitizeSyncedPreferences({
      ...base,
      locale: 'fr' as SyncedPreferences['locale'],
    });
    expect(next.locale).toBe('en');
  });

  it('leaves supported themeMode and locale untouched', () => {
    const next = sanitizeSyncedPreferences({ ...base, themeMode: 'amoled', locale: 'de' });
    expect(next.themeMode).toBe('amoled');
    expect(next.locale).toBe('de');
  });
});
