import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from './enforcedHarness';
import { useAuthStore } from '@/services/authStore';
import { BACKUP_FORMAT_IDENTIFIER, CURRENT_BACKUP_SCHEMA_VERSION, type AusgegebenBackup } from '@/services/backupFormat';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { enforcedFirestore: db } = await import('./enforcedHarness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { restoreBackup } = await import('@/services/backupRestore');

describe('backupRestore on real Firestore emulator with rules enforced', () => {
  beforeAll(async () => {
    await startEnforcedHarness();
  });

  afterAll(async () => {
    await stopEnforcedHarness();
  });

  beforeEach(async () => {
    await resetEnforcedHarness();
    useAuthStore.setState({
      user: {
        uid: TEST_UID,
        email: 'enforced-test@example.com',
        displayName: null,
        emailVerified: true,
      },
    });
  });

  function createTestBackup(numExpenses = 2): AusgegebenBackup {
    const expenses = [];
    for (let i = 0; i < numExpenses; i++) {
      expenses.push({
        id: `exp-${i}`,
        amount: 10.5 + i,
        dateMillis: 1700000000000 + i * 1000,
        categoryId: 'cat-food',
        note: `Expense ${i}`,
        transactionType: 'expense' as const,
      });
    }

    return {
      format: BACKUP_FORMAT_IDENTIFIER,
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-10-01T00:00:00.000Z',
      appVersion: '2.0.8',
      preferences: {
        currency: 'EUR',
        monthlyBudget: 750,
        locale: 'en',
        themeMode: 'system',
      },
      categories: [
        {
          id: 'cat-food',
          name: 'Food & Dining',
          iconName: 'restaurant',
          colorInt: -16711936,
          transactionType: 'expense',
          sortOrder: 0,
        },
      ],
      expenses,
    };
  }

  it('restores categories, expenses, and preferences into empty account', async () => {
    const db = enforcedFirestore();
    const backup = createTestBackup(2);

    const result = await restoreBackup(backup, TEST_UID);
    expect(result.success).toBe(true);
    expect(result.categoriesRestored).toBe(1);
    expect(result.expensesRestored).toBe(2);
    expect(result.preferencesRestored).toBe(true);

    // Verify categories in Firestore
    const catSnap = await getDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'));
    expect(catSnap.exists()).toBe(true);
    expect(catSnap.data()?.name).toBe('Food & Dining');

    // Verify expenses in Firestore
    const exp0Snap = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    expect(exp0Snap.exists()).toBe(true);
    expect(exp0Snap.data()?.amount).toBe(10.5);
    expect(exp0Snap.data()?.note).toBe('Expense 0');

    const exp1Snap = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-1'));
    expect(exp1Snap.exists()).toBe(true);
    expect(exp1Snap.data()?.amount).toBe(11.5);

    // Verify preferences in Firestore
    const prefSnap = await getDoc(doc(db, 'users', TEST_UID, 'settings', 'preferences'));
    expect(prefSnap.exists()).toBe(true);
    expect(prefSnap.data()?.currency).toBe('EUR');
    expect(prefSnap.data()?.monthlyBudget).toBe(750);
  });

  it('repeat restore of the exact same backup is idempotent (no duplicates)', async () => {
    const db = enforcedFirestore();
    const backup = createTestBackup(3);

    // First restore
    await restoreBackup(backup, TEST_UID);

    // Second restore
    const secondResult = await restoreBackup(backup, TEST_UID);
    expect(secondResult.success).toBe(true);

    const expCol = collection(db, 'users', TEST_UID, 'expenses');
    const allExpenses = await getDocs(expCol);
    expect(allExpenses.size).toBe(3);

    const catCol = collection(db, 'users', TEST_UID, 'categories');
    const allCats = await getDocs(catCol);
    expect(allCats.size).toBe(1);
  });

  it('updates existing records with backup modifications without duplicate creation', async () => {
    const db = enforcedFirestore();
    const backup = createTestBackup(1);
    await restoreBackup(backup, TEST_UID);

    // Modify backup note and amount
    const modifiedBackup = createTestBackup(1);
    modifiedBackup.expenses[0].amount = 49.99;
    modifiedBackup.expenses[0].note = 'Updated Lunch Note';

    await restoreBackup(modifiedBackup, TEST_UID);

    const expSnap = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    expect(expSnap.exists()).toBe(true);
    expect(expSnap.data()?.amount).toBe(49.99);
    expect(expSnap.data()?.note).toBe('Updated Lunch Note');

    const allExpenses = await getDocs(collection(db, 'users', TEST_UID, 'expenses'));
    expect(allExpenses.size).toBe(1);
  });

  it('detects category transactionType conflict during pre-flight and aborts', async () => {
    const db = enforcedFirestore();
    // Seed existing category on server with transactionType: 'income'
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      id: 'cat-food',
      name: 'Existing Income',
      iconName: 'work',
      colorInt: -16711936,
      transactionType: 'income',
      sortOrder: 0,
      updatedAt: Date.now(),
    });

    // Backup has cat-food with transactionType: 'expense'
    const backup = createTestBackup(1);
    await expect(restoreBackup(backup, TEST_UID)).rejects.toThrow('CATEGORY_TYPE_CONFLICT');

    // Verify expenses were NOT written
    const expSnap = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    expect(expSnap.exists()).toBe(false);
  });

  it('aborts immediately if active session changed before execution', async () => {
    const backup = createTestBackup(1);
    await expect(restoreBackup(backup, 'different-uid')).rejects.toThrow('AUTH_ACCOUNT_CHANGED');
  });

  it('restores chunked batches (>400 expenses) across multiple writeBatch commits', async () => {
    const db = enforcedFirestore();
    const backup = createTestBackup(450); // 450 expenses crosses the 400 chunk boundary

    const result = await restoreBackup(backup, TEST_UID);
    expect(result.success).toBe(true);
    expect(result.expensesRestored).toBe(450);

    const allExpenses = await getDocs(collection(db, 'users', TEST_UID, 'expenses'));
    expect(allExpenses.size).toBe(450);
  });
});
