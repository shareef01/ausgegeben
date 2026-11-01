/**
 * Restore concurrency: what the revision bump actually buys, and what it does not.
 *
 * `updatedAt` is an ordering check the rules evaluate against the *stored* document at commit
 * time (`monotonicallyIncreasingExpenseUpdatedAt`). It is **not** a compare-and-swap
 * precondition: Firestore applies the write whether or not anything changed between the
 * revision read and the commit, as long as the incoming revision is >= the stored one. So a
 * restore can absolutely overwrite an edit another device made in that window — that is the
 * documented last-writer-wins model, and the second half of this suite pins the one case that
 * fails closed instead.
 *
 * Each test drives a *second authenticated client* (a separate Firestore instance for the same
 * uid) between the revision read and the retry commit via the `beforeRetry` fault seam.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  rulesEnv,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from './enforcedHarness';
import { useAuthStore } from '@/services/authStore';
import {
  BACKUP_FORMAT_IDENTIFIER,
  CURRENT_BACKUP_SCHEMA_VERSION,
  type AusgegebenBackup,
} from '@/services/backupFormat';
import { commitRestoredExpenses } from '@/services/restoreExpenseBatch';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { enforcedFirestore: db } = await import('./enforcedHarness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { restoreBackup } = await import('@/services/backupRestore');

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

function restoreFile(note: string): AusgegebenBackup {
  return {
    format: BACKUP_FORMAT_IDENTIFIER,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-10-01T00:00:00.000Z',
    appVersion: '2.1.9',
    preferences: { currency: 'EUR', monthlyBudget: null, locale: 'en', themeMode: 'system' },
    categories: [CATEGORY, INCOME_CATEGORY],
    expenses: [
      {
        id: 'raced',
        amount: 43,
        dateMillis: 1_700_000_000_000,
        categoryId: CATEGORY.id,
        note,
        transactionType: 'expense',
      },
    ],
    categoryBudgets: [],
    recurring: { templates: [], receipts: [] },
  };
}

const readExpense = (id: string) =>
  getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', id));

/** A second authenticated client for the same account — another device, not a mock. */
function otherClient() {
  return rulesEnv().authenticatedContext(TEST_UID, { email_verified: true }).firestore();
}

describe('restore concurrency under enforced rules', () => {
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
    await setDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'categories', CATEGORY.id), CATEGORY);
    await setDoc(
      doc(enforcedFirestore(), 'users', TEST_UID, 'categories', INCOME_CATEGORY.id),
      INCOME_CATEGORY,
    );
  });

  async function seedFutureRow(ahead: number, note: string): Promise<void> {
    await setDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'raced'), {
      amount: 42,
      dateMillis: 1_700_000_000_000,
      categoryId: CATEGORY.id,
      note,
      transactionType: 'expense',
      updatedAt: ahead,
    });
  }

  it('overwrites a concurrent edit whose revision is BELOW the proposed restore revision', async () => {
    const ahead = Date.now() + 240_000;
    await seedFutureRow(ahead, 'original');
    // The restore proposes ahead + 1. A concurrent device writes the same stored revision (legal:
    // the rule is >=), leaving its edit one tick below the restore's.
    let concurrentWrite = 'not attempted';
    await commitRestoredExpenses(
      enforcedFirestore(),
      TEST_UID,
      [{ id: 'raced', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'from backup', transactionType: 'expense', id: 'raced' } }],
      {
        faultHooks: {
          beforeRetry: async () => {
            try {
              await setDoc(
                doc(otherClient(), 'users', TEST_UID, 'expenses', 'raced'),
                { note: 'concurrent edit', updatedAt: ahead },
                { merge: true },
              );
              concurrentWrite = 'accepted';
            } catch (error) {
              concurrentWrite = `refused: ${(error as Error).message.slice(0, 80)}`;
            }
          },
        },
      },
    );

    expect(concurrentWrite).toBe('accepted');
    const stored = (await readExpense('raced')).data()!;
    // Last writer wins by commit order, not by revision: the restore is applied on top.
    expect(stored.note).toBe('from backup');
    expect(stored.amount).toBe(43);
    expect(stored.updatedAt).toBe(ahead + 1);
  });

  it('overwrites a concurrent edit whose revision EQUALS the proposed restore revision', async () => {
    const ahead = Date.now() + 240_000;
    await seedFutureRow(ahead, 'original');
    let concurrentWrite = 'not attempted';
    await commitRestoredExpenses(
      enforcedFirestore(),
      TEST_UID,
      [{ id: 'raced', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'from backup', transactionType: 'expense', id: 'raced' } }],
      {
        faultHooks: {
          beforeRetry: async () => {
            try {
              await setDoc(
                doc(otherClient(), 'users', TEST_UID, 'expenses', 'raced'),
                { note: 'concurrent edit', updatedAt: ahead + 1 },
                { merge: true },
              );
              concurrentWrite = 'accepted';
            } catch (error) {
              concurrentWrite = `refused: ${(error as Error).message.slice(0, 80)}`;
            }
          },
        },
      },
    );

    expect(concurrentWrite).toBe('accepted');
    const stored = (await readExpense('raced')).data()!;
    // Equal revisions: the rule is `>=`, so the later commit wins whole. Not a CAS.
    expect(stored.note).toBe('from backup');
    expect(stored.updatedAt).toBe(ahead + 1);
  });

  it('fails closed when the concurrent edit is ABOVE the proposed restore revision', async () => {
    const ahead = Date.now() + 240_000;
    await seedFutureRow(ahead, 'original');
    let failure: (Error & { code?: string }) | null = null;
    try {
      await commitRestoredExpenses(
        enforcedFirestore(),
        TEST_UID,
        [{ id: 'raced', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'from backup', transactionType: 'expense', id: 'raced' } }],
        {
          faultHooks: {
            beforeRetry: async () => {
              await setDoc(
                doc(otherClient(), 'users', TEST_UID, 'expenses', 'raced'),
                { note: 'concurrent edit', updatedAt: ahead + 60_000 },
                { merge: true },
              );
            },
          },
        },
      );
    } catch (error) {
      failure = error as Error & { code?: string };
    }

    expect(failure?.code).toBe('permission-denied');
    const stored = (await readExpense('raced')).data()!;
    // The newer concurrent edit survives intact; the restore wrote nothing.
    expect(stored.note).toBe('concurrent edit');
    expect(stored.amount).toBe(42);
    expect(stored.updatedAt).toBe(ahead + 60_000);
  });

  it('cannot turn a validation refusal into a write by advancing the revision', async () => {
    const ahead = Date.now() + 240_000;
    await seedFutureRow(ahead, 'original');
    // The other device stages the expense's category for deletion. `expenseCategoryAcceptsReferences`
    // refuses any new reference to it, however new the incoming `updatedAt` is — the revision bump
    // addresses the ordering check only and cannot satisfy a field/foreign-key rule.
    let failure: (Error & { code?: string }) | null = null;
    try {
      await commitRestoredExpenses(
        enforcedFirestore(),
        TEST_UID,
        [{ id: 'raced', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'from backup', transactionType: 'expense', id: 'raced' } }],
        {
          faultHooks: {
            beforeRetry: async () => {
              await setDoc(
                doc(otherClient(), 'users', TEST_UID, 'categories', CATEGORY.id),
                { deletionState: 'deleting', updatedAt: Date.now() },
                { merge: true },
              );
            },
          },
        },
      );
    } catch (error) {
      failure = error as Error & { code?: string };
    }

    expect(failure?.code).toBe('permission-denied');
    const stored = (await readExpense('raced')).data()!;
    expect(stored.amount).toBe(42);
    expect(stored.note).toBe('original');
    const category = (await getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'categories', CATEGORY.id))).data()!;
    expect(category.deletionState).toBe('deleting');
  });

  it('a refused retry writes nothing into the collection, not even the rows that were writable', async () => {
    const ahead = Date.now() + 240_000;
    await seedFutureRow(ahead, 'original');
    // A second row in the same batch is untouched by the race and would be writable on its own.
    await setDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'bystander'), {
      amount: 10,
      dateMillis: 1_700_000_000_000,
      categoryId: CATEGORY.id,
      note: 'bystander',
      transactionType: 'expense',
      updatedAt: Date.now() - 60_000,
    });

    await expect(
      commitRestoredExpenses(
        enforcedFirestore(),
        TEST_UID,
        [
          { id: 'raced', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'from backup', transactionType: 'expense', id: 'raced' } },
          { id: 'bystander', payload: { amount: 11, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'from backup', transactionType: 'expense', id: 'bystander' } },
        ],
        {
          faultHooks: {
            beforeRetry: async () => {
              await setDoc(
                doc(otherClient(), 'users', TEST_UID, 'expenses', 'raced'),
                { updatedAt: ahead + 60_000 },
                { merge: true },
              );
            },
          },
        },
      ),
    ).rejects.toThrow(/PERMISSION_DENIED|permission-denied/);

    // The batch is atomic: the writable row was not committed either.
    const bystander = (await readExpense('bystander')).data()!;
    expect(bystander.amount).toBe(10);
    expect(bystander.note).toBe('bystander');
  });

  it('merge restore documents last-writer-wins: a newer concurrent edit loses to the restore', async () => {
    // Full restores are overwrites by contract (docs/maintenance.md: "Concurrent edits of one
    // transaction are last-writer-wins for the whole document"). This pins that a restore over a
    // row edited after the backup replaces the row, and that the result is the same on a retry.
    const db = enforcedFirestore();
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'edited'), {
      amount: 99,
      dateMillis: 1_700_000_000_000,
      categoryId: CATEGORY.id,
      note: 'edited after export',
      transactionType: 'expense',
      updatedAt: Date.now(),
    });
    const file = restoreFile('from backup');
    file.expenses[0].id = 'edited';

    await restoreBackup(file, TEST_UID);
    const stored = (await readExpense('edited')).data()!;
    expect(stored.note).toBe('from backup');
    expect(stored.amount).toBe(43);

    // The collection never gains a duplicate row for the same document.
    expect((await getDocs(collection(db, 'users', TEST_UID, 'expenses'))).size).toBe(1);
  });
});
