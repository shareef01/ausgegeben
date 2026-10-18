import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// 2026-10-18 audit: adversarial cases a raw Firebase client (public API key, own
// account) could try, plus the concurrency behaviour the clients rely on.
const UID = 'alice';
const TEMPLATE = '11111111-2222-4333-8444-555555555555';
const HEX64 = 'a'.repeat(64);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8088').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-ausgegeben-rules',
    firestore: { rules: readFileSync(resolve(process.cwd(), '../firestore.rules'), 'utf8'), host, port: Number(port) },
  });
}, 30_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

const owner = () => testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
const receipt = (overrides: Record<string, unknown> = {}) => ({
  templateId: TEMPLATE, scheduledDate: '2026-01-31', expenseId: HEX64, createdAt: 1_700_000_000_000, ...overrides,
});
const receiptPath = (date = '2026-01-31') => `users/${UID}/recurringOccurrences/${TEMPLATE}_${date}`;

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${UID}/categories/food`), {
      name: 'Food', iconName: 'x', colorInt: 1, transactionType: 'expense', sortOrder: 0, updatedAt: 1000,
    });
    await setDoc(doc(db, `users/${UID}/categories/pay`), {
      name: 'Pay', iconName: 'x', colorInt: 1, transactionType: 'income', sortOrder: 1, updatedAt: 1000,
    });
  });
});

describe('recurring occurrence receipts are immutable replay guards', () => {
  it('accepts a well-formed receipt and refuses rewriting it', async () => {
    await assertSucceeds(setDoc(doc(owner(), receiptPath()), receipt()));
    await assertFails(setDoc(doc(owner(), receiptPath()), receipt({ expenseId: 'b'.repeat(64) })));
    await assertFails(updateDoc(doc(owner(), receiptPath()), { createdAt: 1_700_000_000_001 }));
  });

  it('refuses a receipt whose document id does not encode its template and date', async () => {
    await assertFails(setDoc(doc(owner(), receiptPath('2026-02-01')), receipt()));
  });

  it('refuses a non-hash expense id, an invalid date, or a far-future createdAt', async () => {
    await assertFails(setDoc(doc(owner(), receiptPath()), receipt({ expenseId: 'not-a-hash' })));
    await assertFails(setDoc(doc(owner(), `users/${UID}/recurringOccurrences/${TEMPLATE}_2026-02-30`), receipt({ scheduledDate: '2026-02-30' })));
    await assertFails(setDoc(doc(owner(), receiptPath()), receipt({ createdAt: Date.now() + 3_600_000 })));
  });

  it('refuses deleting a receipt outside account deletion', async () => {
    await assertSucceeds(setDoc(doc(owner(), receiptPath()), receipt()));
    const db = owner();
    const batch = writeBatch(db);
    batch.delete(doc(db, receiptPath()));
    await assertFails(batch.commit());
  });
});

describe('cross-document constraints a raw client might bypass', () => {
  it('refuses a category budget on an income category', async () => {
    await assertFails(setDoc(doc(owner(), `users/${UID}/categoryBudgets/pay`), {
      monthlyLimit: 100, warningThresholdPercent: 80, updatedAt: Date.now(),
    }));
    await assertSucceeds(setDoc(doc(owner(), `users/${UID}/categoryBudgets/food`), {
      monthlyLimit: 100, warningThresholdPercent: 80, updatedAt: Date.now(),
    }));
  });

  it('refuses a lowercase or unlisted currency, matching backup validation', async () => {
    const prefs = {
      currency: 'EUR', locale: 'en', themeMode: 'system', dailyReminder: true,
      reminderHour: 19, reminderMinute: 0, analyticsPeriod: 'this_month', updatedAt: Date.now(),
    };
    await assertFails(setDoc(doc(owner(), `users/${UID}/settings/preferences`), { ...prefs, currency: 'eur' }));
    await assertFails(setDoc(doc(owner(), `users/${UID}/settings/preferences`), { ...prefs, currency: 'JPY' }));
    await assertSucceeds(setDoc(doc(owner(), `users/${UID}/settings/preferences`), prefs));
  });
});

describe('concurrent expense edits (documented limitation, not a guarantee)', () => {
  it('accepts two writes with an equal updatedAt: the later commit wins whole', async () => {
    const path = `users/${UID}/expenses/e1`;
    const base = { amount: 10, dateMillis: Date.UTC(2026, 0, 1), categoryId: 'food', note: '', transactionType: 'expense' };
    const stamp = Date.now();
    await assertSucceeds(setDoc(doc(owner(), path), { ...base, updatedAt: stamp }));
    // Device A and device B both edit with the same clock reading. The rules order
    // revisions with >=, so neither is refused; there is no field-level merge.
    await assertSucceeds(setDoc(doc(owner(), path), { ...base, note: 'device A', updatedAt: stamp }));
    await assertSucceeds(setDoc(doc(owner(), path), { ...base, amount: 12, updatedAt: stamp }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(ctx.firestore(), path));
      expect(snap.data()).toMatchObject({ amount: 12, note: '' });
    });
  });

  it('refuses an older revision arriving late (a delayed offline write)', async () => {
    const path = `users/${UID}/expenses/e2`;
    const base = { amount: 10, dateMillis: Date.UTC(2026, 0, 1), categoryId: 'food', note: '', transactionType: 'expense' };
    const stamp = Date.now();
    await assertSucceeds(setDoc(doc(owner(), path), { ...base, updatedAt: stamp }));
    await assertFails(setDoc(doc(owner(), path), { ...base, amount: 99, updatedAt: stamp - 60_000 }));
  });
});
