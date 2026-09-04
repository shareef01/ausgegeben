import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES_PATH = resolve(process.cwd(), '../firestore.rules');
const PROJECT_ID = 'demo-ausgegeben-rules';

const validExpense = {
  amount: 12.5,
  dateMillis: Date.UTC(2024, 5, 15),
  categoryId: 'cat-1',
  note: 'coffee',
  transactionType: 'expense' as const,
};

const validCategory = {
  name: 'Groceries',
  iconName: 'shopping_cart',
  colorInt: -2345678,
  transactionType: 'expense' as const,
  sortOrder: 0,
};

const validPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  updatedAt: Date.UTC(2024, 5, 15),
};

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}, 30_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function expensePath(uid: string, id = 'e1') {
  return `users/${uid}/expenses/${id}`;
}

function categoryPath(uid: string, id = 'c1') {
  return `users/${uid}/categories/${id}`;
}

function prefsPath(uid: string) {
  return `users/${uid}/settings/preferences`;
}

describe('firestore.rules', () => {
  it('denies unauthenticated reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, expensePath('alice'))));
  });

  it('denies parent users/{uid} document access', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(setDoc(doc(db, 'users/alice'), { hack: true }));
  });

  it('allows verified owner to create a valid expense', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertSucceeds(setDoc(doc(db, expensePath('alice')), validExpense));
  });

  /**
   * Clients truncate notes to exactly 2000 chars (web slice(0,2000), Android
   * take(2000)) and category names to exactly 80 — the rule bound must be <=,
   * not <, or an at-cap value is rejected by the server with PERMISSION_DENIED
   * after passing every client-side check.
   */
  it('accepts a note of exactly 2000 characters and rejects longer', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice', 'e-cap')), { ...validExpense, note: 'n'.repeat(2000) }),
    );
    await assertFails(
      setDoc(doc(db, expensePath('alice', 'e-over')), { ...validExpense, note: 'n'.repeat(2001) }),
    );
  });

  it('accepts a category name of exactly 80 characters and rejects longer', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-80')), { ...validCategory, name: 'n'.repeat(80) }));
    await assertFails(setDoc(doc(db, categoryPath('alice', 'cat-81')), { ...validCategory, name: 'n'.repeat(81) }));
  });

  it('denies expense with unknown categoryId', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, expensePath('alice')), validExpense));
  });

  it('denies unverified owner expense writes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, expensePath('alice')), validExpense));
  });

  it('denies other users from reading owner expenses', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), categoryPath('alice', 'cat-1')), validCategory);
      await setDoc(doc(ctx.firestore(), expensePath('alice')), validExpense);
    });
    const bob = testEnv.authenticatedContext('bob', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(bob, expensePath('alice'))));
  });

  it('rejects expense docs with extra fields (hasOnly)', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, sneaky: true }),
    );
  });

  /**
   * Rows written before the field allowlist existed carry cloudId, categoryCloudId,
   * receiptImagePath and deleted. hasOnly() is evaluated against the merged
   * document, so excluding them made those rows permanently unwritable — on a real
   * account, 39 of 89 expenses, with the orphan sweep's own repair rejected too and
   * retried on every launch. They are tolerated, never required, and bounded.
   */
  it('accepts legacy expense fields so pre-allowlist rows stay writable', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        cloudId: 'legacy-123',
        categoryCloudId: 31,
        receiptImagePath: '/storage/emulated/0/receipt.jpg',
        deleted: false,
      }),
    );
  });

  /**
   * Categories came from the same legacy backend as expenses and carry the same
   * drift — cloudId, deleted, Timestamp updatedAt — just never audited for it
   * until reorder started failing live. hasOnly() sees the merged document, so
   * any update to sortOrder (what every reorder does, to every category in a
   * type) on one of these rows was rejected outright. Copied field-for-field
   * from a real account: 12 of 17 categories carry cloudId, all 12 of those
   * have a Timestamp updatedAt, one has `deleted` — an idealised fixture with
   * only `deleted` missed the other two and the first fix shipped incomplete.
   */
  it('accepts legacy category fields so old rows stay reorderable', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), categoryPath('alice', 'cat-1')), {
        ...validCategory,
        cloudId: '0efe80f2-fbf9-4c5e-9693-bbb83bf4a935',
        updatedAt: Timestamp.fromMillis(1783000216769),
        deleted: false,
      });
    });
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, categoryPath('alice', 'cat-1')), { sortOrder: 1 }, { merge: true }),
    );
  });

  /**
   * Copied field-for-field from a document that was actually stuck in a device's
   * offline queue: numeric categoryId, Timestamp updatedAt, null receiptImagePath.
   * An idealised fixture missed all three and the first fix shipped incomplete.
   */
  it('lets the orphan sweep repair a real legacy row', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), categoryPath('alice', 'cat-1')), validCategory);
      await setDoc(doc(ctx.firestore(), expensePath('alice')), {
        amount: 12.5,
        dateMillis: 1782588775295,
        categoryId: 31,
        note: 'lunch',
        transactionType: 'expense',
        updatedAt: Timestamp.fromMillis(1783000216769),
        cloudId: '087cd775-3e80-4fc7-9962-fc81e1edde0a',
        categoryCloudId: 'cd5feabd-955a-4932-a9eb-de4c23461f51',
        receiptImagePath: null,
        deleted: false,
      });
    });
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    // Exactly what repairOrphanedExpenses does: repoint categoryId, nothing else.
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice')), { categoryId: 'cat-1' }, { merge: true }),
    );
  });

  it('accepts a Timestamp updatedAt from pre-numeric builds', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        updatedAt: Timestamp.fromMillis(1783000216769),
      }),
    );
  });

  it('accepts a null receiptImagePath', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, receiptImagePath: null }),
    );
  });

  it('still bounds the legacy fields so they are not free storage', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        receiptImagePath: 'x'.repeat(600),
      }),
    );
    await assertFails(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, deleted: 'not-a-bool' }),
    );
  });

  it('still rejects unknown extra fields', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(setDoc(doc(db, expensePath('alice')), { ...validExpense, sneaky: true }));
  });

  it('rejects expense dateMillis outside allowed range', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        dateMillis: Date.UTC(1990, 0, 1),
      }),
    );
  });

  it('allows verified owner category CRUD and denies unverified create', async () => {
    const verified = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(verified, categoryPath('alice')), validCategory));
    await assertSucceeds(deleteDoc(doc(verified, categoryPath('alice'))));

    const unverified = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(unverified, categoryPath('alice', 'c2')), validCategory));
  });

  it('denies unverified deletes unless accountDeletion is pending', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), categoryPath('alice', 'cat-1')), validCategory);
      await setDoc(doc(ctx.firestore(), expensePath('alice')), validExpense);
      await setDoc(doc(ctx.firestore(), prefsPath('alice')), validPreferences);
      await setDoc(doc(ctx.firestore(), 'users/alice/meta/dedupe'), {
        categoriesDeduped: true,
        ranAt: Date.UTC(2024, 5, 15),
      });
    });
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(deleteDoc(doc(unverified, expensePath('alice'))));
    await assertFails(deleteDoc(doc(unverified, categoryPath('alice', 'cat-1'))));
    await assertFails(deleteDoc(doc(unverified, prefsPath('alice'))));
    await assertFails(deleteDoc(doc(unverified, 'users/alice/meta/dedupe')));

    await assertSucceeds(
      setDoc(doc(unverified, 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        wipedAt: Date.now(),
      }),
    );
    await assertSucceeds(deleteDoc(doc(unverified, expensePath('alice'))));
    await assertSucceeds(deleteDoc(doc(unverified, categoryPath('alice', 'cat-1'))));
    await assertSucceeds(deleteDoc(doc(unverified, prefsPath('alice'))));
    await assertSucceeds(deleteDoc(doc(unverified, 'users/alice/meta/dedupe')));
  });

  // The escape hatch for an account stranded mid-deletion (see
  // expenseRepository.clearAccountDeletionPending). It works precisely because the
  // marker being set is itself what satisfies canDeleteOwned for an unverified owner
  // — so the account can always undo a deletion that failed halfway.
  it('lets an unverified owner clear their own accountDeletion marker', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        wipedAt: Date.UTC(2024, 5, 15),
      });
    });
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertSucceeds(deleteDoc(doc(unverified, 'users/alice/meta/accountDeletion')));
  });

  it('denies clearing the accountDeletion marker without one set', async () => {
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(deleteDoc(doc(unverified, 'users/alice/meta/accountDeletion')));
  });

  it('rejects invalid analyticsPeriod values', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), {
        ...validPreferences,
        analyticsPeriod: 'not_a_period',
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, prefsPath('alice')), {
        ...validPreferences,
        analyticsPeriod: 'month:2026-07',
      }),
    );
  });

  it('denies unverified owner preferences writes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, prefsPath('alice')), validPreferences));
  });

  it('allows verified owner preferences writes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, prefsPath('alice')), validPreferences));
  });

  it('rejects invalid themeMode on preferences', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), {
        ...validPreferences,
        themeMode: 'neon_disco',
      }),
    );
  });

  it('rejects invalid locale on preferences', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), { ...validPreferences, locale: 'fr' }),
    );
  });

  it('rejects expense amounts outside the allowed range', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    // Both clients reject amount <= 0 before writing; the rules are the backstop.
    await assertFails(setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: -1 }));
    await assertFails(setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: 0 }));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: 1000000000 }),
    );
  });

  it('rejects expense whose transactionType mismatches category', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        transactionType: 'income',
      }),
    );
  });

  it('allows uncategorized sentinel to hold any transactionType', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, categoryPath('alice', '0')), {
        ...validCategory,
        name: 'Unknown',
        transactionType: 'expense',
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        categoryId: '0',
        transactionType: 'income',
      }),
    );
  });

  it('rejects far-future preferences updatedAt', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    const farFuture = Date.now() + 8 * 24 * 60 * 60 * 1000;
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), { ...validPreferences, updatedAt: farFuture }),
    );
  });

  it('rejects unsupported currency codes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), { ...validPreferences, currency: 'XXXX' }),
    );
  });

  it('rejects unknown transactionType on expenses and categories', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, transactionType: 'refund' }),
    );
    await assertFails(
      setDoc(doc(db, categoryPath('alice', 'c9')), {
        ...validCategory,
        transactionType: 'refund',
      }),
    );
  });

  it('rejects settings docs other than preferences', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/settings/somethingElse'), validPreferences),
    );
  });

  it('allows accountDeletion meta without email verification', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        wipedAt: Date.now(),
      }),
    );
  });

  it('rejects meta docs other than dedupe or accountDeletion', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/meta/somethingElse'), { categoriesDeduped: true }),
    );
  });

  it('accepts either dedupe marker field on its own', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/meta/dedupe'), { orphansScannedAt: Date.now() }),
    );
    await assertSucceeds(
      setDoc(
        doc(db, 'users/alice/meta/dedupe'),
        { categoriesDeduped: true, ranAt: Date.now() },
        { merge: true },
      ),
    );
  });

  it('accepts a versioned orphan-scan marker', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/meta/dedupe'), {
        orphansScannedAt: Date.now(),
        orphansScanVersion: 1,
      }),
    );
  });

  it('rejects dedupe markers with bad types, unknown keys, or no keys at all', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'users/alice/meta/dedupe'), { orphansScannedAt: 'yesterday' }),
    );
    await assertFails(
      setDoc(doc(db, 'users/alice/meta/dedupe'), { categoriesDeduped: 'true' }),
    );
    await assertFails(
      setDoc(doc(db, 'users/alice/meta/dedupe'), {
        categoriesDeduped: true,
        somethingElse: 1,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'users/alice/meta/dedupe'), {
        orphansScannedAt: Date.now(),
        orphansScanVersion: '1',
      }),
    );
    await assertFails(setDoc(doc(db, 'users/alice/meta/dedupe'), { ranAt: Date.now() }));
  });

  it('rejects unknown subcollections under the user document', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, 'users/alice/audit/entry1'), { anything: true }));
    await assertFails(getDoc(doc(db, 'users/alice/audit/entry1')));
  });
});
