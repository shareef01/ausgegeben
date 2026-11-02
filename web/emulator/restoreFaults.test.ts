/**
 * Restore fault injection: what a merge restore guarantees when a step fails part-way.
 *
 * A merge restore is not journalled and writes no safety snapshot (only replace does), so the
 * contract is narrow and worth pinning: it either reports success, or it throws and the account
 * holds only the batches that committed before the failure — never a success it did not reach,
 * and never a silently deleted row. A retry of the same file is idempotent.
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

function backupWithExpense(id: string, amount = 43): AusgegebenBackup {
  return {
    format: BACKUP_FORMAT_IDENTIFIER,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-10-01T00:00:00.000Z',
    appVersion: '2.1.9',
    preferences: { currency: 'EUR', monthlyBudget: 500, locale: 'en', themeMode: 'system' },
    categories: [CATEGORY],
    expenses: [
      {
        id,
        amount,
        dateMillis: 1_700_000_000_000,
        categoryId: CATEGORY.id,
        note: 'Restored row',
        transactionType: 'expense',
      },
    ],
    categoryBudgets: [],
    recurring: { templates: [], receipts: [] },
  };
}

function otherClient() {
  return rulesEnv().authenticatedContext(TEST_UID, { email_verified: true }).firestore();
}

const readPrefs = () =>
  getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'settings', 'preferences'));
const readSnapshotDocs = async () =>
  (await getDocs(collection(enforcedFirestore(), 'users', TEST_UID, 'restoreSnapshot'))).size;

describe('merge restore fault injection under enforced rules', () => {
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
  });

  it('A. reports failure when a category becomes unwritable mid-restore', async () => {
    // The category merged in step 1, then another client stages it for deletion before the
    // expense batch: `expenseCategoryAcceptsReferences` refuses every new reference.
    let failure: (Error & { code?: string }) | null = null;
    try {
      await restoreBackup(backupWithExpense('fault-a'), TEST_UID, {
        afterCategories: async () => {
          await setDoc(
            doc(otherClient(), 'users', TEST_UID, 'categories', CATEGORY.id),
            { deletionState: 'deleting', updatedAt: Date.now() },
            { merge: true },
          );
        },
      });
    } catch (error) {
      failure = error as Error & { code?: string };
    }

    expect(failure?.code).toBe('permission-denied');
    // No success was reported, no expense landed, and the category the first batch wrote stays.
    expect((await getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'fault-a'))).exists()).toBe(false);
    expect((await getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'categories', CATEGORY.id))).data()?.deletionState).toBe(
      'deleting',
    );
  });

  it('B. does not overwrite preferences another client raised after the pre-flight', async () => {
    const concurrentRevision = Date.now() + 60_000;
    let failure: Error | null = null;
    try {
      await restoreBackup(backupWithExpense('fault-b'), TEST_UID, {
        beforePreferences: async () => {
          // A legitimate concurrent preference write that lands above the restore's revision.
          await setDoc(
            doc(otherClient(), 'users', TEST_UID, 'settings', 'preferences'),
            {
              currency: 'GBP',
              locale: 'de',
              themeMode: 'dark',
              onboardingComplete: true,
              dailyReminder: false,
              reminderHour: 8,
              reminderMinute: 15,
              analyticsPeriod: 'this_month',
              monthlyBudget: 999,
              updatedAt: concurrentRevision,
            },
            { merge: true },
          );
        },
      });
    } catch (error) {
      failure = error as Error;
    }

    expect(failure).not.toBeNull();
    // The rules refused the older revision: the concurrent values survive and the caller was
    // told the restore did not finish rather than being given a half-applied success.
    const prefs = (await readPrefs()).data()!;
    expect(prefs.currency).toBe('GBP');
    expect(prefs.monthlyBudget).toBe(999);
    expect(prefs.updatedAt).toBe(concurrentRevision);
  });

  it('C. a mid-restore failure leaves no false success, no snapshot, and a clean retry', async () => {
    // Fail after the category batch committed (the shape of a lost acknowledgement: the batch
    // landed, the caller never learned it).
    await expect(
      restoreBackup(backupWithExpense('fault-c'), TEST_UID, {
        afterCategories: () => {
          throw new Error('SIMULATED_LOST_ACKNOWLEDGEMENT');
        },
      }),
    ).rejects.toThrow('SIMULATED_LOST_ACKNOWLEDGEMENT');

    // The committed category is the only trace — no expense, no preference, and (by contract)
    // no safety snapshot, because only replace writes one.
    expect((await getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'fault-c'))).exists()).toBe(false);
    expect((await readPrefs()).exists()).toBe(false);
    expect(await readSnapshotDocs()).toBe(0);

    // Retrying the same file after the "restart" completes without duplicating anything.
    await expect(restoreBackup(backupWithExpense('fault-c'), TEST_UID)).resolves.toMatchObject({ success: true });
    const rows = await getDocs(collection(enforcedFirestore(), 'users', TEST_UID, 'expenses'));
    expect(rows.size).toBe(1);
    expect(rows.docs[0].data().amount).toBe(43);
    expect((await readPrefs()).data()?.currency).toBe('EUR');
  });
});
