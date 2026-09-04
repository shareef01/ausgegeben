/**
 * Legacy `deleted: true` expense rows.
 *
 * Nothing has written this flag for a long time, but rows carrying it are still
 * sitting in real accounts, and they once inflated a user's totals by €7,655
 * because every read path counted them as live (AGENTS.md section 1).
 *
 * The trap these tests exist for: the rows only matter on an account that has
 * *already* had its one-shot orphan sweep (`meta/dedupe.orphansScannedAt` set),
 * which is every account that has cold-started since that marker shipped. A fix
 * that cleans up during the sweep therefore never runs on the accounts that have
 * the problem, and passes any test that seeds a fresh account. Every case below
 * seeds the marker first.
 *
 * The second invariant here is that the rows are *left alone*. They are the
 * user's financial history; the app tolerates legacy data, it does not purge it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
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

const MONTH_START = Date.UTC(2026, 7, 1);
const MONTH_END = Date.UTC(2026, 8, 1);
const WHEN = Date.UTC(2026, 7, 10);

const LIVE = 4;        // 4 x 100.00 = 400.00 genuinely live
const SOFT_DELETED = 6; // 6 x 500.00 = 3000.00 deleted years ago

function expCol() {
  return collection(emulatorFirestore(), 'users', TEST_UID, 'expenses');
}

/** An account with legacy soft-deleted rows that has already been swept once. */
async function seedAlreadySweptAccount(): Promise<void> {
  const db = emulatorFirestore();
  const batch = writeBatch(db);

  batch.set(doc(db, `users/${TEST_UID}/categories/keep`), {
    id: 'keep', name: 'Groceries', iconName: 'shopping_cart', colorInt: -2345678,
    transactionType: 'expense', sortOrder: 0, updatedAt: Date.now(),
  });
  for (let i = 0; i < LIVE; i++) {
    batch.set(doc(db, `users/${TEST_UID}/expenses/live-${i}`), {
      id: `live-${i}`, amount: 100, dateMillis: WHEN, categoryId: 'keep',
      note: 'live', transactionType: 'expense', updatedAt: Date.now(),
    });
  }
  for (let i = 0; i < SOFT_DELETED; i++) {
    batch.set(doc(db, `users/${TEST_UID}/expenses/deleted-${i}`), {
      id: `deleted-${i}`, amount: 500, dateMillis: WHEN, categoryId: 'keep',
      note: 'deleted long ago', transactionType: 'expense', updatedAt: Date.now(),
      deleted: true,
    });
  }
  await batch.commit();

  await setDoc(doc(db, `users/${TEST_UID}/meta/dedupe`), {
    categoriesDeduped: true, ranAt: Date.now(), orphansScannedAt: Date.now(),
    orphanScanVersion: 1,
  });
}

function listenerTotal(): Promise<number> {
  return new Promise((resolve) => {
    const unsub = expenseRepository.onExpensesInRange(MONTH_START, MONTH_END, (exps) => {
      setTimeout(unsub, 0);
      resolve(exps.reduce((s, e) => s + e.amount, 0));
    });
  });
}

beforeAll(startHarness, 60_000);
afterAll(stopHarness);
beforeEach(async () => {
  await resetHarness();
  signInTestUser(true);
});

describe('legacy soft-deleted expense rows', () => {
  it('excludes them from the month total on an already-swept account', async () => {
    await seedAlreadySweptAccount();

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END)).toBe(400);
  });

  /**
   * The regression that motivated this file: filtering was added to the list and
   * the listener but not to the aggregate or the one-shot range read, so the same
   * month reported 400.00 in one view and 3400.00 in another.
   */
  it('agrees across every read path for the same range', async () => {
    await seedAlreadySweptAccount();

    const [list, oneShot, listener, total] = await Promise.all([
      expenseRepository.getAllExpensesCapped(),
      expenseRepository.getExpensesInRange(MONTH_START, MONTH_END),
      listenerTotal(),
      expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END),
    ]);
    const listTotal = list.items
      .filter((e) => e.dateMillis >= MONTH_START && e.dateMillis < MONTH_END)
      .reduce((s, e) => s + e.amount, 0);
    const oneShotTotal = oneShot.reduce((s, e) => s + e.amount, 0);

    expect({ listTotal, oneShotTotal, listener, total })
      .toEqual({ listTotal: 400, oneShotTotal: 400, listener: 400, total: 400 });
  });

  /** The rows are the user's history — tolerated, never purged. */
  it('leaves the rows in place rather than deleting them', async () => {
    await seedAlreadySweptAccount();

    await expenseRepository.ensureSeeded();
    await expenseRepository.deduplicateCategories();

    const snap = await getDocs(expCol());
    expect(snap.docs.filter((d) => d.data().deleted === true)).toHaveLength(SOFT_DELETED);
  });

  it('subtracts the row being edited without counting it twice', async () => {
    await seedAlreadySweptAccount();

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'live-0')).toBe(300);
  });

  /**
   * A soft-deleted row never reached the total in the first place, so subtracting
   * it again would drive the month negative (and used to be hidden by a clamp).
   */
  it('does not subtract an excluded row that was already soft-deleted', async () => {
    await seedAlreadySweptAccount();

    expect(await expenseRepository.sumMonthExpenses(MONTH_START, MONTH_END, 'deleted-0')).toBe(400);
  });
});
