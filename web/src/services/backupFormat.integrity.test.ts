import { describe, expect, it } from 'vitest';
import {
  createBackup,
  PREFERENCES_RESTORE_LEAD_MS,
  restoredCategoryRevision,
  restoredPreferencesRevision,
  validateBackup,
  writablePreferencesRevision,
  type AusgegebenBackup,
} from './backupFormat';
import type { Category, Expense } from '@/models/types';

// Regression coverage for the 2026-10-18 audit: references, currency and optional
// preference fields must be rejected before a restore performs any write.

const categories: Category[] = [
  { id: 'cat-food', name: 'Food', iconName: 'utensils', colorInt: 1, transactionType: 'expense', sortOrder: 0 },
  { id: 'cat-pay', name: 'Pay', iconName: 'briefcase', colorInt: 2, transactionType: 'income', sortOrder: 1 },
];
const expenses: Expense[] = [
  { id: 'e1', amount: 12.5, dateMillis: 1_700_000_000_000, categoryId: 'cat-food', note: '', transactionType: 'expense' },
];

function backup(schemaVersion = 3): AusgegebenBackup {
  return JSON.parse(JSON.stringify(createBackup({
    preferences: { currency: 'EUR', monthlyBudget: null, locale: 'en', themeMode: 'system' },
    categories,
    expenses,
    appVersion: '2.1.3',
    schemaVersion,
  })));
}

function errorsOf(value: unknown): string[] {
  const result = validateBackup(value);
  return result.valid ? [] : result.errors;
}

describe('backup referential integrity', () => {
  it.each([1, 2, 3])('rejects an expense whose category is missing when the backup has no categories (v%i)', (v) => {
    const b = backup(v);
    b.categories = [];
    expect(errorsOf(b)).toContain('Expense at index 0 references nonexistent categoryId "cat-food"');
  });

  it('rejects an Uncategorized ("0") reference unless the sentinel category is in the backup', () => {
    const b = backup();
    b.expenses[0].categoryId = '0';
    expect(errorsOf(b)).toContain('Expense at index 0 references nonexistent categoryId "0"');
  });

  it('accepts an Uncategorized ("0") reference of any transaction type when the sentinel is present', () => {
    const b = backup();
    b.categories.push({ id: '0', name: 'Uncategorized', iconName: 'help-circle', colorInt: 0, transactionType: 'expense', sortOrder: 99 });
    b.expenses.push({ id: 'e2', amount: 3, dateMillis: 1_700_000_000_000, categoryId: '0', note: '', transactionType: 'income' });
    b.expenses[0].categoryId = '0';
    expect(validateBackup(b).valid).toBe(true);
  });

  it('still accepts a backup with no categories and no expenses', () => {
    const b = backup(1);
    b.categories = [];
    b.expenses = [];
    expect(validateBackup(b).valid).toBe(true);
  });
});

describe('backup preference validation', () => {
  it.each(['JPY', 'eur', 'XYZ'])('rejects unsupported currency %s instead of silently restoring EUR', (currency) => {
    const b = backup();
    b.preferences.currency = currency;
    expect(errorsOf(b).some((e) => e.startsWith('preferences.currency'))).toBe(true);
  });

  it.each(['EUR', 'USD', 'GBP', 'CHF'])('accepts supported currency %s', (currency) => {
    const b = backup();
    b.preferences.currency = currency;
    expect(validateBackup(b).valid).toBe(true);
  });

  it('accepts legacy v1 preferences that omit every optional field', () => {
    const b = backup(1) as unknown as { preferences: Record<string, unknown> };
    b.preferences = { currency: 'GBP', monthlyBudget: 250 };
    expect(validateBackup(b).valid).toBe(true);
  });

  it.each([
    ['locale', 'fr'],
    ['locale', 7],
    ['themeMode', 3],
    ['preferencesUpdatedAt', '1700000000000'],
    ['preferencesUpdatedAt', -1],
    ['preferencesUpdatedAt', 1.5],
    ['dailyReminder', 'yes'],
    ['reminderHour', 24],
    ['reminderMinute', 60],
    ['analyticsPeriod', 42],
  ])('rejects preferences.%s = %j', (key, value) => {
    const b = backup() as unknown as { preferences: Record<string, unknown> };
    b.preferences[key] = value;
    expect(errorsOf(b).some((e) => e.startsWith(`preferences.${key}`))).toBe(true);
  });

  it('rejects a sub-cent monthly budget', () => {
    const b = backup();
    b.preferences.monthlyBudget = 10.005;
    expect(errorsOf(b).some((e) => e.startsWith('preferences.monthlyBudget'))).toBe(true);
  });
});

describe('backup category metadata validation', () => {
  it.each([['1700000000000'], [-5], [1.5], [Number.MAX_VALUE]])('rejects category updatedAt %j', (updatedAt) => {
    const b = backup() as unknown as { categories: Record<string, unknown>[] };
    b.categories[0].updatedAt = updatedAt;
    expect(errorsOf(b)).toContain('Category at index 0 updatedAt must be a non-negative integer timestamp');
  });

  it('accepts the zero category updatedAt older exports carry', () => {
    const b = backup() as unknown as { categories: Record<string, unknown>[] };
    b.categories[0].updatedAt = 0;
    expect(validateBackup(b).valid).toBe(true);
  });

});

describe('restore revision stamps stay inside the rules\' clock window', () => {
  const now = 1_800_000_000_000;

  it('prefers a revision newer than the file, capped four minutes ahead of now', () => {
    expect(restoredPreferencesRevision(undefined, now)).toBe(now);
    expect(restoredPreferencesRevision(now - 10, now)).toBe(now);
    expect(restoredPreferencesRevision(now + 60_000, now)).toBe(now + 60_001);
    // A corrupt far-future value used to make the final preferences write fail after
    // every category and transaction had been written.
    expect(restoredPreferencesRevision(9_000_000_000_000_000, now)).toBe(now + 240_000);
  });

  it('never stamps a category later than now', () => {
    expect(restoredCategoryRevision(undefined, now)).toBe(now);
    expect(restoredCategoryRevision(now - 5, now)).toBe(now - 5);
    expect(restoredCategoryRevision(now + 3_600_000, now)).toBe(now);
  });

  // AUD-005: the stored document, not just the file, bounds what may be written.
  it('beats the stored revision when the stored document is ahead of the clock', () => {
    // Rules allow a stored updatedAt up to now+300000 (any device with a fast clock).
    expect(writablePreferencesRevision(undefined, now + 100_000, now)).toBe(now + 100_001);
    expect(writablePreferencesRevision(now - 5, now + 100_000, now)).toBe(now + 100_001);
  });

  it('keeps the ordinary case unchanged', () => {
    expect(writablePreferencesRevision(undefined, null, now)).toBe(now);
    expect(writablePreferencesRevision(undefined, now - 60_000, now)).toBe(now);
    expect(writablePreferencesRevision(now - 10, undefined, now)).toBe(now);
  });

  it('clamps a corrupt far-future file revision but still beats the stored one', () => {
    expect(writablePreferencesRevision(9_000_000_000_000_000, now - 1_000, now)).toBe(now + PREFERENCES_RESTORE_LEAD_MS);
  });

  it('returns null when no legal revision exists yet', () => {
    // Stored inside the last minute of the rules' window: nothing can beat it and stay
    // inside the bound, so the caller must refuse before its first write.
    expect(writablePreferencesRevision(undefined, now + PREFERENCES_RESTORE_LEAD_MS, now)).toBeNull();
    expect(writablePreferencesRevision(undefined, now + 299_000, now)).toBeNull();
    // One millisecond short of the cap is still writable.
    expect(writablePreferencesRevision(undefined, now + PREFERENCES_RESTORE_LEAD_MS - 1, now)).toBe(
      now + PREFERENCES_RESTORE_LEAD_MS,
    );
  });

  it('exports drop a category revision the validator would refuse', () => {
    const b = createBackup({
      preferences: { currency: 'EUR', monthlyBudget: null },
      categories: [{ ...categories[0], updatedAt: 12.5 }, categories[1]],
      expenses,
      appVersion: '2.1.3',
    });
    expect(b.categories[0]).not.toHaveProperty('updatedAt');
    expect(validateBackup(JSON.parse(JSON.stringify(b))).valid).toBe(true);
  });
});
