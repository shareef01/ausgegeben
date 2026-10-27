import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromCache,
  getDocFromServer,
  initializeFirestore,
  memoryLocalCache,
  setLogLevel,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import {
  emulatorFirestore,
  HOST,
  PORT,
  PROJECT_ID,
  resetHarness,
  signInTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';
import { startCuttableProxy, type CuttableProxy } from './cuttableProxy';

/**
 * Saving with no connection, through a relay the test really cuts (see cuttableProxy.ts).
 *
 * The client under test reaches the emulator only through the relay and uses the memory
 * cache, the web app's default. `emulatorFirestore()` stays directly connected and is the
 * independent view of what the server holds. Each offline test first asserts that the
 * server does not have the write: that is the proof the offline branch ran, rather than a
 * transaction quietly committing the way it does under `disableNetwork()`.
 */
// Every refused connection during an outage is logged as an error; they are expected here.
setLogLevel('silent');

let clientApp: FirebaseApp | null = null;
let client: Firestore | null = null;
let proxy: CuttableProxy;

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  return {
    ...actual,
    getFirebaseFirestore: () => {
      if (!client) throw new Error('offline client not started');
      return client;
    },
  };
});

const { expenseRepository } = await import('@/repositories/expenseRepository');
const { writeExpense } = await import('@/viewmodels/useAddTransactionViewModel');
const { hasQueuedWrites, resetQueuedWritesForTests } = await import('@/services/queuedWrites');
const journal = await import('@/services/expenseSubmissionJournal');
const { expenseDocumentId } = await import('@/utils/idempotency');

const CATEGORY_ID = 'offline-cat';

const draft = (note: string) => ({
  amount: 4.5,
  categoryId: CATEGORY_ID,
  note,
  dateMillis: Date.UTC(2026, 9, 1, 9, 0, 0),
  transactionType: 'expense' as const,
});

const serverDoc = (id: string) => getDocFromServer(doc(emulatorFirestore(), 'users', TEST_UID, 'expenses', id));
const clientDoc = (id: string) => doc(client!, 'users', TEST_UID, 'expenses', id);

async function startClient(): Promise<void> {
  clientApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator', appId: 'emulator' }, `offline-${Date.now()}`);
  client = initializeFirestore(clientApp, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(client, '127.0.0.1', proxy.port);
}

async function stopClient(): Promise<void> {
  if (client) await terminate(client);
  if (clientApp) await deleteApp(clientApp);
  client = null;
  clientApp = null;
}

/**
 * Reopen the relay and wait until every queued write has reached the server. Restarting
 * the client's network only resets its reconnect backoff, which can otherwise grow past a
 * test timeout during the outage; the outage itself was real.
 */
async function reconnectAndDrain(): Promise<void> {
  await proxy.restore();
  await disableNetwork(client!);
  await enableNetwork(client!);
  await vi.waitFor(() => expect(hasQueuedWrites()).toBe(false), { timeout: 30_000, interval: 100 });
}

describe('saving with no connection (memory cache, the web default)', () => {
  beforeAll(async () => {
    await startHarness();
    proxy = await startCuttableProxy(HOST, PORT);
  });
  afterAll(async () => {
    await stopClient();
    await proxy.close();
    await stopHarness();
  });
  beforeEach(async () => {
    await stopClient();
    await proxy.restore();
    await resetHarness();
    await journal.clearAllExpenseSubmissionJournalForTests();
    resetQueuedWritesForTests();
    signInTestUser();
    await startClient();
  });

  it('online through the relay, Save waits for the server and reports nothing queued', async () => {
    const id = await writeExpense({ uid: TEST_UID, payload: draft('online') });
    expect(hasQueuedWrites()).toBe(false);
    expect((await serverDoc(id)).exists()).toBe(true);
  });

  it('offline, Save finishes, keeps the entry locally, and it lands exactly once after reconnecting', async () => {
    // Prime the client's view of the server before the outage, as a signed-in tab would be.
    await writeExpense({ uid: TEST_UID, payload: draft('before outage') });
    await proxy.cut();

    const started = Date.now();
    const id = await writeExpense({ uid: TEST_UID, payload: draft('offline') });
    const elapsed = Date.now() - started;

    // The bug: this used to never return. The SDK's own offline detection still takes a
    // few seconds the first time, so the bound is generous but finite.
    expect(elapsed).toBeLessThan(20_000);
    expect(hasQueuedWrites()).toBe(true);
    expect((await getDocFromCache(clientDoc(id))).data()?.note).toBe('offline');
    expect((await serverDoc(id)).exists()).toBe(false);

    await reconnectAndDrain();

    const landed = await serverDoc(id);
    expect(landed.data()?.note).toBe('offline');
    expect(landed.data()?.amount).toBe(4.5);
  }, 60_000);

  it('offline, retrying the same operation id converges on one document', async () => {
    const prepared = await journal.beginExpenseSubmission(TEST_UID);
    await proxy.cut();

    const first = await expenseRepository.insertExpense(draft('retry'), prepared.operationId);
    const second = await expenseRepository.insertExpense(draft('retry'), prepared.operationId);
    expect(second).toBe(first);
    expect(first).toBe(await expenseDocumentId(prepared.operationId));
    expect((await serverDoc(first)).exists()).toBe(false);

    await reconnectAndDrain();
    expect((await serverDoc(first)).data()?.idempotencyKey).toBe(prepared.operationId);
  }, 60_000);

  it('offline, editing and deleting finish too, and both reach the server after reconnecting', async () => {
    const editedId = await writeExpense({ uid: TEST_UID, payload: draft('to edit') });
    const deletedId = await writeExpense({ uid: TEST_UID, payload: draft('to delete') });
    // Load both into the client's cache the way the open record list does.
    await getDocFromServer(clientDoc(editedId));
    await getDocFromServer(clientDoc(deletedId));
    await proxy.cut();

    await writeExpense({ uid: TEST_UID, expenseId: editedId, payload: { ...draft('edited offline'), amount: 9 } });
    await expect(expenseRepository.deleteExpense(deletedId)).resolves.not.toBeNull();
    expect(hasQueuedWrites()).toBe(true);
    expect((await serverDoc(editedId)).data()?.note).toBe('to edit');
    expect((await serverDoc(deletedId)).exists()).toBe(true);

    await reconnectAndDrain();
    expect((await serverDoc(editedId)).data()?.note).toBe('edited offline');
    expect((await serverDoc(deletedId)).exists()).toBe(false);
  }, 60_000);
});
