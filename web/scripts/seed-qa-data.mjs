/**
 * Seeds the local emulators with the design-QA datasets, so layout and number
 * formatting can be checked against more than the tidy README demo account.
 *
 * Requires the emulators (JDK 21+):
 *   npx firebase emulators:start --only auth,firestore --project demo-ausgegeben
 * Then:
 *   node scripts/seed-qa-data.mjs
 *
 * Accounts (emulator only — these never exist anywhere real):
 *   qa-empty@ausgegeben.test  / qa-password-123   Dataset A: no transactions, no budgets
 *   qa-heavy@ausgegeben.test  / qa-password-123   Dataset C/D: ~300 rows over six months,
 *                                                  large amounts, long and similar-prefix
 *                                                  category names, German locale
 * The typical-usage dataset (B) is the README demo account from seed-demo-data.mjs.
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, writeBatch } from 'firebase/firestore';

const PROJECT_ID = process.env.PROJECT_ID ?? 'demo-ausgegeben';
const PASSWORD = 'qa-password-123';
const argb = (hex) => hex | 0;

const HEAVY_CATEGORIES = [
  ['q-groc-aldi', 'Lebensmittel – Discounter', 'shopping_cart', 0xffe86b5a, 'expense'],
  ['q-groc-bio', 'Lebensmittel – Biomarkt', 'shopping_cart', 0xffe8a060, 'expense'],
  ['q-groc-wochen', 'Lebensmittel – Wochenmarkt', 'shopping_cart', 0xffd4849a, 'expense'],
  ['q-house', 'Haushaltsversicherung und Nebenkosten der Wohnung', 'home', 0xff6a9fd4, 'expense'],
  ['q-car', 'Auto', 'car', 0xff9a8fd4, 'expense'],
  ['q-subs', 'Abonnements', 'subscriptions', 0xff5ab8aa, 'expense'],
  ['q-health', 'Gesundheit', 'favorite', 0xffd46a6a, 'expense'],
  ['q-edu', 'Weiterbildung', 'school', 0xff8fb35a, 'expense'],
  ['q-gift', 'Geschenke', 'card_giftcard', 0xffc78fd4, 'expense'],
  ['q-travel', 'Reisen', 'flight', 0xff5a8fd4, 'expense'],
  ['q-pets', 'Haustiere', 'pets', 0xffb8a060, 'expense'],
  ['q-misc', 'Sonstiges', 'help_outline', 0xff8e8e96, 'expense'],
  ['q-salary', 'Gehalt', 'credit_card', 0xff5cb88a, 'income'],
  ['q-sale', 'Immobilienverkauf', 'home', 0xff6ad4a0, 'income'],
  ['q-transfer', 'Umbuchung Sparkonto', 'swap_horiz', 0xff8e8e96, 'transfer'],
  ['0', 'Uncategorized', 'help_outline', 0xff8e8e96, 'expense'],
].map(([id, name, iconName, color, transactionType], sortOrder) => ({
  id, name, iconName, colorInt: argb(color), transactionType, sortOrder,
}));

/** Deterministic PRNG so every reseed produces the same screenshots. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function heavyExpenses() {
  const rand = rng(42);
  const now = new Date();
  const rows = [];
  const expenseCats = HEAVY_CATEGORIES.filter((c) => c.transactionType === 'expense' && c.id !== '0');
  for (let m = 0; m < 6; m++) {
    const year = now.getFullYear();
    const month = now.getMonth() - m;
    const lastDay = m === 0 ? now.getDate() : new Date(year, month + 1, 0).getDate();
    rows.push({ amount: 5432.1, day: 1, categoryId: 'q-salary', note: 'Gehalt', transactionType: 'income', year, month });
    for (let i = 0; i < 48; i++) {
      const cat = expenseCats[Math.floor(rand() * expenseCats.length)];
      const amount = Math.round((rand() < 0.1 ? rand() * 2500 : rand() * 120) * 100) / 100 || 0.01;
      const day = 1 + Math.floor(rand() * lastDay);
      const note = rand() < 0.2
        ? 'Sehr lange Notiz, um zu prüfen, ob die Zeile auf schmalen Geräten sauber abgeschnitten wird'
        : '';
      rows.push({ amount, day, categoryId: cat.id, note, transactionType: 'expense', year, month });
    }
    rows.push({ amount: 250, day: Math.min(15, lastDay), categoryId: 'q-transfer', note: '', transactionType: 'transfer', year, month });
  }
  // Edge amounts in the current month, all on one day.
  const y = now.getFullYear();
  const mo = now.getMonth();
  const today = now.getDate();
  for (const amount of [0.01, 9.99, 999.99, 1234.56, 123456.78]) {
    rows.push({ amount, day: today, categoryId: 'q-house', note: `Testbetrag ${amount}`, transactionType: 'expense', year: y, month: mo });
  }
  rows.push({ amount: 1234567.89, day: today, categoryId: 'q-sale', note: 'Grosser Betrag', transactionType: 'income', year: y, month: mo });
  return rows.map((r, i) => ({
    id: `q-exp-${String(i).padStart(4, '0')}`,
    amount: r.amount,
    dateMillis: new Date(r.year, r.month, r.day, 8 + (i % 12), i % 60, 0).getTime(),
    categoryId: r.categoryId,
    note: r.note,
    transactionType: r.transactionType,
  }));
}

async function signInFresh(auth, email) {
  try {
    await createUserWithEmailAndPassword(auth, email, PASSWORD);
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
  }
  const first = await signInWithEmailAndPassword(auth, email, PASSWORD);
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: first.user.uid, emailVerified: true }),
  });
  if (!res.ok) throw new Error(`verify failed: ${res.status}`);
  const fresh = await signInWithEmailAndPassword(auth, email, PASSWORD);
  await fresh.user.getIdToken(true);
  return fresh.user.uid;
}

async function writeAll(db, uid, collection, docs) {
  const now = Date.now();
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) {
      batch.set(doc(db, 'users', uid, collection, d.id), { ...d, updatedAt: now });
    }
    await batch.commit();
  }
}

async function main() {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: 'localhost', projectId: PROJECT_ID, appId: '1:0:web:0' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const emptyUid = await signInFresh(auth, 'qa-empty@ausgegeben.test');
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', emptyUid, 'settings', 'preferences'), {
    currency: 'EUR', locale: 'en', themeMode: 'system', onboardingComplete: true,
    analyticsPeriod: 'this_month', updatedAt: Date.now(),
  });
  await batch.commit();
  await signOut(auth);

  const heavyUid = await signInFresh(auth, 'qa-heavy@ausgegeben.test');
  const expenses = heavyExpenses();
  await writeAll(db, heavyUid, 'categories', HEAVY_CATEGORIES);
  await writeAll(db, heavyUid, 'expenses', expenses);
  const prefs = writeBatch(db);
  prefs.set(doc(db, 'users', heavyUid, 'settings', 'preferences'), {
    currency: 'CHF', locale: 'de', themeMode: 'system', onboardingComplete: true,
    analyticsPeriod: 'last_6_months', monthlyBudget: 2500, updatedAt: Date.now(),
  });
  await prefs.commit();

  console.log(`qa-empty seeded; qa-heavy seeded with ${HEAVY_CATEGORIES.length} categories and ${expenses.length} transactions`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
