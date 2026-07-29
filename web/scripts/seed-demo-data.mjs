/**
 * Seeds the local Firebase emulators with a verified demo account and realistic
 * sample data, so README screenshots can be captured without publishing anyone's
 * real finances to a public repo.
 *
 * Requires the emulators to be running (JDK 21+):
 *   npx firebase emulators:start --only auth,firestore --project demo-ausgegeben
 *
 * Then:
 *   node scripts/seed-demo-data.mjs
 *
 * Categories mirror DEFAULT_CATEGORIES in src/repositories/expenseRepository.ts,
 * but with fixed ids so the expenses below can reference them. Seeding them here
 * also stops ensureSeeded() generating a second, duplicate set on first sign-in.
 */
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';

// The emulators partition data per project. The web app reads whatever
// VITE_FIREBASE_PROJECT_ID says, while Android takes its id from
// app/google-services.json — so each has to be seeded under its own project.
//   PROJECT_ID=ausgegeben01 node scripts/seed-demo-data.mjs
const PROJECT_ID = process.env.PROJECT_ID ?? 'demo-ausgegeben';
const EMAIL = 'demo@ausgegeben.app';
const PASSWORD = 'demo-password-123';

// Signed 32-bit, matching Android's Int colorInt for shared Firestore docs.
const argb = (hex) => hex | 0;

const CATEGORIES = [
  { id: 'cat-groceries', name: 'Groceries', iconName: 'shopping_cart', colorInt: argb(0xffe86b5a), transactionType: 'expense', sortOrder: 0 },
  { id: 'cat-shopping', name: 'Shopping', iconName: 'shopping_bag', colorInt: argb(0xffe8a060), transactionType: 'expense', sortOrder: 1 },
  { id: 'cat-dining', name: 'Dining', iconName: 'restaurant', colorInt: argb(0xffd4849a), transactionType: 'expense', sortOrder: 2 },
  { id: 'cat-transport', name: 'Transport', iconName: 'car', colorInt: argb(0xff6a9fd4), transactionType: 'expense', sortOrder: 3 },
  { id: 'cat-bills', name: 'Bills', iconName: 'bolt', colorInt: argb(0xff9a8fd4), transactionType: 'expense', sortOrder: 4 },
  { id: 'cat-subscriptions', name: 'Subscriptions', iconName: 'subscriptions', colorInt: argb(0xff5ab8aa), transactionType: 'expense', sortOrder: 5 },
  { id: 'cat-salary', name: 'Salary', iconName: 'credit_card', colorInt: argb(0xff5cb88a), transactionType: 'income', sortOrder: 0 },
  { id: 'cat-freelance', name: 'Freelance', iconName: 'work', colorInt: argb(0xff6a9fd4), transactionType: 'income', sortOrder: 1 },
  { id: 'cat-refunds', name: 'Refunds', iconName: 'undo', colorInt: argb(0xffb8a060), transactionType: 'income', sortOrder: 2 },
  { id: 'cat-transfer', name: 'Transfer', iconName: 'swap_horiz', colorInt: argb(0xff8e8e96), transactionType: 'transfer', sortOrder: 0 },
  { id: '0', name: 'Uncategorized', iconName: 'help_outline', colorInt: argb(0xff8e8e96), transactionType: 'expense', sortOrder: 999 },
];

const at = (day, hour = 12) => new Date(2026, 6, day, hour, 0, 0).getTime(); // July 2026

// Expenses total 499,13 against 3.000,00 income → 2.500,87 balance, on a 2.000,00 budget.
const EXPENSES = [
  { id: 'exp-salary-july', amount: 3000.0, dateMillis: at(1, 9), categoryId: 'cat-salary', note: 'Monthly salary', transactionType: 'income' },
  { id: 'exp-subscriptions', amount: 17.99, dateMillis: at(8, 10), categoryId: 'cat-subscriptions', note: 'Streaming plan', transactionType: 'expense' },
  { id: 'exp-transport', amount: 45.0, dateMillis: at(12, 8), categoryId: 'cat-transport', note: 'Monthly transit pass', transactionType: 'expense' },
  { id: 'exp-bills', amount: 89.25, dateMillis: at(15, 17), categoryId: 'cat-bills', note: 'Electricity', transactionType: 'expense' },
  { id: 'exp-shopping', amount: 129.99, dateMillis: at(18, 14), categoryId: 'cat-shopping', note: 'New headphones', transactionType: 'expense' },
  { id: 'exp-dining', amount: 154.5, dateMillis: at(20, 20), categoryId: 'cat-dining', note: 'Dinner with friends', transactionType: 'expense' },
  { id: 'exp-groceries', amount: 62.4, dateMillis: at(21, 18), categoryId: 'cat-groceries', note: 'Weekly groceries', transactionType: 'expense' },
];

const PREFERENCES = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  onboardingComplete: true,
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  monthlyBudget: 2000,
  updatedAt: Date.now(),
};

/**
 * Firestore rules gate every write on the token's email_verified claim, so the
 * account has to be verified before it can seed anything. The Auth emulator
 * exposes this through its privileged REST surface (Bearer owner).
 */
async function markEmailVerified(uid) {
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: uid, emailVerified: true }),
    },
  );
  if (!res.ok) throw new Error(`Failed to verify email: ${res.status} ${await res.text()}`);
}

async function main() {
  const app = initializeApp({
    apiKey: 'fake-api-key',
    authDomain: 'localhost',
    projectId: PROJECT_ID,
    appId: '1:0:web:0',
  });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  }

  await markEmailVerified(cred.user.uid);
  // reload() alone keeps the cached token, whose email_verified claim the rules
  // read — sign in again so the seeding writes below are actually accepted.
  const fresh = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  await fresh.user.getIdToken(true);
  const uid = fresh.user.uid;

  const now = Date.now();
  for (const c of CATEGORIES) {
    await setDoc(doc(db, 'users', uid, 'categories', c.id), { ...c, updatedAt: now });
  }
  for (const e of EXPENSES) {
    await setDoc(doc(db, 'users', uid, 'expenses', e.id), { ...e, updatedAt: now });
  }
  await setDoc(doc(db, 'users', uid, 'settings', 'preferences'), PREFERENCES);

  console.log(`Seeded ${CATEGORIES.length} categories and ${EXPENSES.length} transactions`);
  console.log(`uid=${uid}  email=${EMAIL}  password=${PASSWORD}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
