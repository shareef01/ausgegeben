/**
 * Quarantine behaviour for occurrence receipts whose recorded expense id is not
 * sha256(occurrenceKey(templateId, date)). Rules enforced, real Firestore.
 *
 * The receipt is immutable metadata that only proves "this occurrence was generated"
 * when it names the deterministic expense document. Anything else must fail closed:
 * no silent skip (AUD-001) and no write derived from the receipt.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, deleteField, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
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

const { recurringRepository } = await import('@/services/recurringRepository');
const { expenseRepository } = await import('@/repositories/expenseRepository');
const { occurrenceKey, receiptId } = await import('@/services/recurrence');
const { expenseDocumentId } = await import('@/utils/idempotency');

const NOW = Date.parse('2024-04-10T12:00:00Z');
const FIRST = '2024-01-31';
const TZ = 'Europe/Berlin';
const BROKEN_ID = '00000000-0000-4000-8000-000000000001';
const HEALTHY_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

let categoryId = '';
const db = () => enforcedFirestore();
const expCol = () => collection(db(), 'users', TEST_UID, 'expenses');
const receiptRef = (id: string, date: string) =>
  doc(db(), 'users', TEST_UID, 'recurringOccurrences', receiptId(id, date));
const tplRef = (id: string) => doc(db(), 'users', TEST_UID, 'recurringTransactions', id);

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

describe('invalid occurrence receipt quarantine (rules enforced)', () => {
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

  it('a receipt that does not name the deterministic expense id fails closed and writes nothing', async () => {
    await recurringRepository.save(TEST_UID, template(BROKEN_ID) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, BROKEN_ID, NOW);
    expect((await getDocs(expCol())).size).toBe(1);
    expect((await getDoc(receiptRef(BROKEN_ID, FIRST))).exists()).toBe(true);

    // Corrupt the receipt (rules forbid this; a foreign/buggy writer or a damaged import can).
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(
        doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringOccurrences', receiptId(BROKEN_ID, FIRST)),
        { expenseId: 'b'.repeat(64) },
      );
      // Rewind the cursor, as a restore of an older backup would.
      await updateDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringTransactions', BROKEN_ID), {
        nextIndex: 0,
        nextDate: FIRST,
        updatedAt: NOW + 1000,
      });
    });

    await expect(recurringRepository.materialize(TEST_UID, BROKEN_ID, NOW)).rejects.toThrow(
      'RECURRING_RECEIPT_INVALID',
    );

    // Fail closed means: no expense created, no receipt rewritten, cursor untouched.
    expect((await getDocs(expCol())).size).toBe(1);
    expect(await cursorOf(BROKEN_ID)).toEqual({ nextIndex: 0, nextDate: FIRST });
    expect((await getDoc(receiptRef(BROKEN_ID, FIRST))).data()!.expenseId).toBe('b'.repeat(64));

    // The canonical row from the first materialization is untouched, and no additional row
    // was fabricated from the receipt's metadata.
    const expectedId = await expenseDocumentId(occurrenceKey(BROKEN_ID, FIRST));
    const canonical = await getDoc(doc(db(), 'users', TEST_UID, 'expenses', expectedId));
    expect(canonical.exists()).toBe(true);
    expect(canonical.data()!.idempotencyKey).toBe(occurrenceKey(BROKEN_ID, FIRST));
    expect((await getDocs(expCol())).size).toBe(1);
  });

  it('one quarantined occurrence does not stall catch-up for other templates', async () => {
    await recurringRepository.save(TEST_UID, template(BROKEN_ID) as never, null, NOW);
    await recurringRepository.save(TEST_UID, template(HEALTHY_ID) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, BROKEN_ID, NOW);

    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(
        doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringOccurrences', receiptId(BROKEN_ID, FIRST)),
        { expenseId: 'b'.repeat(64) },
      );
      await updateDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringTransactions', BROKEN_ID), {
        nextIndex: 0,
        nextDate: FIRST,
        updatedAt: NOW + 1000,
      });
    });

    // BROKEN_ID sorts first, so a pass that aborts on the first failure would create nothing.
    const created = await recurringRepository.reconcile(TEST_UID, NOW);

    expect(created).toBeGreaterThan(0);
    const healthyDates = (await getDocs(expCol())).docs.map((d) => d.data().categoryId === categoryId);
    expect(healthyDates.length).toBeGreaterThan(1);
    expect((await cursorOf(HEALTHY_ID)).nextDate).not.toBe(FIRST);
    // The broken template stays exactly where it was, and is reported.
    expect(await cursorOf(BROKEN_ID)).toEqual({ nextIndex: 0, nextDate: FIRST });
    const issues = recurringRepository.getRecurringIssues(TEST_UID);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ templateId: BROKEN_ID, scheduledDate: FIRST, code: 'RECURRING_RECEIPT_INVALID' });
  });

  it('a valid receipt still suppresses regeneration (ledger-preserving semantics unchanged)', async () => {
    await recurringRepository.save(TEST_UID, template(HEALTHY_ID) as never, null, NOW);
    await recurringRepository.materialize(TEST_UID, HEALTHY_ID, NOW);
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as never, 'users', TEST_UID, 'recurringTransactions', HEALTHY_ID), {
        nextIndex: 0,
        nextDate: FIRST,
        updatedAt: NOW + 1000,
      });
    });

    const created = await recurringRepository.reconcile(TEST_UID, NOW);

    // January is skipped (already generated), February onwards is generated as usual.
    expect(created).toBeGreaterThan(0);
    expect(recurringRepository.getRecurringIssues(TEST_UID)).toHaveLength(0);
    const january = (await getDocs(expCol())).docs.filter(
      (d) => d.data().idempotencyKey === occurrenceKey(HEALTHY_ID, FIRST),
    );
    expect(january).toHaveLength(1);
    expect(january[0].data().idempotencyKey).toBe(occurrenceKey(HEALTHY_ID, FIRST));
    void deleteField;
  });
});
