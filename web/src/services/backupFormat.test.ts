import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_IDENTIFIER,
  CURRENT_BACKUP_SCHEMA_VERSION,
  createBackup,
  validateBackup,
} from './backupFormat';
import type { Category, Expense } from '@/models/types';

describe('Local backup serializer & strict validator', () => {
  const sampleCategories: Category[] = [
    {
      id: 'cat-groceries',
      name: 'Groceries',
      iconName: 'shopping-cart',
      colorInt: 0xff0000,
      transactionType: 'expense',
      sortOrder: 1,
      updatedAt: 1700000000000,
    },
    {
      id: 'cat-salary',
      name: 'Salary',
      iconName: 'briefcase',
      colorInt: 0x00ff00,
      transactionType: 'income',
      sortOrder: 2,
    },
  ];

  const sampleExpenses: Expense[] = [
    {
      id: 'exp-1',
      amount: 42.5,
      dateMillis: 1700000000000,
      categoryId: 'cat-groceries',
      note: 'Supermarket',
      transactionType: 'expense',
      updatedAt: 1700000000000,
    },
    {
      id: 'exp-2',
      amount: 2500.0,
      dateMillis: 1700000001000,
      categoryId: 'cat-salary',
      note: 'Monthly salary',
      transactionType: 'income',
    },
  ];

  it('creates and validates a standard backup correctly', () => {
    const backup = createBackup({
      preferences: {
        currency: 'EUR',
        monthlyBudget: 1500,
        locale: 'en',
        themeMode: 'dark',
      },
      categories: sampleCategories,
      expenses: sampleExpenses,
      appVersion: '2.0.6',
    });

    expect(backup.format).toBe(BACKUP_FORMAT_IDENTIFIER);
    expect(backup.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(backup.categories.length).toBe(2);
    expect(backup.expenses.length).toBe(2);

    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
  });

  it('rejects unknown or dangerous top-level keys', () => {
    const backup = createBackup({
      preferences: { currency: 'EUR', monthlyBudget: 100 },
      categories: sampleCategories,
      expenses: sampleExpenses,
      appVersion: '2.0.6',
    }) as any;

    backup.maliciousScript = '<script>alert(1)</script>';
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('Unknown or prohibited top-level property'))).toBe(true);
    }
  });

  it('rejects sub-cent amounts (more than 2 decimal places)', () => {
    const backup = createBackup({
      preferences: { currency: 'EUR', monthlyBudget: 100 },
      categories: sampleCategories,
      expenses: sampleExpenses,
      appVersion: '2.0.6',
    }) as any;

    backup.expenses[0].amount = 12.345;
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('sub-cent precision'))).toBe(true);
    }
  });

  it('rejects negative amounts', () => {
    const backup = createBackup({
      preferences: { currency: 'EUR', monthlyBudget: 100 },
      categories: sampleCategories,
      expenses: sampleExpenses,
      appVersion: '2.0.6',
    }) as any;

    backup.expenses[0].amount = -50;
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('invalid amount'))).toBe(true);
    }
  });

  it('rejects duplicate category IDs and duplicate expense IDs', () => {
    const backup = createBackup({
      preferences: { currency: 'EUR', monthlyBudget: 100 },
      categories: [
        ...sampleCategories,
        { ...sampleCategories[0], name: 'Duplicate cat' },
      ],
      expenses: [
        ...sampleExpenses,
        { ...sampleExpenses[0], note: 'Duplicate expense' },
      ],
      appVersion: '2.0.6',
    });

    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('Duplicate category id'))).toBe(true);
      expect(result.errors.some((e) => e.includes('Duplicate expense id'))).toBe(true);
    }
  });

  it('rejects expenses that reference missing category IDs', () => {
    const backup = createBackup({
      preferences: { currency: 'EUR', monthlyBudget: 100 },
      categories: sampleCategories,
      expenses: sampleExpenses,
      appVersion: '2.0.6',
    }) as any;

    backup.expenses[0].categoryId = 'nonexistent-cat-uuid';
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('references nonexistent categoryId'))).toBe(true);
    }
  });
});
