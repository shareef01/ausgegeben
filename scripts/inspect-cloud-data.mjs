/**
 * Read-only Firestore inventory for ausgegeben01 (uses Firebase CLI credentials).
 * Usage: node scripts/inspect-cloud-data.mjs [email-substring]
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'ausgegeben01';
const emailFilter = process.argv[2]?.toLowerCase() ?? '';

initializeApp({ credential: applicationDefault(), projectId });

const db = getFirestore();
const auth = getAuth();

async function countCollection(uid, name) {
  const snap = await db.collection('users').doc(uid).collection(name).get();
  let active = 0;
  let deleted = 0;
  const samples = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const isDeleted = data.deleted === true;
    if (isDeleted) deleted += 1;
    else active += 1;
    if (samples.length < 5) {
      samples.push({
        docId: doc.id,
        cloudId: data.cloudId ?? doc.id,
        deleted: isDeleted,
        amount: data.amount,
        note: data.note,
        dateMillis: data.dateMillis,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
      });
    }
  }
  return { total: snap.size, active, deleted, samples };
}

async function main() {
  const users = await auth.listUsers(1000);
  const matched = users.users.filter((u) =>
  !emailFilter || u.email?.toLowerCase().includes(emailFilter));

  if (matched.length === 0) {
    console.log('No users matched filter:', emailFilter || '(all)');
    return;
  }

  for (const user of matched) {
    console.log('\n===', user.email ?? user.uid, '===');
    console.log('uid:', user.uid);
    const cats = await countCollection(user.uid, 'categories');
    const exps = await countCollection(user.uid, 'expenses');
    console.log('categories:', cats.total, `(active ${cats.active}, deleted ${cats.deleted})`);
    console.log('expenses:', exps.total, `(active ${exps.active}, deleted ${exps.deleted})`);
    if (exps.samples.length) {
      console.log('expense samples:');
      for (const s of exps.samples) console.log(' ', JSON.stringify(s));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
