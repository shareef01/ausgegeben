/**
 * AUD-006 adversarial coverage: the restore's expense revision reconciliation.
 *
 * Every test states its expected outcome first. The rule under test is narrow — a merge
 * restore re-stamps `updatedAt`, `firestore.rules` refuses a revision older than the stored
 * row, and `validUpdatedAt` accepts a stored row up to five minutes ahead of this device's
 * clock — so the suite is mostly about proving the retry cannot do *more* than that: it must
 * not bypass authorization, must not swallow unrelated refusals, must not loop, and must not
 * advance a row that no legal write can exceed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
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
  type BackupExpense,
} from '@/services/backupFormat';
import {
  RESTORE_REVISION_MAX_LEAD_MS,
  commitRestoredExpenses,
} from '@/services/restoreExpenseBatch';

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

function expense(overrides: Partial<BackupExpense> & Pick<BackupExpense, 'id'>): BackupExpense {
  return {
    amount: 10,
    dateMillis: 1_700_000_000_000,
    categoryId: CATEGORY.id,
    note: 'Row',
    transactionType: 'expense',
    ...overrides,
  };
}

function backup(expenses: BackupExpense[], categories = [CATEGORY]): AusgegebenBackup {
  return {
    format: BACKUP_FORMAT_IDENTIFIER,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-10-01T00:00:00.000Z',
    appVersion: '2.1.9',
    preferences: { currency: 'EUR', monthlyBudget: null, locale: 'en', themeMode: 'system' },
    categories,
    expenses,
    categoryBudgets: [],
    recurring: { templates: [], receipts: [] },
  };
}

async function seedExpense(id: string, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', id), {
    amount: 42,
    dateMillis: 1_700_000_000_000,
    categoryId: CATEGORY.id,
    note: 'Stored',
    transactionType: 'expense',
    ...data,
  });
}

const readExpense = (id: string) =>
  getDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', id));

/**
 * A refusal, however the SDK words it: transactions report `PERMISSION_DENIED`, plain reads
 * report `false for 'get' @ L602`, and a wrapped error carries `permission-denied`.
 */
const DENIED = /PERMISSION_DENIED|permission-denied|false for '/;

describe('restore expense revision reconciliation under enforced rules', () => {
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

  it('A. steps over a stored revision four minutes ahead, and only that row', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('ahead', { updatedAt: ahead, amount: 42 });
    await seedExpense('plain-1', { updatedAt: Date.now() - 60_000, amount: 42 });
    await seedExpense('plain-2', { updatedAt: Date.now() - 60_000, amount: 42 });

    await expect(
      restoreBackup(
        backup([
          expense({ id: 'ahead', amount: 43 }),
          expense({ id: 'plain-1', amount: 43 }),
          expense({ id: 'plain-2', amount: 43 }),
        ]),
        TEST_UID,
      ),
    ).resolves.toMatchObject({ success: true });

    // The offending row was stepped just past its stored value…
    expect((await readExpense('ahead')).data()?.updatedAt).toBe(ahead + 1);
    // …and the rows that never needed it kept the plain clock revision.
    expect((await readExpense('plain-1')).data()?.updatedAt).toBeLessThan(ahead);
    expect((await readExpense('plain-2')).data()?.updatedAt).toBeLessThan(ahead);
    for (const id of ['ahead', 'plain-1', 'plain-2']) {
      expect((await readExpense(id)).data()?.amount).toBe(43);
    }
  });

  it('B. steps over a revision close to the boundary but still inside the window', async () => {
    // 290s ahead: still steppable, because the retry margin stops at 295s.
    const nearBoundary = Date.now() + 290_000;
    await seedExpense('near', { updatedAt: nearBoundary, amount: 42 });

    await restoreBackup(backup([expense({ id: 'near', amount: 43 })]), TEST_UID);

    const stored = (await readExpense('near')).data()!;
    expect(stored.amount).toBe(43);
    expect(stored.updatedAt).toBe(nearBoundary + 1);
  });

  it('C. refuses a revision no legal write can exceed, without writing the row', async () => {
    // 299s ahead leaves no room: stepping to 299s+1ms would still be inside the rules'
    // five-minute window, but the retry margin (295s) refuses to gamble on a clock offset.
    const unwritable = Date.now() + 299_000;
    await seedExpense('unwritable', { updatedAt: unwritable, amount: 42 });

    await expect(restoreBackup(backup([expense({ id: 'unwritable', amount: 43 })]), TEST_UID)).rejects.toThrow(
      'EXPENSE_REVISION_UNWRITABLE',
    );

    const stored = (await readExpense('unwritable')).data()!;
    expect(stored.amount).toBe(42);
    expect(stored.updatedAt).toBe(unwritable);
  });

  it('D. reads and steps over a legacy Firestore Timestamp revision', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('legacy-stamp', { updatedAt: Timestamp.fromMillis(ahead), amount: 42 });
    // The seed really is a Timestamp, not a number.
    const seeded = (await readExpense('legacy-stamp')).data()!;
    expect(typeof seeded.updatedAt).toBe('object');
    expect((seeded.updatedAt as Timestamp).toMillis()).toBe(ahead);

    await restoreBackup(backup([expense({ id: 'legacy-stamp', amount: 43 })]), TEST_UID);

    const stored = (await readExpense('legacy-stamp')).data()!;
    expect(stored.amount).toBe(43);
    expect(stored.updatedAt).toBe(ahead + 1);
  });

  it('E. cannot read or reach another account\'s expenses', async () => {
    const otherUid = 'other-account';
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const raw = ctx.firestore();
      await setDoc(doc(raw, 'users', otherUid, 'categories', CATEGORY.id), CATEGORY);
      await setDoc(doc(raw, 'users', otherUid, 'expenses', 'foreign'), {
        amount: 42,
        dateMillis: 1_700_000_000_000,
        categoryId: CATEGORY.id,
        note: 'Foreign',
        transactionType: 'expense',
        updatedAt: Date.now() + 240_000,
      });
    });

    // Reading the foreign document is denied…
    await expect(getDoc(doc(enforcedFirestore(), 'users', otherUid, 'expenses', 'foreign'))).rejects.toThrow(
      DENIED,
    );

    // …and a restore into this account neither sees nor touches it.
    await restoreBackup(backup([expense({ id: 'own', amount: 43 })]), TEST_UID);
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const foreign = await getDoc(doc(ctx.firestore(), 'users', otherUid, 'expenses', 'foreign'));
      expect(foreign.exists()).toBe(true);
      expect(foreign.data()?.amount).toBe(42);
    });
  });

  it('F. reports an unrelated authorization refusal as itself, not as clock skew', async () => {
    // The expense points at a category that exists neither in the file nor in Firestore, so
    // `exists(categories/{id})` fails and no revision dance can change that.
    let failure: (Error & { code?: string }) | null = null;
    try {
      await restoreBackup(backup([expense({ id: 'orphan', categoryId: 'ghost', amount: 43 })]), TEST_UID);
    } catch (error) {
      failure = error as Error & { code?: string };
    }
    expect(failure?.code).toBe('permission-denied');
    expect(failure?.message).not.toContain('EXPENSE_REVISION_UNWRITABLE');
    expect((await readExpense('orphan')).exists()).toBe(false);
  });

  it('G. refuses before writing when the category is mid-deletion or mid-migration', async () => {
    await updateDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'categories', CATEGORY.id), {
      deletionState: 'deleting',
      updatedAt: Date.now(),
    });

    await expect(restoreBackup(backup([expense({ id: 'blocked', amount: 43 })]), TEST_UID)).rejects.toThrow(
      'CATEGORY_BUSY',
    );
    expect((await readExpense('blocked')).exists()).toBe(false);
  });

  it('H. writes nothing while an account-deletion tombstone is armed', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('frozen', { updatedAt: ahead, amount: 42 });
    // Armed after the row exists: the tombstone freezes every later client write.
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', TEST_UID, 'meta', 'accountDeletion'), {
        pendingDeletion: true,
        state: 'deleting',
        startedAt: Date.now(),
      });
    });

    await expect(restoreBackup(backup([expense({ id: 'frozen', amount: 43 })]), TEST_UID)).rejects.toThrow(
      DENIED,
    );

    // The tombstone froze every write: the row and its revision are untouched, and no
    // retry resurrected it.
    const stored = (await readExpense('frozen')).data()!;
    expect(stored.amount).toBe(42);
    expect(stored.updatedAt).toBe(ahead);
  });

  it('I. keeps a legitimate idempotencyKey while stepping over the revision', async () => {
    const ahead = Date.now() + 240_000;
    const key = 'recurring-identity-key';
    // The rules only accept an update that still carries an idempotencyKey when it is an exact
    // creation replay, so the file's values must match the stored ones — which is exactly what a
    // backup of that row contains.
    await seedExpense('keyed', { updatedAt: ahead, amount: 42, note: 'Row', idempotencyKey: key });

    await restoreBackup(backup([expense({ id: 'keyed', amount: 42 })]), TEST_UID);

    const stored = (await readExpense('keyed')).data()!;
    expect(stored.idempotencyKey).toBe(key);
    expect(stored.note).toBe('Row');
    expect(stored.updatedAt).toBe(ahead + 1);
  });

  it('J. applies the backup amount over a row whose revision is ahead', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('changed', { updatedAt: ahead, amount: 42, note: 'Stored note' });

    await restoreBackup(backup([expense({ id: 'changed', amount: 77.77, note: 'Backup note' })]), TEST_UID);

    const stored = (await readExpense('changed')).data()!;
    expect(stored.amount).toBe(77.77);
    expect(stored.note).toBe('Backup note');
    expect(stored.updatedAt).toBe(ahead + 1);
  });

  it('K. fails closed when another client moves the revision between lookup and retry', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('raced', { updatedAt: ahead, amount: 42 });

    let retried = 0;
    await expect(
      commitRestoredExpenses(
        enforcedFirestore(),
        TEST_UID,
        [{ id: 'raced', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'Restore', transactionType: 'expense', id: 'raced' } }],
        {
          faultHooks: {
            beforeRetry: async () => {
              retried += 1;
              // A concurrent writer pushes the row past the revision we are about to write.
              await updateDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'raced'), {
                updatedAt: ahead + 60_000,
              });
            },
          },
        },
      ),
    ).rejects.toThrow(DENIED);

    // Exactly one retry was attempted, and it did not win: the concurrent edit stands.
    expect(retried).toBe(1);
    const stored = (await readExpense('raced')).data()!;
    expect(stored.amount).toBe(42);
    expect(stored.updatedAt).toBe(ahead + 60_000);
  });

  it('L. recreates a row deleted between lookup and retry (documented upsert semantics)', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('vanished', { updatedAt: ahead, amount: 42 });

    await commitRestoredExpenses(
      enforcedFirestore(),
      TEST_UID,
      [{ id: 'vanished', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'Restore', transactionType: 'expense', id: 'vanished' } }],
      {
        faultHooks: {
          beforeRetry: async () => {
            await deleteDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'vanished'));
          },
        },
      },
    );

    // A merge restore is an upsert by contract; a deleted row comes back from the file.
    const stored = (await readExpense('vanished')).data()!;
    expect(stored.amount).toBe(43);
    expect(stored.note).toBe('Restore');
  });

  it('M/N. an interrupted restore resumes without duplicating what it already wrote', async () => {
    // First attempt: the file references a category it does not contain and that does not
    // exist in the account, so the expense batch is refused after the (empty) category batch —
    // the exact half-restored state AUD-006 reported. The user then creates the missing
    // category and retries.
    const ghost = { ...CATEGORY, id: 'ghost-cat', name: 'Ghost' };
    const file = backup(
      [
        expense({ id: 'r-1', amount: 11, categoryId: ghost.id }),
        expense({ id: 'r-2', amount: 12, categoryId: ghost.id }),
        expense({ id: 'r-3', amount: 13, categoryId: ghost.id }),
      ],
      [],
    );
    await expect(restoreBackup(file, TEST_UID)).rejects.toThrow(DENIED);

    // No expense landed.
    expect((await getDocs(collection(enforcedFirestore(), 'users', TEST_UID, 'expenses'))).size).toBe(0);

    await setDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'categories', ghost.id), ghost);
    await expect(restoreBackup(file, TEST_UID)).resolves.toMatchObject({ success: true });
    // Re-running the same file is idempotent: three rows, not six, and every amount correct.
    await expect(restoreBackup(file, TEST_UID)).resolves.toMatchObject({ success: true });

    const rows = await getDocs(collection(enforcedFirestore(), 'users', TEST_UID, 'expenses'));
    expect(rows.size).toBe(3);
    expect(rows.docs.map((d) => d.data().amount).sort()).toEqual([11, 12, 13]);
  });

  it('never retries more than once, even when the stored revision stays ahead', async () => {
    const ahead = Date.now() + 240_000;
    await seedExpense('stubborn', { updatedAt: ahead, amount: 42 });
    // Keep pushing the revision forward on every attempt: the helper must give up, not loop.
    let attempts = 0;
    await expect(
      commitRestoredExpenses(
        enforcedFirestore(),
        TEST_UID,
        [{ id: 'stubborn', payload: { amount: 43, dateMillis: 1_700_000_000_000, categoryId: CATEGORY.id, note: 'Restore', transactionType: 'expense', id: 'stubborn' } }],
        {
          faultHooks: {
            beforeRetry: async () => {
              attempts += 1;
              await updateDoc(doc(enforcedFirestore(), 'users', TEST_UID, 'expenses', 'stubborn'), {
                updatedAt: Date.now() + RESTORE_REVISION_MAX_LEAD_MS - 10_000,
              });
            },
          },
        },
      ),
    ).rejects.toThrow(/PERMISSION_DENIED|permission-denied|EXPENSE_REVISION_UNWRITABLE/);
    expect(attempts).toBe(1);
  });
});
