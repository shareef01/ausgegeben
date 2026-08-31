/**
 * The month-total invariant, asserted across both routes that compute it.
 *
 * `sumMonthExpenses` reaches the budget figure with two server-side aggregates (all
 * matching rows, minus the `deleted: true` subset). Every UI total reaches the same
 * figure by pulling the rows and filtering client-side. They are entirely separate code
 * paths over the same data, and nothing has ever asserted they agree.
 *
 * That gap is exactly how the €7,655 incident happened: soft-deleted rows were counted as
 * live by one path while the other looked correct, and the fix for it *still* left the
 * month total counting deleted rows (AGENTS.md section 1). A single fixture with live
 * rows, soft-deleted rows, income, transfers and out-of-month rows pins both routes to
 * one number, so a future change cannot move one without moving the other.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import {
  emulatorFirestore,
  resetHarness,
  signInTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository } = await import('@/repositories/expenseRepository');
const { computeTotals } = await import('@/utils/analytics');

const MONTH_START = Date.UTC(2026, 7, 1);
const MONTH_END = Date.UTC(2026, 8, 1);
const IN_MONTH = Date.UTC(2026, 7, 10);
const BEFORE_MONTH = Date.UTC(2026, 6, 31);
const AFTER_MONTH = Date.UTC(2026, 8, 1);

/**
 * Live in-month expense rows only: 12.34 + 100 + 0.01 = 112.35.
 * Everything else in the fixture is a distractor that must NOT be counted.
 */
const EXPECTED_MONTH_EXPENSE_TOTAL = 112.35;

async function seed(): Promise<void> {
  const db = emulatorFirestore();
  const batch = writeBatch(db);
  const base = {
    categoryId: 'cat', note: '', transactionType: 'expense', updatedAt: Date.now(),
  };

  batch.set(doc(db, `users/${TEST_UID}/categories/cat`), {
    id: 'cat', name: 'Groceries', iconName: 'shopping_cart', colorInt: -2345678,
    transactionType: 'expense', sortOrder: 0, updatedAt: Date.now(),
  });
  batch.set(doc(db, `users/${TEST_UID}/categories/inc`), {
    id: 'inc', name: 'Salary', iconName: 'credit_card', colorInt: -2345678,
    transactionType: 'income', sortOrder: 0, updatedAt: Date.now(),
  });
  batch.set(doc(db, `users/${TEST_UID}/categories/xfer`), {
    id: 'xfer', name: 'Transfer', iconName: 'swap_horiz', colorInt: -2345678,
    transactionType: 'transfer', sortOrder: 0, updatedAt: Date.now(),
  });

  // Counted: three live in-month expenses, including cent-scale and boundary values.
  batch.set(doc(db, `users/${TEST_UID}/expenses/live-a`), { ...base, amount: 12.34, dateMillis: IN_MONTH });
  batch.set(doc(db, `users/${TEST_UID}/expenses/live-b`), { ...base, amount: 100, dateMillis: MONTH_START });
  batch.set(doc(db, `users/${TEST_UID}/expenses/live-c`), { ...base, amount: 0.01, dateMillis: MONTH_END - 1 });

  // Not counted: soft-deleted — the €7,655 rows.
  batch.set(doc(db, `users/${TEST_UID}/expenses/del-a`), { ...base, amount: 500, dateMillis: IN_MONTH, deleted: true });
  batch.set(doc(db, `users/${TEST_UID}/expenses/del-b`), { ...base, amount: 7155, dateMillis: IN_MONTH, deleted: true });

  // Not counted: wrong type.
  batch.set(doc(db, `users/${TEST_UID}/expenses/income`), {
    ...base, amount: 2000, dateMillis: IN_MONTH, categoryId: 'inc', transactionType: 'income',
  });
  batch.set(doc(db, `users/${TEST_UID}/expenses/xfer`), {
    ...base, amount: 300, dateMillis: IN_MONTH, categoryId: 'xfer', transactionType: 'transfer',
  });

  // Not counted: outside the half-open [start, end) range, one on each boundary.
  batch.set(doc(db, `users/${TEST_UID}/expenses/before`), { ...base, amount: 999, dateMillis: BEFORE_MONTH });
  batch.set(doc(db, `users/${TEST_UID}/expenses/after`), { ...base, amount: 888, dateMillis: AFTER_MONTH });

  await batch.commit();

  // Already swept, like every real account that has cold-started.
  await setDoc(doc(db, `users/${TEST_UID}/meta/dedupe`), {
    categoriesDeduped: true, ranAt: Date.now(), orphansScannedAt: Date.now(), orphanScanVersion: 1,
  });
}

/** The UI route: pull the range, filter client-side, add up the expense rows. */
async function clientSideTotal(): Promise<number> {
  const rows = await expenseRepository.getExpensesInRange(MONTH_START, MONTH_END);
  return computeTotals(rows).totalExpenses;
}

describe('month expense total — aggregate route vs client-filtered route', () => {
  beforeAll(async () => {
    await startHarness();
  }, 60_000);
  afterAll(async () => {
    await stopHarness();
  });
  beforeEach(async () => {
    await resetHarness();
    await signInTestUser();
    await seed();
  });

  it('both routes agree, and agree with the hand-computed figure', async () => {
    const aggregate = await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END);
    const clientSide = await clientSideTotal();

    expect(aggregate).toBe(EXPECTED_MONTH_EXPENSE_TOTAL);
    expect(clientSide).toBe(EXPECTED_MONTH_EXPENSE_TOTAL);
    expect(aggregate).toBe(clientSide);
  });

  it('excludes soft-deleted rows from the aggregate — the €7,655 regression', async () => {
    const aggregate = await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END);
    // 7655 is exactly what the two deleted rows would add if counted.
    expect(aggregate).not.toBe(EXPECTED_MONTH_EXPENSE_TOTAL + 7655);
    expect(aggregate).toBeLessThan(1000);
  });

  it('leaves the soft-deleted rows in place rather than purging them', async () => {
    await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END);
    const db = emulatorFirestore();
    const snap = await import('firebase/firestore').then((m) =>
      m.getDocs(collection(db, 'users', TEST_UID, 'expenses')),
    );
    const deleted = snap.docs.filter((d) => d.data().deleted === true);
    expect(deleted).toHaveLength(2);
  });

  it('still agrees once the edited row is excluded from the projection', async () => {
    // The budget projection subtracts the row being edited so it can add the new amount
    // without double-counting. That subtraction is guarded on type, deleted and range.
    const excluded = await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'live-b');
    expect(excluded).toBe(Math.round((EXPECTED_MONTH_EXPENSE_TOTAL - 100) * 100) / 100);
  });

  it('does not subtract an excluded row that falls outside the summed set', async () => {
    // A soft-deleted or out-of-range id was never in the sum, so subtracting it would
    // under-report — the mirror image of the original bug.
    for (const id of ['del-a', 'before', 'after', 'income']) {
      const total = await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, id);
      expect(total).toBe(EXPECTED_MONTH_EXPENSE_TOTAL);
    }
  });
});
