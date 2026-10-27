/**
 * The Replace operation document (meta/restoreOperation) and the recovery lease that
 * stops two tabs or devices from running the same Replace at once. Moved out of
 * backupReplace.ts unchanged; backupReplace.ts re-exports these functions.
 */
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  runTransaction,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { META_COLLECTION, RESTORE_OPERATION_DOC } from '@/repositories/firestorePaths';
import type { RestoreOperationDoc } from '@/services/backupReplace';

/**
 * Reads the current durable restore operation document, if any.
 */
export async function getRestoreOperation(userId: string): Promise<RestoreOperationDoc | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;

  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return snap.data() as RestoreOperationDoc;
}

/**
 * Writes or updates the durable restore operation document.
 */
export async function setRestoreOperation(userId: string, op: RestoreOperationDoc): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');

  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  await setDoc(ref, op);
}

/**
 * Deletes the durable restore operation document.
 */
export async function deleteRestoreOperation(userId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;

  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  await deleteDoc(ref);
}

export const RECOVERY_LEASE_DURATION_MS = 60_000;

export async function acquireRecoveryLease(
  db: Firestore,
  userId: string,
  holderId: string,
  isResume: boolean,
): Promise<{ fencingToken: number; operationId: string; existingOp: RestoreOperationDoc | null }> {
  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let fencingToken = 1;
    let existingOp: RestoreOperationDoc | null = null;
    let operationId = `replace_${now}_${Math.random().toString(36).slice(2, 8)}`;

    if (snap.exists()) {
      existingOp = snap.data() as RestoreOperationDoc;
      const isInFlight = existingOp.phase !== 'COMPLETED' && existingOp.phase !== 'ROLLED_BACK';
      const isActivelyProcessing = isInFlight && existingOp.phase !== 'FAILED_RECOVERABLE';
      const currentHolder = existingOp.progress?.leaseHolder;
      const expiresAt = existingOp.progress?.leaseExpiresAt ?? 0;
      fencingToken = (existingOp.progress?.fencingToken ?? 0) + 1;

      if (!isResume && isInFlight) {
        if (isActivelyProcessing && currentHolder && currentHolder !== holderId && expiresAt > now) {
          throw new Error('CONCURRENT_OPERATION_LEASE_ACTIVE: Another browser tab or device is actively processing this restore operation');
        }
        throw new Error(`UNRESOLVED_RESTORE_OPERATION: ${existingOp.phase}`);
      }

      if (isActivelyProcessing) {
        if (currentHolder && currentHolder !== holderId && expiresAt > now) {
          throw new Error('CONCURRENT_OPERATION_LEASE_ACTIVE: Another browser tab or device is actively processing this restore operation');
        }
        operationId = existingOp.operationId;
      } else {
        operationId = existingOp.operationId;
      }
    }
    return { fencingToken, operationId, existingOp };
  });
}

export async function verifyAndRenewRecoveryLease(
  db: Firestore,
  userId: string,
  holderId: string,
  fencingToken: number,
): Promise<void> {
  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) {
    throw new Error('LEASE_LOST: Restore operation document was removed');
  }
  const data = snap.data() as RestoreOperationDoc;
  if (data.progress?.leaseHolder !== holderId) {
    throw new Error(`LEASE_LOST: Lease was taken over by ${data.progress?.leaseHolder}`);
  }
  if (data.progress?.fencingToken !== fencingToken) {
    throw new Error(`FENCING_TOKEN_MISMATCH: Expected token ${fencingToken}, got ${data.progress?.fencingToken}`);
  }
  // Extend lease expiration
  await setDoc(ref, {
    progress: {
      ...data.progress,
      leaseExpiresAt: Date.now() + RECOVERY_LEASE_DURATION_MS,
    },
    updatedAt: Date.now(),
  }, { merge: true });
}
