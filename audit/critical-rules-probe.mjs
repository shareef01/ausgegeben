import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { deleteField, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const host = '127.0.0.1';
const port = Number(process.env.AUDIT_FIRESTORE_PORT ?? '9188');
const projectId = 'demo-audit-critical';
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnvironment = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });

try {
  await testEnvironment.clearFirestore();
  const db = testEnvironment.authenticatedContext('audit-owner', { email_verified: true }).firestore();
  const otherDb = testEnvironment.authenticatedContext('other-owner', { email_verified: true }).firestore();
  const categoryPath = 'users/audit-owner/categories/category-a';
  const expensePath = 'users/audit-owner/expenses/expense-a';
  const category = doc(db, categoryPath);
  const expense = doc(db, expensePath);
  await assertSucceeds(setDoc(category, {
    name: 'Audit synthetic category', iconName: 'tag', colorInt: 0, transactionType: 'expense', sortOrder: 0,
  }));
  await assertSucceeds(setDoc(expense, {
    amount: 12.34, dateMillis: Date.now(), categoryId: 'category-a', note: '', transactionType: 'expense',
  }));
  await assertFails(getDoc(doc(otherDb, expensePath)));
  await assertSucceeds(updateDoc(category, { migrationState: 'migrating', pendingTransactionType: 'income' }));
  await assertSucceeds(updateDoc(category, {
    transactionType: 'income', migrationState: deleteField(), pendingTransactionType: deleteField(),
  }));
  assert.equal((await getDoc(category)).data().transactionType, 'income');
  assert.equal((await getDoc(expense)).data().transactionType, 'expense');
  console.log('AUS-101 reproduced: final category income, linked expense expense. Cross-owner read denied.');

  const prefs = doc(db, 'users/audit-owner/settings/preferences');
  const now = Date.now();
  const original = {
    currency: 'EUR', locale: 'en', themeMode: 'system', dailyReminder: false, reminderHour: 20,
    reminderMinute: 0, analyticsPeriod: 'all_time', updatedAt: now - 1_000,
  };
  const replacement = { ...original, currency: 'USD', updatedAt: now + 120_000 };
  await assertSucceeds(setDoc(prefs, original));
  await assertSucceeds(setDoc(prefs, replacement));
  const rollbackRevision = Math.max(Date.now(), original.updatedAt + 1);
  await assertFails(setDoc(prefs, { ...original, updatedAt: rollbackRevision }));
  assert.equal((await getDoc(prefs)).data().currency, 'USD');
  console.log('AUS-103 rules reproduction: accepted +120s replacement revision, rejected rollback revision; live currency USD.');

  const templateId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const scheduledDate = '2026-11-12';
  const occurrenceId = `${templateId}_${scheduledDate}`;
  const canonicalExpenseId = createHash('sha256')
    .update(JSON.stringify(['recurring-v1', templateId, scheduledDate]))
    .digest('hex');
  const template = doc(db, 'users/audit-owner/recurringTransactions', templateId);
  const canonicalExpense = doc(db, 'users/audit-owner/expenses', canonicalExpenseId);
  const receipt = doc(db, 'users/audit-owner/recurringOccurrences', occurrenceId);
  await assertSucceeds(setDoc(receipt, {
    templateId, scheduledDate, expenseId: canonicalExpenseId, createdAt: Date.now(),
  }));
  assert.equal((await getDoc(receipt)).exists(), true);
  assert.equal((await getDoc(template)).exists(), false);
  assert.equal((await getDoc(canonicalExpense)).exists(), false);
  console.log('AUS-203 rules reproduction: accepted canonical receipt without a template or expense.');
} finally {
  await testEnvironment.cleanup();
}
