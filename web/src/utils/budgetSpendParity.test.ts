import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryBudgetProgress, type CategoryBudget } from '@/services/categoryBudgets';
import type { Category, Expense } from '@/models/types';

/**
 * F-05 cross-platform budget spend parity. The cases are shared with Android's
 * `FinancialParityTest`; categories and budgets come from the main financial fixture so
 * the two suites exercise the same category set (including an excluded migrating
 * category and a budget whose category no longer exists).
 *
 * Semantics under test:
 *  - `spent` / `anticipated` = every non-deleted expense in the supplied list;
 *  - `spentToDate` = rows dated before the local-midnight cutoff;
 *  - `upcoming` = rows at/after the cutoff;
 *  - `spent`, `percent`, `remaining` and `state` keep their historical meaning, so this
 *    change is additive.
 */
const spendFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../testdata/budget-spend-parity.json'), 'utf8'),
);
const financeFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../testdata/financial-parity.json'), 'utf8'),
);
const categories: Category[] = financeFixture.categories;
const budgets: CategoryBudget[] = financeFixture.budgets;

const toExpense = (raw: {
  id: string;
  amount: number;
  dateMillis: number;
  categoryId: string;
  transactionType: string;
  note: string;
  deleted?: boolean;
}): Expense => ({
  id: raw.id,
  amount: raw.amount,
  dateMillis: raw.dateMillis,
  categoryId: raw.categoryId,
  transactionType: raw.transactionType as Expense['transactionType'],
  note: raw.note,
  deleted: raw.deleted,
});

const project = (rows: ReturnType<typeof categoryBudgetProgress>) =>
  rows.map((row) => ({
    categoryId: row.categoryId,
    spent: row.spent,
    spentToDate: row.spentToDate,
    upcoming: row.upcoming,
    anticipated: row.anticipated,
    remaining: row.remaining,
    overspent: row.overspent,
    percent: row.percent,
    state: row.state,
  }));

describe('budget spend parity fixture (shared with Android FinancialParityTest)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = spendFixture.timeZone;
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  for (const testCase of spendFixture.cases as {
    name: string;
    cutoffMillis: number;
    expenses: Parameters<typeof toExpense>[0][];
    expected: unknown[];
  }[]) {
    it(testCase.name, () => {
      const actual = categoryBudgetProgress(
        budgets,
        categories,
        testCase.expenses.map(toExpense),
        testCase.cutoffMillis,
      );
      expect(project(actual)).toEqual(testCase.expected);
    });
  }

  it('without a cutoff, every row is actual and upcoming is zero (backward compatibility)', () => {
    const expenses = (spendFixture.cases[0].expenses as Parameters<typeof toExpense>[0][]).map(toExpense);
    for (const row of categoryBudgetProgress(budgets, categories, expenses)) {
      expect(row.spentToDate).toBe(row.spent);
      expect(row.upcoming).toBe(0);
      expect(row.anticipated).toBe(row.spent);
    }
  });
});
