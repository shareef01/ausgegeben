import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import {
  emulatorFirestore,
  resetHarness,
  signInTestUser,
  signOutTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';

// Point the repository's Firestore accessor at the emulator instance. Imported
// lazily inside the factory because vi.mock is hoisted above the imports above.
vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository, UNCATEGORIZED_ID } = await import('@/repositories/expenseRepository');

type CategorySeed = {
  id: string;
  name: string;
  transactionType?: 'expense' | 'income' | 'transfer';
  sortOrder?: number;
};

function catCol() {
  return collection(emulatorFirestore(), 'users', TEST_UID, 'categories');
}

function expCol() {
  return collection(emulatorFirestore(), 'users', TEST_UID, 'expenses');
}

async function seedCategory({
  id,
  name,
  transactionType = 'expense',
  sortOrder = 0,
}: CategorySeed): Promise<void> {
  await setDoc(doc(catCol(), id), {
    id,
    name,
    iconName: 'shopping_cart',
    colorInt: -2345678,
    transactionType,
    sortOrder,
    updatedAt: Date.now(),
  });
}

async function seedExpense(id: string, categoryId: string, amount = 10): Promise<void> {
  await setDoc(doc(expCol(), id), {
    id,
    amount,
    dateMillis: Date.UTC(2026, 5, 15),
    categoryId,
    note: 'seeded',
    transactionType: 'expense',
    updatedAt: Date.now(),
  });
}

async function categoryIds(): Promise<string[]> {
  return (await getDocs(catCol())).docs.map((d) => d.id).sort();
}

async function categoryIdOf(expenseId: string): Promise<string | undefined> {
  const snap = await getDoc(doc(expCol(), expenseId));
  return snap.data()?.categoryId as string | undefined;
}

beforeAll(startHarness, 60_000);
afterAll(stopHarness);
beforeEach(async () => {
  await resetHarness();
  signInTestUser();
});

describe('insertExpense', () => {
  const draft = {
    amount: 12.345,
    dateMillis: Date.UTC(2026, 5, 15),
    categoryId: 'cat-1',
    note: '  coffee  ',
    transactionType: 'expense' as const,
  };

  beforeEach(async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
  });

  it('rounds the amount and trims the note', async () => {
    const id = await expenseRepository.insertExpense(draft);

    const saved = (await getDoc(doc(expCol(), id))).data();
    expect(saved?.amount).toBe(12.35);
    expect(saved?.note).toBe('coffee');
  });

  // The whole point of the key: a retried save must not become a second transaction.
  it('collapses a repeated idempotency key onto one document', async () => {
    const first = await expenseRepository.insertExpense(draft, 'key-abc');
    const second = await expenseRepository.insertExpense(draft, 'key-abc');

    expect(second).toBe(first);
    expect((await getDocs(expCol())).size).toBe(1);
  });

  it('treats different keys as different transactions', async () => {
    await expenseRepository.insertExpense(draft, 'key-1');
    await expenseRepository.insertExpense(draft, 'key-2');

    expect((await getDocs(expCol())).size).toBe(2);
  });

  it('creates a separate row each time when no key is supplied', async () => {
    await expenseRepository.insertExpense(draft);
    await expenseRepository.insertExpense(draft);

    expect((await getDocs(expCol())).size).toBe(2);
  });

  it('refuses to write for an unverified account', async () => {
    signInTestUser(false);

    await expect(expenseRepository.insertExpense(draft)).rejects.toThrow('EMAIL_NOT_VERIFIED');
    expect((await getDocs(expCol())).size).toBe(0);
  });

  it('throws when signed out', async () => {
    signOutTestUser();

    await expect(expenseRepository.insertExpense(draft)).rejects.toThrow('Not signed in');
  });
});

describe('deleteCategory', () => {
  it('moves linked expenses to the uncategorized sentinel before deleting', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    await seedExpense('e1', 'cat-1');
    await seedExpense('e2', 'cat-1');

    await expenseRepository.deleteCategory('cat-1');

    expect(await categoryIdOf('e1')).toBe(UNCATEGORIZED_ID);
    expect(await categoryIdOf('e2')).toBe(UNCATEGORIZED_ID);
    expect(await categoryIds()).toEqual([UNCATEGORIZED_ID]);
  });

  it('does not create the sentinel when nothing is linked', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });

    await expenseRepository.deleteCategory('cat-1');

    expect(await categoryIds()).toEqual([]);
  });

  it('leaves other categories and their expenses untouched', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    await seedCategory({ id: 'cat-2', name: 'Transport', sortOrder: 1 });
    await seedExpense('e1', 'cat-1');
    await seedExpense('e2', 'cat-2');

    await expenseRepository.deleteCategory('cat-1');

    expect(await categoryIdOf('e2')).toBe('cat-2');
    expect(await categoryIds()).toContain('cat-2');
  });

  // Legacy Android rows stored categoryId as a number; Firestore equality is
  // type-sensitive, so a string-only query would silently miss them.
  it('finds legacy numeric categoryIds when reassigning', async () => {
    await seedCategory({ id: '7', name: 'Legacy' });
    await setDoc(doc(expCol(), 'legacy'), {
      id: 'legacy',
      amount: 5,
      dateMillis: Date.UTC(2026, 5, 15),
      categoryId: 7,
      note: 'numeric id',
      transactionType: 'expense',
      updatedAt: Date.now(),
    });

    await expenseRepository.deleteCategory('7');

    expect(await categoryIdOf('legacy')).toBe(UNCATEGORIZED_ID);
  });
});

describe('deduplicateCategories', () => {
  it('merges same name and type onto the lowest sortOrder and moves its expenses', async () => {
    await seedCategory({ id: 'keep', name: 'Groceries', sortOrder: 0 });
    await seedCategory({ id: 'dup', name: 'groceries', sortOrder: 5 });
    await seedExpense('e1', 'dup');

    await expenseRepository.deduplicateCategories();

    expect(await categoryIdOf('e1')).toBe('keep');
    expect(await categoryIds()).toEqual(['keep']);
  });

  it('keeps categories that share a name but differ in type', async () => {
    await seedCategory({ id: 'spend', name: 'Refunds', transactionType: 'expense' });
    await seedCategory({ id: 'earn', name: 'Refunds', transactionType: 'income' });

    await expenseRepository.deduplicateCategories();

    expect(await categoryIds()).toEqual(['earn', 'spend']);
  });

  it('leaves distinct categories alone', async () => {
    await seedCategory({ id: 'a', name: 'Groceries' });
    await seedCategory({ id: 'b', name: 'Transport', sortOrder: 1 });

    await expenseRepository.deduplicateCategories();

    expect(await categoryIds()).toEqual(['a', 'b']);
  });

  it('repairs expenses whose category no longer exists', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    await seedExpense('orphan', 'vanished-category');

    await expenseRepository.deduplicateCategories();

    expect(await categoryIdOf('orphan')).toBe(UNCATEGORIZED_ID);
  });

  // Orphan repair commits in chunks of 450; a single chunk would silently drop
  // everything past the Firestore batch limit.
  it('repairs more orphans than fit in one batch', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    const total = 460;
    for (let start = 0; start < total; start += 400) {
      const batch = writeBatch(emulatorFirestore());
      for (let i = start; i < Math.min(start + 400, total); i++) {
        batch.set(doc(expCol(), `orphan-${i}`), {
          id: `orphan-${i}`,
          amount: 1,
          dateMillis: Date.UTC(2026, 5, 15),
          categoryId: 'vanished-category',
          note: 'bulk',
          transactionType: 'expense',
          updatedAt: Date.now(),
        });
      }
      await batch.commit();
    }

    await expenseRepository.deduplicateCategories();

    const remaining = (await getDocs(expCol())).docs.filter(
      (d) => d.data().categoryId === 'vanished-category',
    );
    expect(remaining).toHaveLength(0);
  });
});

describe('deleteAllUserData', () => {
  it('clears every expense and category past the batch limit', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    const total = 420;
    const batch = writeBatch(emulatorFirestore());
    for (let i = 0; i < total; i++) {
      batch.set(doc(expCol(), `e-${i}`), {
        id: `e-${i}`,
        amount: 1,
        dateMillis: Date.UTC(2026, 5, 15),
        categoryId: 'cat-1',
        note: 'bulk',
        transactionType: 'expense',
        updatedAt: Date.now(),
      });
    }
    await batch.commit();

    await expenseRepository.deleteAllUserData();

    expect((await getDocs(expCol())).size).toBe(0);
    expect((await getDocs(catCol())).size).toBe(0);
  });
});

describe('account deletion marker', () => {
  it('round-trips pending state and can be cleared again', async () => {
    expect(await expenseRepository.isAccountDeletionPending()).toBe(false);

    await expenseRepository.markAccountDeletionPending();
    expect(await expenseRepository.isAccountDeletionPending()).toBe(true);

    await expenseRepository.clearAccountDeletionPending();
    expect(await expenseRepository.isAccountDeletionPending()).toBe(false);
  });

  // The guard that stops a half-deleted account from looking like a fresh one.
  it('refuses to seed while a deletion is pending', async () => {
    await expenseRepository.markAccountDeletionPending();

    await expenseRepository.ensureSeeded();

    expect(await categoryIds()).toEqual([]);
  });

  it('seeds defaults once the marker is cleared', async () => {
    await expenseRepository.markAccountDeletionPending();
    await expenseRepository.clearAccountDeletionPending();

    await expenseRepository.ensureSeeded();

    expect((await categoryIds()).length).toBeGreaterThan(0);
  });
});

describe('ensureSeeded', () => {
  it('does not re-seed when categories already exist', async () => {
    await seedCategory({ id: 'only', name: 'Groceries' });

    await expenseRepository.ensureSeeded();

    expect(await categoryIds()).toContain('only');
    expect((await categoryIds()).length).toBe(1);
  });

  it('does nothing for an unverified account', async () => {
    signInTestUser(false);

    await expenseRepository.ensureSeeded();

    expect(await categoryIds()).toEqual([]);
  });
});
