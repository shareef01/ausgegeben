import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { budgetAllocation, categoryBudgetProgress, validCategoryBudget } from './categoryBudgets';
import { createBackup, validateBackup } from './backupFormat';
import type { Category, Expense } from '@/models/types';

const category: Category = { id: 'food', name: 'Food', iconName: 'restaurant', colorInt: 0, transactionType: 'expense', sortOrder: 0 };
const budget = { categoryId: 'food', monthlyLimit: 100, warningThresholdPercent: 80, updatedAt: 1 };
describe('category budgets', () => {
  it.each([[0, 'normal'], [79.99, 'normal'], [80, 'warning'], [99.99, 'warning'], [100, 'reached'], [100.01, 'over']])('uses exact boundaries at %s', (spent, state) => {
    const expense: Expense = { id: 'x', amount: spent as number, categoryId: 'food', dateMillis: 1, note: '', transactionType: 'expense' };
    const [result] = categoryBudgetProgress([budget], [category], [expense]);
    expect(result.state).toBe(state);
    expect(result.remaining).toBe(Math.max(0, Math.round((100 - (spent as number)) * 100)) / 100);
    expect(result.overspent).toBe(Math.max(0, Math.round(((spent as number) - 100) * 100)) / 100);
  });
  it('excludes unbudgeted, deleted, income, transfer and missing categories', () => {
    expect(categoryBudgetProgress([], [category], [])).toEqual([]);
    expect(categoryBudgetProgress([budget], [], [])).toEqual([]);
    const expense = { id: 'x', amount: 25, categoryId: 'food', dateMillis: 1, note: '', transactionType: 'income' as const };
    expect(categoryBudgetProgress([budget], [category], [expense, { ...expense, transactionType: 'transfer' }, { ...expense, transactionType: 'expense', deleted: true }])[0].spent).toBe(0);
    expect(categoryBudgetProgress([budget], [{ ...category, migrationState: 'migrating', pendingTransactionType: 'income' }], [])).toEqual([]);
  });
  it.each([0, -1, 12.345, NaN, Infinity, 1e9])('rejects invalid amount %s', amount => expect(validCategoryBudget({ ...budget, monthlyLimit: amount })).toBe(false));
  it.each([0, 101, 80.5])('rejects threshold %s', threshold => expect(validCategoryBudget({ ...budget, warningThresholdPercent: threshold })).toBe(false));
  it('accepts exact cents and a large valid limit', () => {
    expect(validCategoryBudget({ ...budget, monthlyLimit: 12.34 })).toBe(true);
    expect(validCategoryBudget({ ...budget, monthlyLimit: 999999999.99 })).toBe(true);
  });
  it.each([[null, null, 0], [150, 50, 0], [100, 0, 0], [75, 0, 25]])('allocates against %s', (global, unallocated, overAllocated) => {
    expect(budgetAllocation([budget], global)).toEqual({ total: 100, unallocated, overAllocated });
  });
  it('handles a 100-percent threshold without an early warning', () => {
    const b = { ...budget, warningThresholdPercent: 100 };
    const expense: Expense = { id: 'x', amount: 99.99, categoryId: 'food', dateMillis: 1, note: '', transactionType: 'expense' };
    expect(categoryBudgetProgress([b], [category], [expense])[0].state).toBe('normal');
    expect(categoryBudgetProgress([b], [category], [{ ...expense, amount: 100 }])[0].state).toBe('reached');
  });
  it('sorts ties by category identity', () => {
    const c = { ...category, id: 'a' };
    expect(categoryBudgetProgress([budget, { ...budget, categoryId: 'a' }], [category, c], []).map(p => p.categoryId)).toEqual(['a', 'food']);
  });
  it('exports v2 and accepts legacy v1 without a budget section', () => {
    const backup = createBackup({ preferences: { currency: 'EUR', monthlyBudget: null }, categories: [category], expenses: [], appVersion: 'test', categoryBudgets: [budget], schemaVersion: 2 });
    expect(backup.schemaVersion).toBe(2);
    expect(validateBackup(backup).valid).toBe(true);
    const { categoryBudgets: omitted, ...legacy } = backup;
    void omitted;
    expect(validateBackup({ ...legacy, schemaVersion: 1 }).valid).toBe(true);
    expect(validateBackup({ ...backup, schemaVersion: 1 }).valid).toBe(false);
    expect(validateBackup({ ...backup, categoryBudgets: [{ ...budget, monthlyLimit: 1.001 }] }).valid).toBe(false);
  });
});

it.each(['android-v1','web-v1','android-v2','web-v2','shared-v2-empty','shared-v2-multiple'])('imports cross-platform fixture %s', name => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(),'../test-fixtures/category-budgets/'+name+'.json'),'utf8'));
  expect(validateBackup(fixture).valid).toBe(true);
});

it.each(['web-v2','shared-v2-empty','shared-v2-multiple'])('Web exporter matches the shared golden %s consumed by Android', name => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '../test-fixtures/category-budgets/'+name+'.json'), 'utf8'));
  const exported = createBackup({ preferences: fixture.preferences, categories: fixture.categories, expenses: fixture.expenses, categoryBudgets: fixture.categoryBudgets, appVersion: fixture.appVersion, schemaVersion: fixture.schemaVersion });
  expect({ ...exported, exportedAt: fixture.exportedAt }).toEqual(fixture);
});

it('accepts existing category identities longer than an app-generated UUID', () => {
  expect(validCategoryBudget({ ...budget, categoryId: 'legacy-' + 'x'.repeat(80) })).toBe(true);
});
