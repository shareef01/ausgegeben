/**
 * Deterministic two-client race for a single recurring occurrence, under the real rules.
 * Outcome is idempotent by construction: exactly one canonical expense and one receipt,
 * regardless of which client wins; the loser's materialize() may take the optimistic
 * fallback or the plain re-read, both of which share the same receipt acceptance rule.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, getDocs } from 'firebase/firestore';
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

const NOW = Date.parse('2024-04-10T12:00:00Z');
const FIRST = '2024-01-31';
const TZ = 'Europe/Berlin';
const TPL = '99999999-9999-4999-8999-999999999999';

let categoryId = '';
const db = () => enforcedFirestore();
const expCol = () => collection(db(), 'users', TEST_UID, 'expenses');

const template = () => ({
  id: TPL,
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

describe('concurrent recurring materialization (rules enforced)', () => {
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

  it('two clients racing one occurrence produce one canonical expense, one receipt, and stay idempotent', async () => {
    await recurringRepository.save(TEST_UID, template() as never, null, NOW);

    const secondDb = rulesEnv().authenticatedContext(TEST_UID, { email_verified: true }).firestore();
    const second = createRecurringRepository(secondDb as never);

    // Both may win or lose; the loser exercises the re-read/fallback acceptance.
    await Promise.all([
      recurringRepository.materialize(TEST_UID, TPL, NOW),
      second.materialize(TEST_UID, TPL, NOW),
    ]);

    const key = occurrenceKey(TPL, FIRST);
    const january = (await getDocs(expCol())).docs.filter((d) => d.data().idempotencyKey === key);
    expect(january).toHaveLength(1);

    const receipts = (await getDocs(collection(db(), 'users', TEST_UID, 'recurringOccurrences'))).docs;
    expect(receipts.filter((d) => d.id === receiptId(TPL, FIRST))).toHaveLength(1);

    // Repeated reconciliation stays idempotent.
    await recurringRepository.reconcile(TEST_UID, NOW);
    await second.reconcile(TEST_UID, NOW);
    const januaryAfter = (await getDocs(expCol())).docs.filter((d) => d.data().idempotencyKey === key);
    expect(januaryAfter).toHaveLength(1);
    expect(recurringRepository.getRecurringIssues(TEST_UID)).toHaveLength(0);
  });
});
