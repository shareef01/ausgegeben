/**
 * Read-volume behaviour of the two hottest paths, against the emulator.
 *
 * Spark allows 50,000 document reads a day. These two paths were the largest
 * consumers by a wide margin, so the point of these tests is not only that the
 * numbers come out right but that they stay cheap: correctness regressions are
 * obvious, a silent return to per-document reads is not.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import {
  emulatorFirestore,
  resetHarness,
  signInTestUser,
  signOutTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository, invalidateAllExpensesCache } = await import(
  '@/repositories/expenseRepository'
);

const MONTH_START = Date.UTC(2026, 5, 1);
const MONTH_END = Date.UTC(2026, 6, 1);

function expCol() {
  return collection(emulatorFirestore(), 'users', TEST_UID, 'expenses');
}

async function seedCategory() {
  await setDoc(doc(collection(emulatorFirestore(), 'users', TEST_UID, 'categories'), 'cat-1'), {
    id: 'cat-1',
    name: 'Groceries',
    iconName: 'shopping_cart',
    colorInt: -2345678,
    transactionType: 'expense',
    sortOrder: 0,
    updatedAt: Date.now(),
  });
}

async function seedExpense(
  id: string,
  amount: number,
  opts: { type?: string; dateMillis?: number } = {},
) {
  await setDoc(doc(expCol(), id), {
    id,
    amount,
    dateMillis: opts.dateMillis ?? Date.UTC(2026, 5, 15),
    categoryId: 'cat-1',
    note: id,
    transactionType: opts.type ?? 'expense',
    updatedAt: Date.now(),
  });
}

beforeAll(startHarness, 60_000);
afterAll(stopHarness);
beforeEach(async () => {
  await resetHarness();
  signInTestUser();
  invalidateAllExpensesCache();
  await seedCategory();
});

describe('sumMonthExpenses via server-side aggregation', () => {
  it('sums only expenses inside the range', async () => {
    await seedExpense('a', 10);
    await seedExpense('b', 5.25);
    await seedExpense('income', 999, { type: 'income' });
    await seedExpense('lastMonth', 500, { dateMillis: Date.UTC(2026, 4, 15) });
    await seedExpense('nextMonth', 700, { dateMillis: Date.UTC(2026, 6, 2) });

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).toBe(15.25);
  });

  it('returns 0 for an empty month rather than throwing', async () => {
    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).toBe(0);
  });

  it('excludes the row being edited', async () => {
    await seedExpense('keep', 30);
    await seedExpense('editing', 12);

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'editing')).toBe(30);
  });

  it('ignores an excluded id that falls outside the range', async () => {
    await seedExpense('keep', 30);
    await seedExpense('other', 40, { dateMillis: Date.UTC(2026, 4, 3) });

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'other')).toBe(30);
  });

  it('ignores an excluded id that does not exist', async () => {
    await seedExpense('keep', 30);

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'ghost')).toBe(30);
  });

  // The aggregate is a float sum; money has to come back rounded like the rest.
  it('rounds to two decimals', async () => {
    await seedExpense('a', 0.1);
    await seedExpense('b', 0.2);

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).toBe(0.3);
  });

  it('returns 0 when signed out', async () => {
    signOutTestUser();
    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).toBe(0);
  });
});

describe('all-time scan caching', () => {
  it('serves repeat callers without re-querying', async () => {
    await seedExpense('a', 10);
    const first = await expenseRepository.getAllExpensesCapped(5_000);
    // Written behind the repository's back: a cached read must not see it.
    await setDoc(doc(expCol(), 'sneaky'), {
      id: 'sneaky',
      amount: 1,
      dateMillis: Date.UTC(2026, 5, 16),
      categoryId: 'cat-1',
      note: 'sneaky',
      transactionType: 'expense',
      updatedAt: Date.now(),
    });
    const second = await expenseRepository.getAllExpensesCapped(5_000);

    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
  });

  it('collapses concurrent callers onto one query', async () => {
    await seedExpense('a', 10);
    const [x, y, z] = await Promise.all([
      expenseRepository.getAllExpensesCapped(5_000),
      expenseRepository.getAllExpensesCapped(5_000),
      expenseRepository.getAllExpensesCapped(5_000),
    ]);
    // Identity, not just equality: all three received the same resolved object.
    expect(x).toBe(y);
    expect(y).toBe(z);
  });

  /** A stale list after saving would be a visible bug, not just a wasted read. */
  it('is invalidated by a write so the next read is fresh', async () => {
    await seedExpense('a', 10);
    expect((await expenseRepository.getAllExpensesCapped(5_000)).items).toHaveLength(1);

    await expenseRepository.insertExpense({
      amount: 4,
      dateMillis: Date.UTC(2026, 5, 17),
      categoryId: 'cat-1',
      note: 'through the repository',
      transactionType: 'expense',
    });

    expect((await expenseRepository.getAllExpensesCapped(5_000)).items).toHaveLength(2);
  });

  it('is invalidated by a delete', async () => {
    await seedExpense('a', 10);
    const before = await expenseRepository.getAllExpensesCapped(5_000);
    expect(before.items).toHaveLength(1);

    await expenseRepository.deleteExpense('a');

    expect((await expenseRepository.getAllExpensesCapped(5_000)).items).toHaveLength(0);
  });

  it('does not serve one account’s rows to another', async () => {
    await seedExpense('a', 10);
    expect((await expenseRepository.getAllExpensesCapped(5_000)).items).toHaveLength(1);

    signOutTestUser();
    expect((await expenseRepository.getAllExpensesCapped(5_000)).items).toHaveLength(0);
  });

  it('still reports truncation', async () => {
    const batch = writeBatch(emulatorFirestore());
    for (let i = 0; i < 12; i++) {
      batch.set(doc(expCol(), `bulk-${i}`), {
        id: `bulk-${i}`,
        amount: 1,
        dateMillis: Date.UTC(2026, 5, 10) + i,
        categoryId: 'cat-1',
        note: 'bulk',
        transactionType: 'expense',
        updatedAt: Date.now(),
      });
    }
    await batch.commit();

    const capped = await expenseRepository.getAllExpensesCapped(10);
    expect(capped.items).toHaveLength(10);
    expect(capped.truncated).toBe(true);
  });
});
