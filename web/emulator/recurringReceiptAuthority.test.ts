/**
 * Step 2 - receipt authority in materialize() (web).
 *
 * A receipt that passes `validOccurrenceReceipt` proves the occurrence was generated, so an
 * existing row that lost its idempotencyKey (edited, category-reassigned, restored) must not
 * raise RECURRING_IDENTITY_CONFLICT. Everything else keeps failing closed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  rulesEnv,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from '../emulator/enforcedHarness';

vi.mock('@/services/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/firebase')>()),
  getFirebaseFirestore: () => enforcedFirestore(),
}));

const { recurringRepository, createRecurringRepository } = await import('@/services/recurringRepository');
const { expenseRepository } = await import('@/repositories/expenseRepository');
const { occurrenceKey, receiptId } = await import('@/services/recurrence');
const { expenseDocumentId } = await import('@/utils/idempotency');
const { initializeApp, deleteApp } = await import('firebase/app');
const { connectFirestoreEmulator, getFirestore } = await import('firebase/firestore');

const NOW = Date.parse('2024-04-10T12:00:00Z');
const FIRST = '2024-01-31';
const TZ = 'Europe/Berlin';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let categoryId = '';
const db = () => enforcedFirestore();
const expCol = () => collection(db(), 'users', TEST_UID, 'expenses');
const tplRef = (id: string) => doc(db(), 'users', TEST_UID, 'recurringTransactions', id);
const receiptRef = (id: string, date: string) =>
  doc(db(), 'users', TEST_UID, 'recurringOccurrences', receiptId(id, date));

const template = (id: string) => ({
  id,
  amount: 15,
  categoryId,
  note: 'Rent',
  transactionType: 'expense' as const,
  frequency: 'monthly' as const,
  interval: 1,
  startDate: FIRST,
  endDate: null,
  timeZone: TZ,
  enabled: true,
  nextIndex: 0,
  nextDate: FIRST,
  createdAt: 1,
  updatedAt: 1,
});

const cursorOf = async (id: string) => {
  const snap = await getDoc(tplRef(id));
  return { nextIndex: snap.data()!.nextIndex as number, nextDate: snap.data()!.nextDate as string | null };
};

/** Rewind the cursor as a restore of an older backup would, without touching receipts. */
const rewind = (id: string) =>
  rulesEnv().withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringTransactions', id), {
      nextIndex: 0,
      nextDate: FIRST,
      updatedAt: NOW + 5000,
    });
  });

describe('receipt authority (rules enforced)', () => {
  beforeAll(async () => {
    await startEnforcedHarness();
  });
  afterAll(async () => {
    await stopEnforcedHarness();
  });
  beforeEach(async () => {
    await resetEnforcedHarness();
    categoryId = await expenseRepository.insertCategory({
      name: 'Rent',
      iconName: 'home',
      colorInt: 1,
      transactionType: 'expense',
      sortOrder: 0,
    });
  });

  it('valid receipt + keyless generated expense reconciles without conflict', async () => {
    await recurringRepository.save(TEST_UID, template(A) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, A, NOW);
    const generated = (await getDocs(expCol())).docs[0];

    // A normal edit (or category reassignment) clears idempotencyKey on both clients.
    await expenseRepository.updateExpense({ ...generated.data(), id: generated.id, amount: 17 } as never);
    expect((await getDoc(generated.ref)).data()!.idempotencyKey).toBeUndefined();

    await rewind(A);
    const created = await recurringRepository.reconcile(TEST_UID, NOW);

    // The edited row is untouched, no duplicate is created, and catch-up continues.
    expect(created).toBeGreaterThan(0);
    const january = (await getDocs(expCol())).docs.filter(
      (d) => d.data().dateMillis === (generated.data().dateMillis as number),
    );
    expect(january).toHaveLength(1);
    expect(january[0].data().amount).toBe(17);
    expect(await cursorOf(A)).not.toEqual({ nextIndex: 0, nextDate: FIRST });
    expect(recurringRepository.getRecurringIssues(TEST_UID)).toHaveLength(0);
  });

  it('valid receipt + missing expense preserves ledger semantics (no resurrection)', async () => {
    await recurringRepository.save(TEST_UID, template(A) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, A, NOW);
    const generated = (await getDocs(expCol())).docs[0];
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'expenses', generated.id), {
        amount: 1,
      });
    });
    await rewind(A);
    // The generated row is gone (a Replace of an older file, or a user delete).
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'expenses', generated.id));
    });

    await recurringRepository.reconcile(TEST_UID, NOW);
    await recurringRepository.reconcile(TEST_UID, NOW);

    const canonical = await expenseDocumentId(occurrenceKey(A, FIRST));
    // Ledger-preserving: January is NOT regenerated, and the receipt is not rewritten.
    expect((await getDoc(doc(db(), 'users', TEST_UID, 'expenses', canonical))).exists()).toBe(false);
    expect((await getDoc(receiptRef(A, FIRST))).exists()).toBe(true);
    expect(await cursorOf(A)).not.toEqual({ nextIndex: 0, nextDate: FIRST });
  });

  it('missing receipt + invalid key stays fail-closed', async () => {
    await recurringRepository.save(TEST_UID, template(A) as never, null, NOW);
    const canonical = await expenseDocumentId(occurrenceKey(A, FIRST));
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'expenses', canonical), {
        amount: 15,
        dateMillis: 1706655600000,
        categoryId,
        note: 'Rent',
        transactionType: 'expense',
        updatedAt: NOW,
        idempotencyKey: 'not-the-occurrence-key',
      });
    });

    await expect(recurringRepository.materialize(TEST_UID, A, NOW)).rejects.toThrow(
      'RECURRING_IDENTITY_CONFLICT',
    );
    expect(await cursorOf(A)).toEqual({ nextIndex: 0, nextDate: FIRST });
  });

  it('invalid receipt is quarantined and healthy templates keep processing', async () => {
    await recurringRepository.save(TEST_UID, template(A) as never, null, NOW);
    await recurringRepository.save(TEST_UID, template(B) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, A, NOW);
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringOccurrences', receiptId(A, FIRST)), {
        expenseId: 'c'.repeat(64),
      });
    });
    await rewind(A);

    const created = await recurringRepository.reconcile(TEST_UID, NOW);
    expect(created).toBeGreaterThan(0);
    expect(recurringRepository.getRecurringIssues(TEST_UID)).toHaveLength(1);
    expect(await cursorOf(A)).toEqual({ nextIndex: 0, nextDate: FIRST });
  });

  it('repeated reconciliation is idempotent', async () => {
    await recurringRepository.save(TEST_UID, template(A) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, A, NOW);
    await recurringRepository.reconcile(TEST_UID, NOW);
    await recurringRepository.reconcile(TEST_UID, NOW);
    await recurringRepository.reconcile(TEST_UID, NOW);

    const key = occurrenceKey(A, FIRST);
    const january = (await getDocs(expCol())).docs.filter((d) => d.data().idempotencyKey === key);
    expect(january).toHaveLength(1);
    expect(
      (await getDocs(collection(db(), 'users', TEST_UID, 'recurringOccurrences'))).docs.filter(
        (d) => d.id === receiptId(A, FIRST),
      ),
    ).toHaveLength(1);
  });
});
