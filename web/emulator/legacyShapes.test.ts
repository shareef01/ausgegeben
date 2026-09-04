/**
 * Legacy document shapes, pushed through real client code against real rules.
 *
 * The gap this closes: the rules suite knows these shapes exist, and the repository
 * suite runs with rules wide open. Nothing exercised the combination — a document
 * written by an old build, mutated by today's repository, judged by today's ruleset.
 * That combination is where this project's worst bugs have lived, and every one of
 * them passed a suite whose fixtures were clean and modern:
 *
 *  - A Timestamp `updatedAt` made 44% of a real account's transactions permanently
 *    uneditable. A timestamp is not a number in rules, so requiring one rejected
 *    every legacy row — including the orphan sweep's own repair write, so the app
 *    retried the same failing mutation on every launch forever. Mutation-testing
 *    these cases showed the tolerance bites only on *partial* writes that leave
 *    updatedAt alone (reassignExpenses' `update(ref, { categoryId })`); an ordinary
 *    edit replaces it with a number and would pass either way. The reassignment
 *    tests below are the ones with teeth.
 *  - `validCategory()` not tolerating `cloudId` broke reordering outright: 12 of 17
 *    categories on that account carried it, and moveCategory touches every category
 *    in a type at once.
 *  - "Category reordering — device-verified as working" was written the same morning
 *    it was proven wrong, because the AVD's test account carried none of this drift.
 *
 * The mechanism that makes all of it bite: `hasOnly()` is evaluated against the
 * MERGED document, not the delta. Writing one field to a legacy row therefore
 * re-submits every field that row already carries, including the ones the write
 * never mentions. A narrow payload does not protect you.
 *
 * Field shapes below are the measured ones recorded in firestore.rules and
 * AGENTS.md — of 89 expenses, 22 stored `receiptImagePath` as null, 19 carried the
 * `cloudId`/`categoryCloudId` pair, 22 had a Timestamp `updatedAt` — not invented.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  rulesEnv,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from './enforcedHarness';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { enforcedFirestore: db } = await import('./enforcedHarness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository } = await import('@/repositories/expenseRepository');

const WHEN = Date.UTC(2024, 5, 15);

/** A category as builds predating the field allowlist wrote it. */
const legacyCategory = (over: Record<string, unknown> = {}) => ({
  id: 'legacy-cat',
  name: 'Lebensmittel',
  iconName: 'shopping_cart',
  colorInt: -2345678,
  transactionType: 'expense',
  sortOrder: 0,
  // The pair that broke reorder: a legacy id, and a real Timestamp where today's
  // builds write a plain number.
  cloudId: 'legacy-cloud-id-1234',
  updatedAt: Timestamp.fromMillis(WHEN),
  ...over,
});

/** An expense as those same builds wrote it. */
const legacyExpense = (over: Record<string, unknown> = {}) => ({
  id: 'legacy-exp',
  amount: 12.5,
  dateMillis: WHEN,
  categoryId: 'legacy-cat',
  note: 'Kaffee',
  transactionType: 'expense',
  updatedAt: Timestamp.fromMillis(WHEN),
  cloudId: 'exp-cloud-id-9876',
  categoryCloudId: null,
  receiptImagePath: null,
  deleted: false,
  ...over,
});

async function seed(docs: Record<string, Record<string, unknown>>): Promise<void> {
  await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(docs)) {
      await setDoc(doc(db, path), data);
    }
  });
}

const catPath = (id: string) => `users/${TEST_UID}/categories/${id}`;
const expPath = (id: string) => `users/${TEST_UID}/expenses/${id}`;

async function read(path: string) {
  return (await getDoc(doc(enforcedFirestore(), path))).data();
}

describe('legacy document shapes through client code, rules enforced', () => {
  beforeAll(async () => {
    await startEnforcedHarness();
  }, 60_000);
  afterAll(async () => {
    await stopEnforcedHarness();
  });
  beforeEach(async () => {
    await resetEnforcedHarness();
  });

  describe('expenses', () => {
    beforeEach(async () => {
      await seed({
        [catPath('legacy-cat')]: legacyCategory(),
        [expPath('legacy-exp')]: legacyExpense(),
      });
    });

    /**
     * Covers the allowlist half — cloudId, categoryCloudId, receiptImagePath, deleted
     * must all survive hasOnly() on the merged document.
     *
     * It does NOT cover the Timestamp half, which is worth knowing: updateExpense
     * writes a fresh numeric updatedAt through setDoc(merge), so the merged document
     * carries a number regardless of what was on disk. Mutation-tested — reverting
     * validUpdatedAt to `is number` leaves this case green. The Timestamp tolerance is
     * load-bearing somewhere else entirely; see the reassignment tests below.
     */
    it('edits a row carrying cloudId, null pair fields and a Timestamp updatedAt', async () => {
      await expect(
        expenseRepository.updateExpense({
          id: 'legacy-exp',
          amount: 99.99,
          dateMillis: WHEN,
          categoryId: 'legacy-cat',
          note: 'edited',
          transactionType: 'expense',
        }),
      ).resolves.not.toThrow();

      const after = await read(expPath('legacy-exp'));
      expect(after?.amount).toBe(99.99);
      expect(after?.note).toBe('edited');
    });

    /**
     * Legacy data is tolerated, never rewritten and never destroyed (AGENTS.md §2).
     * An edit must not quietly strip the fields it does not understand.
     */
    it('leaves untouched legacy fields intact after an edit', async () => {
      await expenseRepository.updateExpense({
        id: 'legacy-exp',
        amount: 1,
        dateMillis: WHEN,
        categoryId: 'legacy-cat',
        note: 'n',
        transactionType: 'expense',
      });

      const after = await read(expPath('legacy-exp'));
      expect(after?.cloudId).toBe('exp-cloud-id-9876');
      expect(after?.categoryCloudId).toBeNull();
      expect(after?.receiptImagePath).toBeNull();
      expect(after?.deleted).toBe(false);
      // updatedAt is the one legacy field an edit is supposed to replace, with a number.
      expect(typeof after?.updatedAt).toBe('number');
    });

    it('accepts categoryCloudId as a number, which some rows store instead of a string', async () => {
      await seed({ [expPath('numeric-pair')]: legacyExpense({ categoryCloudId: 4321 }) });
      await expect(
        expenseRepository.updateExpense({
          id: 'numeric-pair',
          amount: 5,
          dateMillis: WHEN,
          categoryId: 'legacy-cat',
          note: 'ok',
          transactionType: 'expense',
        }),
      ).resolves.not.toThrow();
    });

    /**
     * Firestore equality is type-sensitive, so a numeric categoryId does not match a
     * string query. Both clients query for both shapes; if that ever regresses, a
     * category delete silently strands these rows.
     */
    it('finds a row whose categoryId is a legacy number when counting a category', async () => {
      await seed({
        [catPath('7')]: legacyCategory({ id: '7', name: 'Numerisch', sortOrder: 1 }),
        [expPath('numeric-cat')]: legacyExpense({ categoryId: 7, cloudId: 'x' }),
      });
      expect(await expenseRepository.countExpensesForCategory('7')).toBe(1);
    });

    it('keeps a soft-deleted legacy row out of reads without deleting it', async () => {
      await seed({ [expPath('soft-deleted')]: legacyExpense({ deleted: true, amount: 7655 }) });

      const inRange = await expenseRepository.getExpensesInRange(WHEN - 1000, WHEN + 1000);
      expect(inRange.map((e) => e.id)).not.toContain('soft-deleted');
      // Still on disk. The app tolerates legacy data; it does not purge it.
      expect(await read(expPath('soft-deleted'))).toBeTruthy();
    });
  });

  describe('categories', () => {
    /** The reorder blocker: any write to a cloudId row was rejected outright. */
    it('reorders categories carrying cloudId and Timestamp updatedAt', async () => {
      await seed({
        [catPath('a')]: legacyCategory({ id: 'a', name: 'Alpha', sortOrder: 0 }),
        [catPath('b')]: legacyCategory({ id: 'b', name: 'Beta', sortOrder: 1 }),
        [catPath('c')]: legacyCategory({ id: 'c', name: 'Gamma', sortOrder: 2 }),
      });

      const cats = await expenseRepository.getAllCategories();
      const reordered = [cats[2], cats[0], cats[1]].map((c, i) => ({ ...c, sortOrder: i }));
      await expect(expenseRepository.updateCategoriesBatch(reordered)).resolves.not.toThrow();

      const after = await expenseRepository.getAllCategories();
      expect(after.map((c) => c.id)).toEqual(['c', 'a', 'b']);
      // Legacy fields survive the renumbering.
      expect((await read(catPath('a')))?.cloudId).toBe('legacy-cloud-id-1234');
    });

    it('renames a legacy category without stripping its cloudId', async () => {
      await seed({ [catPath('legacy-cat')]: legacyCategory({ deleted: false }) });
      const [cat] = await expenseRepository.getAllCategories();
      await expect(
        expenseRepository.updateCategory({ ...cat, name: 'Umbenannt' }),
      ).resolves.not.toThrow();

      const after = await read(catPath('legacy-cat'));
      expect(after?.name).toBe('Umbenannt');
      expect(after?.cloudId).toBe('legacy-cloud-id-1234');
      expect(after?.deleted).toBe(false);
    });

    /**
     * This is where the Timestamp tolerance actually earns its keep, and the only
     * place in this file that does.
     *
     * reassignExpenses issues `update(ref, { categoryId })` — a partial write that
     * never touches updatedAt. The merged document therefore still carries whatever
     * was on disk, so a legacy Timestamp goes to the server for judgement. Requiring
     * a number rejects it, which is precisely how the orphan sweep's own repair write
     * failed and made the app retry the same doomed mutation on every launch forever.
     *
     * Mutation-tested: reverting validUpdatedAt to `is number` fails this test and the
     * one below, and nothing else in the file. If you ever tighten that rule, these two
     * are the alarm.
     */
    it('reassigns legacy expenses to Uncategorized when their category is deleted', async () => {
      await seed({
        [catPath('legacy-cat')]: legacyCategory(),
        [expPath('legacy-exp')]: legacyExpense(),
      });

      await expenseRepository.deleteCategory('legacy-cat');

      const after = await read(expPath('legacy-exp'));
      expect(after?.categoryId).toBe('0');
      expect(after?.cloudId).toBe('exp-cloud-id-9876');
      expect(await read(catPath('legacy-cat'))).toBeUndefined();
    });
  });

  /**
   * Three documents with no core fields at all exist on the real account and are
   * deliberately left alone (AGENTS.md §2). They can never satisfy validExpense, so
   * the contract is that they are inert — skipped by reads, and unable to take a
   * healthy batch down with them.
   */
  describe('the inert documents', () => {
    it('are ignored by reads rather than crashing them', async () => {
      await seed({
        [catPath('legacy-cat')]: legacyCategory(),
        [expPath('healthy')]: legacyExpense({ id: 'healthy' }),
        [expPath('inert-1')]: { cloudId: 'nothing-else-at-all' },
        [expPath('inert-2')]: {},
      });

      const all = await expenseRepository.getAllExpensesCapped(100);
      expect(all.items.map((e) => e.id)).toContain('healthy');
      // They come back (nothing filters them), but reading them must not throw.
      expect(all.items.length).toBeGreaterThanOrEqual(1);
    });

    it('cannot block a category delete that has healthy rows to reassign', async () => {
      await seed({
        [catPath('doomed')]: legacyCategory({ id: 'doomed', name: 'Doomed' }),
        [expPath('healthy-a')]: legacyExpense({ id: 'healthy-a', categoryId: 'doomed' }),
        [expPath('healthy-b')]: legacyExpense({ id: 'healthy-b', categoryId: 'doomed' }),
        // Same categoryId, but the rules will refuse any update to it.
        [expPath('inert')]: { categoryId: 'doomed' },
      });

      await expenseRepository.deleteCategory('doomed');

      // The batch containing the inert row fails; the per-document retry lands the
      // healthy ones anyway. Before that fallback existed this repaired nothing.
      expect((await read(expPath('healthy-a')))?.categoryId).toBe('0');
      expect((await read(expPath('healthy-b')))?.categoryId).toBe('0');
    });
  });
});
