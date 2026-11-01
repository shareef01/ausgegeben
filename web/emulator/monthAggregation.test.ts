/**
 * Firestore monthly aggregation (`sumMonthExpenses`) against the real emulator with rules
 * enforced. The budget projection is built on a server-side `sum()`, which the unit parity
 * fixture cannot exercise: it is a query, not an in-memory fold.
 *
 * Expected values are derived from the documented rule ("the month's live expense amounts, in
 * cents, excluding soft-deleted rows") and compared with the server's answer, not with a second
 * client-side implementation.
 *
 * Index caveat, deliberately not papered over: the emulator invents composite indexes on
 * demand, so a passing run here does NOT prove the production indexes in
 * firestore.indexes.json cover the query. That needs a real project.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  rulesEnv,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from './enforcedHarness';
import { useAuthStore } from '@/services/authStore';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { enforcedFirestore: db } = await import('./enforcedHarness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository } = await import('@/repositories/expenseRepository');

const CATEGORY = {
  id: 'cat-food',
  name: 'Food',
  iconName: 'restaurant',
  colorInt: 1,
  transactionType: 'expense' as const,
  sortOrder: 0,
  updatedAt: 1_700_000_000_000,
};
const INCOME_CATEGORY = { ...CATEGORY, id: 'cat-salary', name: 'Salary', transactionType: 'income' as const };
const TRANSFER_CATEGORY = { ...CATEGORY, id: 'cat-move', name: 'Move', transactionType: 'transfer' as const };

// October 2026 in Europe/Berlin: 2026-10-01T00:00 .. 2026-11-01T00:00 (31 days, DST ends 25 Oct).
const MONTH_START = 1790550000000;
const MONTH_END = 1793233200000;

function row(
  id: string,
  amount: number,
  dateMillis: number,
  transactionType: 'expense' | 'income' | 'transfer',
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    amount,
    dateMillis,
    categoryId:
      transactionType === 'expense' ? CATEGORY.id : transactionType === 'income' ? INCOME_CATEGORY.id : TRANSFER_CATEGORY.id,
    note: `row ${id}`,
    transactionType,
    updatedAt: 1_700_000_000_000,
    ...extra,
  };
}

describe('monthly aggregation under enforced rules', () => {
  beforeAll(async () => {
    await startEnforcedHarness();
  });
  afterAll(async () => {
    await stopEnforcedHarness();
  });
  beforeEach(async () => {
    await resetEnforcedHarness();
    useAuthStore.setState({
      user: { uid: TEST_UID, email: 'p@example.com', displayName: null, emailVerified: true },
    });
    const db = enforcedFirestore();
    for (const category of [CATEGORY, INCOME_CATEGORY, TRANSFER_CATEGORY]) {
      await setDoc(doc(db, 'users', TEST_UID, 'categories', category.id), category);
    }
  });

  it('sums only the month’s live expenses, excluding income, transfers and deleted rows', async () => {
    const db = enforcedFirestore();
    const rows = [
      row('in-1', 12.34, MONTH_START + 1, 'expense'),
      row('in-2', 0.1, MONTH_START, 'expense'), // first millisecond of the month
      row('in-3', 0.2, MONTH_END - 1, 'expense'), // last millisecond of the month
      row('in-4', 1000.0, MONTH_START + 86_400_000, 'expense'),
      row('in-5', 5.55, MONTH_START + 2 * 86_400_000, 'expense', { deleted: true }), // soft-deleted
      row('in-6', 2500.0, MONTH_START + 3 * 86_400_000, 'income'), // not spending
      row('in-7', 500.0, MONTH_START + 4 * 86_400_000, 'transfer'), // not spending
      row('out-1', 900.0, MONTH_START - 1, 'expense'), // previous month
      row('out-2', 800.0, MONTH_END, 'expense'), // next month
      row('out-3', 700.0, MONTH_END + 86_400_000, 'expense'),
    ];
    for (const r of rows) {
      // A soft-deleted row is written as a legacy shape: rules accept `deleted: true`.
      await setDoc(doc(db, 'users', TEST_UID, 'expenses', r.id), r);
    }

    // 12.34 + 0.10 + 0.20 + 1000.00, in cents: 1234 + 10 + 20 + 100000 = 101264 -> 1012.64
    const expectedTotal = 1012.64;
    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).resolves.toBe(expectedTotal);
  });

  it('subtracts the row being edited, and only when it is inside the summed month', async () => {
    const db = enforcedFirestore();
    for (const r of [
      row('edit-me', 40.0, MONTH_START + 10, 'expense'),
      row('keep', 2.5, MONTH_START + 20, 'expense'),
      row('deleted-out', 9.99, MONTH_START + 30, 'expense', { deleted: true }),
    ]) {
      await setDoc(doc(db, 'users', TEST_UID, 'expenses', r.id), r);
    }

    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).resolves.toBe(42.5);
    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'edit-me')).resolves.toBe(2.5);
    // A row outside the range is not part of the aggregate, so subtracting it would be wrong.
    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'out-2')).resolves.toBe(42.5);
    // A soft-deleted row was already removed by the second pass; subtracting again would double-count.
    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'deleted-out')).resolves.toBe(42.5);
  });

  it('never returns a negative total even when the deleted pass exceeds the live pass', async () => {
    // Not reachable through the clients (deleting is a hard delete, or a legacy `deleted: true`),
    // but the subtraction is a raw difference and the clamp is part of the contract.
    const db = enforcedFirestore();
    await setDoc(
      doc(db, 'users', TEST_UID, 'expenses', 'legacy-deleted'),
      row('legacy-deleted', 30.0, MONTH_START + 5, 'expense', { deleted: true }),
    );
    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).resolves.toBe(0);
  });

  it('large valid amounts stay exact in the server aggregate', async () => {
    const db = enforcedFirestore();
    await setDoc(
      doc(db, 'users', TEST_UID, 'expenses', 'big-1'),
      row('big-1', 999999999.99, MONTH_START + 1, 'expense'),
    );
    await setDoc(
      doc(db, 'users', TEST_UID, 'expenses', 'big-2'),
      row('big-2', 0.01, MONTH_START + 2, 'expense'),
    );
    // 999999999.99 + 0.01 = 1000000000.00 exactly in cents: 99999999999 + 1 = 100000000000
    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).resolves.toBe(1_000_000_000);
  });

  it('is isolated per authenticated account', async () => {
    const db = enforcedFirestore();
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'mine'), row('mine', 10.0, MONTH_START + 1, 'expense'));

    // Another account's rows in the same month must neither appear in the sum nor be readable.
    const otherUid = 'other-aggregate-user';
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const raw = ctx.firestore();
      await setDoc(doc(raw, 'users', otherUid, 'categories', CATEGORY.id), CATEGORY);
      await setDoc(
        doc(raw, 'users', otherUid, 'expenses', 'theirs'),
        row('theirs', 500.0, MONTH_START + 2, 'expense'),
      );
    });

    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).resolves.toBe(10);
    // Rules refuse the list outright rather than returning rows, so another account's data is
    // neither aggregated nor discoverable.
    await expect(getDocs(collection(db, 'users', otherUid, 'expenses'))).rejects.toThrow(/PERMISSION_DENIED|permission-denied|false for 'list'/);
  });

  it('a category mid-migration does not change the month total', async () => {
    const db = enforcedFirestore();
    // Category type migrations move linked expenses between types in the same transaction
    // window; while staged, the expense keeps its own type, so the month total must be stable.
    await setDoc(
      doc(db, 'users', TEST_UID, 'categories', CATEGORY.id),
      { ...CATEGORY, migrationState: 'migrating', pendingTransactionType: 'income', updatedAt: Date.now() },
    );
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'mid-migration'), row('mid-migration', 25.0, MONTH_START + 1, 'expense'));

    await expect(expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).resolves.toBe(25);
  });
});
