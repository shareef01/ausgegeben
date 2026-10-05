import { describe, expect, it } from 'vitest';
import {
  computeBackupFingerprint,
  planReplace,
} from './backupReplace';
import type { Category, Expense, SyncedPreferences } from '@/models/types';
import type { AusgegebenBackup } from './backupFormat';

const sampleCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'Groceries',
    iconName: 'shopping_cart',
    colorInt: -16776961,
    transactionType: 'expense',
    sortOrder: 0,
    updatedAt: 1000,
  },
  {
    id: 'cat-2',
    name: 'Salary',
    iconName: 'attach_money',
    colorInt: -16711936,
    transactionType: 'income',
    sortOrder: 1,
    updatedAt: 1000,
  },
  {
    id: 'cat-3',
    name: 'Old Category',
    iconName: 'star',
    colorInt: -65536,
    transactionType: 'expense',
    sortOrder: 2,
    updatedAt: 1000,
  },
];

const sampleExpenses: Expense[] = [
  {
    id: 'exp-1',
    amount: 15.5,
    dateMillis: 1700000000000,
    categoryId: 'cat-1',
    note: 'Supermarket',
    transactionType: 'expense',
    updatedAt: 1000,
  },
  {
    id: 'exp-2',
    amount: 2500,
    dateMillis: 1700000000000,
    categoryId: 'cat-2',
    note: 'Monthly salary',
    transactionType: 'income',
    updatedAt: 1000,
  },
  {
    id: 'exp-3',
    amount: 5.0,
    dateMillis: 1700000000000,
    categoryId: 'cat-3',
    note: 'Coffee',
    transactionType: 'expense',
    updatedAt: 1000,
  },
];

const samplePreferences: SyncedPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  onboardingComplete: true,
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  updatedAt: 1000,
  monthlyBudget: 1500,
};

const sampleBackup: AusgegebenBackup = {
  format: 'ausgegeben-backup',
  schemaVersion: 1,
  exportedAt: '2026-10-01T12:00:00Z',
  appVersion: '2.0.8',
  preferences: {
    currency: 'USD',
    monthlyBudget: 2000,
    locale: 'de',
    themeMode: 'dark',
    preferencesUpdatedAt: 500,
  },
  categories: [
    {
      id: 'cat-1',
      name: 'Supermarket',
      iconName: 'cart',
      colorInt: -16776961,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 2000,
    },
    {
      id: 'cat-4',
      name: 'Freelance',
      iconName: 'work',
      colorInt: -256,
      transactionType: 'income',
      sortOrder: 1,
      updatedAt: 2000,
    },
  ],
  expenses: [
    {
      id: 'exp-1',
      amount: 19.99,
      dateMillis: 1710000000000,
      categoryId: 'cat-1',
      note: 'Updated grocery',
      transactionType: 'expense',
      updatedAt: 2000,
    },
    {
      id: 'exp-4',
      amount: 500,
      dateMillis: 1710000000000,
      categoryId: 'cat-4',
      note: 'Consulting',
      transactionType: 'income',
      updatedAt: 2000,
    },
  ],
};

describe('backupReplace planner and fingerprinting', () => {
  it('computes deterministic SHA-256 fingerprint regardless of array item order', async () => {
    const fp1 = await computeBackupFingerprint(sampleBackup);
    expect(fp1).toHaveLength(64);

    const reorderedBackup: AusgegebenBackup = {
      ...sampleBackup,
      expenses: [...sampleBackup.expenses].reverse(),
      categories: [...sampleBackup.categories].reverse(),
    };
    const fp2 = await computeBackupFingerprint(reorderedBackup);
    expect(fp2).toBe(fp1);

    const modifiedBackup: AusgegebenBackup = {
      ...sampleBackup,
      expenses: [
        {
          ...sampleBackup.expenses[0],
          amount: 20.0,
        },
        sampleBackup.expenses[1],
      ],
    };
    const fp3 = await computeBackupFingerprint(modifiedBackup);
    expect(fp3).not.toBe(fp1);
  });

  it('correctly plans upserts, stale deletions, and category preservations', () => {
    const plan = planReplace({
      currentExpenses: sampleExpenses,
      currentCategories: sampleCategories,
      currentPreferences: samplePreferences,
      backup: sampleBackup,
    });

    expect(plan.conflicts).toHaveLength(0);

    // Expenses in backup: exp-1 (matching), exp-4 (new)
    expect(plan.expensesToUpsert).toHaveLength(2);
    expect(plan.expensesToUpsert.map((e) => e.id)).toEqual(['exp-1', 'exp-4']);

    // Expenses to delete: exp-2, exp-3 (in current, absent from backup)
    expect(plan.expenseIdsToDelete).toEqual(['exp-2', 'exp-3']);

    // Categories to upsert: cat-1 (matching), cat-4 (new)
    expect(plan.categoriesToUpsert).toHaveLength(2);
    expect(plan.categoriesToUpsert.map((c) => c.id)).toEqual(['cat-1', 'cat-4']);

    // Categories preserved: cat-2, cat-3 (in current, absent from backup)
    expect(plan.categoryIdsToPreserve).toEqual(['cat-2', 'cat-3']);

    // Preferences updated with backup values
    expect(plan.preferencesToUpdate.currency).toBe('USD');
    expect(plan.preferencesToUpdate.monthlyBudget).toBe(2000);
    expect(plan.preferencesToUpdate.locale).toBe('de');
    expect(plan.preferencesToUpdate.themeMode).toBe('dark');
    expect(plan.preferencesToUpdate.updatedAt).toBeGreaterThan(samplePreferences.updatedAt);

    // Counts match
    expect(plan.counts).toEqual({
      backupExpenseCount: 2,
      backupCategoryCount: 2,
      expensesToUpsertCount: 2,
      expensesToDeleteCount: 2,
      categoriesToUpsertCount: 2,
      categoriesPreservedCount: 2,
    });
  });

  it('detects category type conflict and returns non-empty conflicts', () => {
    const conflictingBackup: AusgegebenBackup = {
      ...sampleBackup,
      categories: [
        {
          id: 'cat-1',
          name: 'Groceries as Income',
          iconName: 'attach_money',
          colorInt: -16711936,
          transactionType: 'income', // cat-1 in sampleCategories is 'expense'
          sortOrder: 0,
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          amount: 50,
          dateMillis: 1710000000000,
          categoryId: 'cat-1',
          note: 'Refund',
          transactionType: 'income',
        },
      ],
    };

    const plan = planReplace({
      currentExpenses: sampleExpenses,
      currentCategories: sampleCategories,
      currentPreferences: samplePreferences,
      backup: conflictingBackup,
    });

    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(plan.conflicts[0]).toContain('CATEGORY_TYPE_CONFLICT');
  });

  it('detects orphan category references in backup', () => {
    const orphanBackup: AusgegebenBackup = {
      ...sampleBackup,
      categories: [], // no categories
      expenses: [
        {
          id: 'exp-orphan',
          amount: 10,
          dateMillis: 1710000000000,
          categoryId: 'non-existent-cat',
          note: 'Orphan',
          transactionType: 'expense',
        },
      ],
    };

    const plan = planReplace({
      currentExpenses: sampleExpenses,
      currentCategories: sampleCategories,
      currentPreferences: samplePreferences,
      backup: orphanBackup,
    });

    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(plan.conflicts[0]).toContain('CATEGORY_ORPHAN_REFERENCE');
  });

  it('rejects unsupported schema versions', () => {
    const invalidSchemaBackup: AusgegebenBackup = {
      ...sampleBackup,
      schemaVersion: 3,
    };

    const plan = planReplace({
      currentExpenses: sampleExpenses,
      currentCategories: sampleCategories,
      currentPreferences: samplePreferences,
      backup: invalidSchemaBackup,
    });

    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(plan.conflicts[0]).toContain('UNSUPPORTED_SCHEMA_VERSION');
  });
});

it('v2 budget fingerprint distinguishes delimiter-bearing identities from several budgets', async () => {
  const b={categoryId:'a',monthlyLimit:100,warningThresholdPercent:80,updatedAt:1};
  const base={...sampleBackup,schemaVersion:2,categories:['a','b','a,100,80;b'].map(id=>({...sampleBackup.categories[0],id,transactionType:'expense' as const}))};
  const two={...base,categoryBudgets:[b,{...b,categoryId:'b',monthlyLimit:200}]};
  const one={...base,categoryBudgets:[{...b,categoryId:'a,100,80;b',monthlyLimit:200}]};
  expect(await computeBackupFingerprint(one)).not.toBe(await computeBackupFingerprint(two));
});
