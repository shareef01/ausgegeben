import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
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

function recentAuthClaims(emailVerified: boolean) {
  return {
    email_verified: emailVerified,
    auth_time: Math.floor(Date.now() / 1000),
  };
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

  it('accepts a merge that carries every tolerated legacy field at once', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), categoryPath('alice', 'cat-1')), validCategory);
      await setDoc(doc(ctx.firestore(), expensePath('alice')), {
        ...validExpense,
        cloudId: 'legacy-cloud',
        categoryCloudId: 'legacy-cat',
        receiptImagePath: null,
        updatedAt: Timestamp.fromMillis(1783000216769),
      });
    });
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, expensePath('alice')), { note: 'updated' }, { merge: true }),
    );
  });

  it('rejects dateMillis as a Timestamp — only numbers are validDateMillis', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        dateMillis: Timestamp.fromMillis(Date.UTC(2024, 5, 15)),
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

  describe('expense idempotency key immutability and legacy compatibility (GO-4)', () => {
    it('accepts creating expense with legacy random ID and idempotencyKey', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
      await assertSucceeds(
        setDoc(doc(db, expensePath('alice', 'c8a2b53e-436f-47cf-8bc1-54da9d71c4c9')), {
          ...validExpense,
          idempotencyKey: 'idem-uuid-v4-client-key',
        }),
      );
    });

    it('accepts creating expense with deterministic SHA document ID and idempotencyKey', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
      await assertSucceeds(
        setDoc(doc(db, expensePath('alice', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')), {
          ...validExpense,
          idempotencyKey: 'idem-modern-client-key',
        }),
      );
    });

    it('preserves idempotencyKey on update of legacy random-ID doc, allowing note/amount updates and rejecting key changes/removals', async () => {
      const legacyDocId = 'random-legacy-uuid-1';
      const originalKey = 'original-idempotency-key-1';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const admin = ctx.firestore();
        await setDoc(doc(admin, categoryPath('alice', 'cat-1')), validCategory);
        await setDoc(doc(admin, expensePath('alice', legacyDocId)), {
          ...validExpense,
          idempotencyKey: originalKey,
        });
      });

      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      const expenseRef = doc(db, expensePath('alice', legacyDocId));

      // Ordinary note update succeeds (merge update omitting key preserves it)
      await assertSucceeds(updateDoc(expenseRef, { note: 'updated note without resending key' }));

      // Amount update succeeds if other schema rules satisfied
      await assertSucceeds(updateDoc(expenseRef, { amount: 42.50 }));

      // Explicitly preserving the same key succeeds
      await assertSucceeds(updateDoc(expenseRef, { note: 'same key', idempotencyKey: originalKey }));

      // Same document -> key change rejected
      await assertFails(updateDoc(expenseRef, { idempotencyKey: 'changed-idempotency-key' }));

      // Same document -> key removal rejected
      await assertFails(updateDoc(expenseRef, { idempotencyKey: deleteField() }));
    });

    it('allows normal update of legacy keyless doc and rejects injecting idempotencyKey on update', async () => {
      const keylessDocId = 'random-keyless-legacy-doc';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const admin = ctx.firestore();
        await setDoc(doc(admin, categoryPath('alice', 'cat-1')), validCategory);
        await setDoc(doc(admin, expensePath('alice', keylessDocId)), validExpense);
      });

      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      const expenseRef = doc(db, expensePath('alice', keylessDocId));

      // Normal update succeeds
      await assertSucceeds(updateDoc(expenseRef, { note: 'normal keyless update' }));

      // Injecting idempotencyKey on update rejected
      await assertFails(updateDoc(expenseRef, { idempotencyKey: 'injected-key-on-update' }));
    });
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
    await assertFails(deleteDoc(doc(verified, categoryPath('alice'))));
    await assertSucceeds(updateDoc(doc(verified, categoryPath('alice')), { deletionState: 'deleting' }));
    await assertSucceeds(deleteDoc(doc(verified, categoryPath('alice'))));

    const unverified = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(unverified, categoryPath('alice', 'c2')), validCategory));
  });

  it('allows normal clock skew but rejects future-pinned expense/category updatedAt values', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    const nearFuture = Date.now() + 4 * 60 * 1000;
    const farFuture = Date.now() + 10 * 60 * 1000;

    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'near')), {
      ...validCategory,
      updatedAt: nearFuture,
    }));
    await assertSucceeds(setDoc(doc(db, expensePath('alice', 'near')), {
      ...validExpense,
      categoryId: 'near',
      updatedAt: nearFuture,
    }));
    await assertFails(setDoc(doc(db, categoryPath('alice', 'far-number')), {
      ...validCategory,
      updatedAt: farFuture,
    }));
    await assertFails(setDoc(doc(db, categoryPath('alice', 'far-timestamp')), {
      ...validCategory,
      updatedAt: Timestamp.fromMillis(farFuture),
    }));
  });

  it('deletion barrier blocks new references and retargeting while legacy categories remain usable', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'active')), validCategory));
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'deleting')), {
      ...validCategory,
      deletionState: 'deleting',
    }));
    await assertFails(setDoc(doc(db, expensePath('alice', 'blocked')), {
      ...validExpense,
      categoryId: 'deleting',
    }));
    await assertSucceeds(setDoc(doc(db, expensePath('alice', 'existing')), {
      ...validExpense,
      categoryId: 'active',
    }));
    await assertFails(updateDoc(doc(db, expensePath('alice', 'existing')), { categoryId: 'deleting' }));
    await assertSucceeds(setDoc(doc(db, expensePath('alice', 'legacy-active')), {
      ...validExpense,
      categoryId: 'active',
    }));
  });

  it('allows only old-or-target expense types during a resumable category migration', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    const category = doc(db, categoryPath('alice', 'cat-1'));
    await assertSucceeds(setDoc(category, validCategory));
    await assertFails(updateDoc(category, { transactionType: 'income' }));
    await assertSucceeds(updateDoc(category, {
      migrationState: 'migrating',
      pendingTransactionType: 'income',
    }));
    await assertFails(updateDoc(category, { pendingTransactionType: 'transfer' }));
    await assertSucceeds(setDoc(doc(db, expensePath('alice', 'old')), validExpense));
    await assertSucceeds(setDoc(doc(db, expensePath('alice', 'target')), {
      ...validExpense,
      transactionType: 'income',
    }));
    await assertFails(setDoc(doc(db, expensePath('alice', 'unrelated')), {
      ...validExpense,
      transactionType: 'transfer',
    }));

    await assertSucceeds(updateDoc(category, {
      transactionType: 'income',
      migrationState: deleteField(),
      pendingTransactionType: deleteField(),
    }));
    await assertFails(setDoc(doc(db, expensePath('alice', 'old-after-finalize')), validExpense));
    await assertSucceeds(setDoc(doc(db, expensePath('alice', 'new-after-finalize')), {
      ...validExpense,
      transactionType: 'income',
    }));
  });

  it('rejects incomplete, invalid, or no-op category migration markers', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, categoryPath('alice', 'missing-target')), {
      ...validCategory,
      migrationState: 'migrating',
    }));
    await assertFails(setDoc(doc(db, categoryPath('alice', 'missing-state')), {
      ...validCategory,
      pendingTransactionType: 'income',
    }));
    await assertFails(setDoc(doc(db, categoryPath('alice', 'bad-state')), {
      ...validCategory,
      migrationState: 'done',
      pendingTransactionType: 'income',
    }));
    await assertFails(setDoc(doc(db, categoryPath('alice', 'same-type')), {
      ...validCategory,
      migrationState: 'migrating',
      pendingTransactionType: 'expense',
    }));
  });

  it('denies unverified deletes unless trusted infrastructure has marked deletion pending', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), categoryPath('alice', 'cat-1')), validCategory);
      await setDoc(doc(ctx.firestore(), expensePath('alice')), validExpense);
      await setDoc(doc(ctx.firestore(), prefsPath('alice')), validPreferences);
      await setDoc(doc(ctx.firestore(), 'users/alice/meta/dedupe'), {
        categoriesDeduped: true,
        ranAt: Date.UTC(2024, 5, 15),
      });
    });
    const unverified = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
    await assertFails(deleteDoc(doc(unverified, expensePath('alice'))));
    await assertFails(deleteDoc(doc(unverified, categoryPath('alice', 'cat-1'))));
    await assertFails(deleteDoc(doc(unverified, prefsPath('alice'))));
    await assertFails(deleteDoc(doc(unverified, 'users/alice/meta/dedupe')));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        state: 'deleting',
      });
    });
    await assertSucceeds(deleteDoc(doc(unverified, expensePath('alice'))));
    await assertSucceeds(deleteDoc(doc(unverified, categoryPath('alice', 'cat-1'))));
    await assertSucceeds(deleteDoc(doc(unverified, prefsPath('alice'))));
    await assertSucceeds(deleteDoc(doc(unverified, 'users/alice/meta/dedupe')));
  });

  it('denies even a recently authenticated owner clearing the trusted deletion marker', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        wipedAt: Date.UTC(2024, 5, 15),
      });
    });
    const unverified = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
    await assertFails(deleteDoc(doc(unverified, 'users/alice/meta/accountDeletion')));
  });

  it('denies clearing the accountDeletion marker without one set', async () => {
    const unverified = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
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

  it('enforces strictly monotonic preference clocks', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    const ref = doc(db, prefsPath('alice'));
    await assertSucceeds(setDoc(ref, validPreferences));
    await assertFails(updateDoc(ref, { currency: 'USD', updatedAt: validPreferences.updatedAt - 1 }));
    await assertFails(updateDoc(ref, { currency: 'USD', updatedAt: validPreferences.updatedAt }));
    await assertSucceeds(updateDoc(ref, { currency: 'USD', updatedAt: validPreferences.updatedAt + 1 }));
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

  describe('reminder time integer validation (GO-2)', () => {
    it('accepts valid integer reminder hours and minutes within range', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      const validHours = [0, 14, 23];
      const validMinutes = [0, 30, 59];

      for (let i = 0; i < validHours.length; i++) {
        await assertSucceeds(
          setDoc(doc(db, prefsPath('alice')), {
            ...validPreferences,
            reminderHour: validHours[i],
            reminderMinute: validMinutes[i],
            updatedAt: Date.now() + i,
          }),
        );
      }
    });

    it('rejects fractional or out-of-range reminder hours', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      const invalidHours = [14.5, -1, 24];

      for (const badHour of invalidHours) {
        await assertFails(
          setDoc(doc(db, prefsPath('alice')), {
            ...validPreferences,
            reminderHour: badHour,
          }),
        );
      }
    });

    it('rejects fractional or out-of-range reminder minutes', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      const invalidMinutes = [12.25, -1, 60];

      for (const badMinute of invalidMinutes) {
        await assertFails(
          setDoc(doc(db, prefsPath('alice')), {
            ...validPreferences,
            reminderMinute: badMinute,
          }),
        );
      }
    });
  });

  it('rejects expense amounts outside the allowed range', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));
    // Both clients reject amount <= 0 before writing; the rules are the backstop.
    await assertFails(setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: -1 }));
    await assertFails(setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: 0 }));
    await assertFails(setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: 1.001 }));
    await assertSucceeds(setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: 1.23 }));
    await assertFails(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, amount: 1000000000 }),
    );
  });

  describe('money precision and cent validation (GO-1)', () => {
    it('accepts legitimate two-decimal cent values across all magnitudes', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));

      const validCentAmounts = [
        0.01,
        0.29,
        0.58,
        1.10,
        1.15,
        2.30,
        19.99,
        562955273.31,
        562955273.32,
        562955273.35,
        999999999.99,
      ];

      for (let i = 0; i < validCentAmounts.length; i++) {
        const amount = validCentAmounts[i];
        await assertSucceeds(
          setDoc(doc(db, expensePath('alice', `e-valid-${i}`)), {
            ...validExpense,
            amount,
          }),
        );
      }
    });

    it('rejects invalid sub-cent or non-positive amounts', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));

      const invalidAmounts = [
        0,
        -1,
        0.001,
        1.001,
        1.234,
        19.991,
        19.999,
        562955273.325,
      ];

      for (let i = 0; i < invalidAmounts.length; i++) {
        const amount = invalidAmounts[i];
        await assertFails(
          setDoc(doc(db, expensePath('alice', `e-invalid-${i}`)), {
            ...validExpense,
            amount,
          }),
        );
      }
    });

    /**
     * IEEE-754 spacing increases with magnitude; low-value tests alone do not
     * validate the cent rule across the permitted amount range. A deterministic
     * sweep across low, medium, large, and very large magnitudes ensures the
     * precision epsilon remains robust and prevents anyone from simplifying
     * back to exact float equality.
     */
    it('deterministic sweep across low, medium, large, and very large magnitudes', async () => {
      const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
      await assertSucceeds(setDoc(doc(db, categoryPath('alice', 'cat-1')), validCategory));

      const sweepAmounts = [
        // Low values
        0.07, 0.14, 0.28, 0.57, 0.99, 1.05, 3.14, 7.89,
        // Medium values
        12.34, 42.50, 99.95, 123.45, 999.99,
        // Large values (including powers of two)
        10485.76, 65535.99, 100000.50, 167772.16, 500000.75,
        // Very large values
        16777216.01, 33554432.25, 134217728.50, 268435456.75, 536870912.15,
        900000000.99,
      ];

      for (let i = 0; i < sweepAmounts.length; i++) {
        const amount = sweepAmounts[i];
        await assertSucceeds(
          setDoc(doc(db, expensePath('alice', `e-sweep-${i}`)), {
            ...validExpense,
            amount,
          }),
        );
      }
    });
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

  it('allows only a valid deletion marker after recent reauthentication', async () => {
    const db = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        state: 'deleting',
        startedAt: Date.now(),
      }),
    );
    await assertFails(setDoc(doc(db, 'users/alice/meta/accountDeletion'), {
      pendingDeletion: false,
      state: 'deleting',
      startedAt: Date.now(),
    }));
  });

  it('rejects preference clocks more than five minutes ahead', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), {
        ...validPreferences,
        updatedAt: Date.now() + 6 * 60 * 1000,
      }),
    );
  });

  it('rejects deletion markers from stale or missing-auth_time sessions', async () => {
    const missing = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    const stale = testEnv.authenticatedContext('alice', {
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000) - 301,
    }).firestore();

    await assertFails(setDoc(doc(missing, 'users/alice/meta/accountDeletion'), {
      pendingDeletion: true,
      state: 'deleting',
      startedAt: Date.now(),
    }));
    await assertFails(setDoc(doc(stale, 'users/alice/meta/accountDeletion'), {
      pendingDeletion: true,
      state: 'deleting',
      startedAt: Date.now(),
    }));
  });

  it('freezes creates and updates from a second client while deletion is pending', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, categoryPath('alice', 'cat-1')), validCategory);
      await setDoc(doc(admin, expensePath('alice', 'existing')), validExpense);
      await setDoc(doc(admin, prefsPath('alice')), validPreferences);
      await setDoc(doc(admin, 'users/alice/meta/dedupe'), {
        categoriesDeduped: true,
        ranAt: Date.UTC(2024, 5, 15),
      });
    });

    const deletingClient = testEnv.authenticatedContext('alice', recentAuthClaims(true)).firestore();
    const secondClient = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/meta/accountDeletion'), {
        pendingDeletion: true,
        state: 'deleting',
      });
    });

    await assertFails(setDoc(doc(secondClient, categoryPath('alice', 'new-cat')), validCategory));
    await assertFails(updateDoc(doc(secondClient, categoryPath('alice', 'cat-1')), { name: 'raced' }));
    await assertFails(setDoc(doc(secondClient, expensePath('alice', 'raced')), validExpense));
    await assertFails(updateDoc(doc(secondClient, expensePath('alice', 'existing')), { note: 'raced' }));
    await assertFails(updateDoc(doc(secondClient, prefsPath('alice')), { currency: 'USD' }));
    await assertFails(updateDoc(doc(secondClient, 'users/alice/meta/dedupe'), {
      categoriesDeduped: false,
    }));
    await assertFails(updateDoc(doc(deletingClient, 'users/alice/meta/accountDeletion'), {
      pendingDeletion: false,
    }));

    // A stale second client cannot remove the lock to reopen its own write race.
    await assertFails(deleteDoc(doc(secondClient, 'users/alice/meta/accountDeletion')));
    // No client, including the one that reauthenticated, can reopen writes mid-wipe.
    await assertFails(deleteDoc(doc(deletingClient, 'users/alice/meta/accountDeletion')));
    await assertFails(updateDoc(doc(secondClient, categoryPath('alice', 'cat-1')), {
      name: 'still frozen',
    }));
  });

  describe('account deletion timestamp window and lifecycle (GO-3)', () => {
    it('allows deletion marker within valid time window (current, -4m, +30s)', async () => {
      const db = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
      const markerRef = doc(db, 'users/alice/meta/accountDeletion');

      // A. Approximately current server time -> ALLOW
      await assertSucceeds(
        setDoc(markerRef, {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now(),
        }),
      );

      // B. Approximately 4 minutes in the past -> ALLOW
      await assertSucceeds(
        setDoc(markerRef, {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now() - 240_000,
        }),
      );

      // E. Approximately +30 seconds in the future -> ALLOW
      await assertSucceeds(
        setDoc(markerRef, {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now() + 30_000,
        }),
      );
    });

    it('rejects deletion marker outside valid time window (stale startedAt=1, -10m, +2m)', async () => {
      const db = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
      const markerRef = doc(db, 'users/alice/meta/accountDeletion');

      // C. startedAt = 1 -> DENY
      await assertFails(
        setDoc(markerRef, {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: 1,
        }),
      );

      // D. Approximately 10 minutes in the past -> DENY
      await assertFails(
        setDoc(markerRef, {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now() - 600_000,
        }),
      );

      // F. Approximately +2 minutes in the future -> DENY
      await assertFails(
        setDoc(markerRef, {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now() + 120_000,
        }),
      );
    });

    it('enforces recent authentication requirement on deletion marker', async () => {
      const freshAuth = testEnv.authenticatedContext('alice', recentAuthClaims(false)).firestore();
      const staleAuth = testEnv.authenticatedContext('alice', {
        email_verified: false,
        auth_time: Math.floor(Date.now() / 1000) - 301,
      }).firestore();
      const markerRef = 'users/alice/meta/accountDeletion';

      await assertFails(
        setDoc(doc(staleAuth, markerRef), {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now(),
        }),
      );
      await assertSucceeds(
        setDoc(doc(freshAuth, markerRef), {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now(),
        }),
      );
    });

    it('enforces post-tombstone lifecycle: freeze mutations, allow cleanup delete, deny tombstone delete', async () => {
      // Seed category and existing expense with rules disabled
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const admin = ctx.firestore();
        await setDoc(doc(admin, categoryPath('alice', 'cat-1')), validCategory);
        await setDoc(doc(admin, expensePath('alice', 'existing')), validExpense);
        await setDoc(doc(admin, 'users/alice/meta/accountDeletion'), {
          pendingDeletion: true,
          state: 'deleting',
          startedAt: Date.now(),
        });
      });

      const client = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();

      // H. Expense create & update -> DENY
      await assertFails(setDoc(doc(client, expensePath('alice', 'new-exp')), validExpense));
      await assertFails(updateDoc(doc(client, expensePath('alice', 'existing')), { note: 'modified' }));

      // I. Expense delete -> ALLOW where cleanup requires it
      await assertSucceeds(deleteDoc(doc(client, expensePath('alice', 'existing'))));

      // J. Tombstone client delete -> DENY
      await assertFails(deleteDoc(doc(client, 'users/alice/meta/accountDeletion')));
    });
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
    await assertSucceeds(
      setDoc(
        doc(db, 'users/alice/meta/dedupe'),
        { orphansScannedAt: Date.now(), orphanRepairScanTruncated: true },
        { merge: true },
      ),
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
    await assertFails(setDoc(doc(db, 'users/alice/meta/dedupe'), { ranAt: Date.now() }));
  });

  /**
   * `orphanScanVersion` records *which* sweep ran, not merely that one did. Gating on the
   * presence of `orphansScannedAt` alone is what made a shipped orphan repair permanently
   * unrunnable: the marker was already set on every account that had cold-started.
   */
  it('accepts a bounded orphanScanVersion on the dedupe marker', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/meta/dedupe'), {
        orphansScannedAt: Date.now(),
        orphanScanVersion: 1,
      }),
    );
    await assertSucceeds(
      setDoc(
        doc(db, 'users/alice/meta/dedupe'),
        { orphansScannedAt: Date.now(), orphanScanVersion: 0 },
        { merge: true },
      ),
    );
  });

  it('rejects an orphanScanVersion that is not a bounded integer', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    for (const bad of ['1', -1, 1_000_000, 1.5, null]) {
      await assertFails(
        setDoc(doc(db, 'users/alice/meta/dedupe'), {
          orphansScannedAt: Date.now(),
          orphanScanVersion: bad,
        }),
      );
    }
  });

  it('rejects unknown subcollections under the user document', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, 'users/alice/audit/entry1'), { anything: true }));
    await assertFails(getDoc(doc(db, 'users/alice/audit/entry1')));
  });

  /**
   * Cross-user isolation is the one property whose failure would be catastrophic
   * rather than merely wrong, and for a long time its entire coverage was a single
   * assertion: bob reading one of alice's expenses. Every rule is rooted at
   * isOwner(userId), so this holds by construction — but "holds by construction"
   * is exactly what the audit history of this project keeps disproving, and a
   * future rule that reads a uid from document data instead of the path segment
   * would leave that one assertion still green.
   *
   * So: every subcollection, every operation, foreign UID, all denied.
   */
  describe('cross-user isolation', () => {
    const foreignTargets = [
      {
        label: 'expenses',
        collectionPath: 'users/alice/expenses',
        docPath: 'users/alice/expenses/e1',
        seed: validExpense,
        update: { note: 'edited by bob' },
      },
      {
        label: 'categories',
        collectionPath: 'users/alice/categories',
        docPath: 'users/alice/categories/c1',
        seed: validCategory,
        update: { name: 'renamed by bob' },
      },
      {
        label: 'settings/preferences',
        collectionPath: 'users/alice/settings',
        docPath: 'users/alice/settings/preferences',
        seed: validPreferences,
        update: { currency: 'USD' },
      },
      {
        label: 'meta/dedupe',
        collectionPath: 'users/alice/meta',
        docPath: 'users/alice/meta/dedupe',
        seed: { categoriesDeduped: true, ranAt: Date.UTC(2024, 5, 15) },
        update: { categoriesDeduped: false },
      },
      /**
       * The most dangerous cell in this table. validAccountDeletion() deliberately
       * does not require email verification, and writing pendingDeletion: true is
       * what unlocks canDeleteOwned() on every other subcollection. If a foreign
       * user could write this document, they could arm deletion of someone else's
       * data and then delete it.
       */
      {
        label: 'meta/accountDeletion',
        collectionPath: 'users/alice/meta',
        docPath: 'users/alice/meta/accountDeletion',
        seed: { pendingDeletion: true, wipedAt: Date.UTC(2024, 5, 15) },
        update: { pendingDeletion: false },
      },
    ];

    for (const target of foreignTargets) {
      it(`denies a foreign user every operation on alice's ${target.label}`, async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          const admin = ctx.firestore();
          // cat-1 satisfies the exists() check that expense writes depend on, so a
          // denial here can only come from ownership, not from a missing category.
          await setDoc(doc(admin, categoryPath('alice', 'cat-1')), validCategory);
          await setDoc(doc(admin, target.docPath), target.seed);
        });

        const bob = testEnv.authenticatedContext('bob', { email_verified: true }).firestore();

        await assertFails(getDoc(doc(bob, target.docPath)));
        await assertFails(getDocs(collection(bob, target.collectionPath)));
        await assertFails(updateDoc(doc(bob, target.docPath), target.update));
        await assertFails(deleteDoc(doc(bob, target.docPath)));
      });
    }

    it('denies a foreign user creating new documents in alice namespace', async () => {
      const bob = testEnv.authenticatedContext('bob', recentAuthClaims(true)).firestore();
      await assertFails(setDoc(doc(bob, 'users/alice/expenses/planted'), validExpense));
      await assertFails(setDoc(doc(bob, 'users/alice/categories/planted'), validCategory));
      await assertFails(setDoc(doc(bob, 'users/alice/settings/preferences'), validPreferences));
      await assertFails(
        setDoc(doc(bob, 'users/alice/meta/accountDeletion'), {
          pendingDeletion: true,
          wipedAt: Date.now(),
        }),
      );
    });

    /**
     * An unverified foreign user is the cheapest attacker to become: sign up with
     * any address and never confirm it. meta/accountDeletion is the one document
     * that does not require verification, so it must still be ownership-gated.
     */
    it('denies an unverified foreign user the same operations', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users/alice/meta/accountDeletion'), {
          pendingDeletion: false,
          wipedAt: Date.UTC(2024, 5, 15),
        });
      });

      const bob = testEnv.authenticatedContext('bob', { email_verified: false }).firestore();
      await assertFails(
        setDoc(doc(bob, 'users/alice/meta/accountDeletion'), {
          pendingDeletion: true,
          wipedAt: Date.now(),
        }),
      );
      await assertFails(getDoc(doc(bob, 'users/alice/meta/accountDeletion')));
      await assertFails(deleteDoc(doc(bob, 'users/alice/expenses/e1')));
    });

    /**
     * Arming deletion on your own account must not widen anything on anyone
     * else's — canDeleteOwned() reads the marker under the *path's* uid, so bob's
     * own pending deletion must not authorise deletes in alice's namespace.
     */
    it('does not let a foreign user borrow their own pendingDeletion marker', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const admin = ctx.firestore();
        await setDoc(doc(admin, categoryPath('alice', 'cat-1')), validCategory);
        await setDoc(doc(admin, expensePath('alice')), validExpense);
      });

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users/bob/meta/accountDeletion'), {
          pendingDeletion: true,
          state: 'deleting',
        });
      });
      const bob = testEnv.authenticatedContext('bob', recentAuthClaims(true)).firestore();
      await assertFails(deleteDoc(doc(bob, expensePath('alice'))));
      await assertFails(deleteDoc(doc(bob, categoryPath('alice', 'cat-1'))));
    });
  });
});
