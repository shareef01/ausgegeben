import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { getFirebaseStorage } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { isReceiptPath, receiptIdFromPath } from '@/services/receiptService';

function receiptStoragePath(uid: string, receiptId: string): string {
  return `users/${uid}/receipts/${receiptId}`;
}

// Receipts are an optional convenience: cloud upload/download must never break data sync.
// If the Storage bucket is missing (e.g. the project is on the free Spark plan), disable
// cloud receipts for the session so we don't repeatedly hit an unavailable bucket.
const SESSION_FLAG_KEY = 'ausgegeben-cloud-receipts-unavailable';

let cloudReceiptsUnavailable = typeof sessionStorage !== 'undefined'
  && sessionStorage.getItem(SESSION_FLAG_KEY) === '1';

function markUnavailable(): void {
  cloudReceiptsUnavailable = true;
  try {
    sessionStorage.setItem(SESSION_FLAG_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

function isPermanentStorageError(code: string): boolean {
  return (
    code.includes('storage/bucket-not-found')
    || code.includes('storage/project-not-found')
    || code.includes('storage/unauthorized')
  );
}

function noteFailure(error: unknown): void {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
  if (isPermanentStorageError(code)) {
    markUnavailable();
  }
}

export const receiptStorageService = {
  isCloudReceiptsUnavailable(): boolean {
    return cloudReceiptsUnavailable;
  },

  resetCloudAvailability(): void {
    cloudReceiptsUnavailable = false;
    try {
      sessionStorage.removeItem(SESSION_FLAG_KEY);
    } catch {
      // ignore
    }
  },

  async upload(path: string, blob: Blob, mimeType: string): Promise<boolean> {
    if (cloudReceiptsUnavailable) return false;
    const storage = getFirebaseStorage();
    const uid = useAuthStore.getState().user?.uid;
    if (!storage || !uid || !isReceiptPath(path)) return true;
    const receiptId = receiptIdFromPath(path);
    try {
      const storageRef = ref(storage, receiptStoragePath(uid, receiptId));
      await uploadBytes(storageRef, blob, { contentType: mimeType });
      return true;
    } catch (error) {
      noteFailure(error);
      return false;
    }
  },

  async downloadToBlob(path: string): Promise<Blob | null> {
    if (cloudReceiptsUnavailable) return null;
    const storage = getFirebaseStorage();
    const uid = useAuthStore.getState().user?.uid;
    if (!storage || !uid || !isReceiptPath(path)) return null;
    const receiptId = receiptIdFromPath(path);
    try {
      const storageRef = ref(storage, receiptStoragePath(uid, receiptId));
      const bytes = await getBytes(storageRef);
      return new Blob([bytes], { type: 'image/jpeg' });
    } catch (error) {
      noteFailure(error);
      return null;
    }
  },

  async delete(path: string): Promise<void> {
    if (cloudReceiptsUnavailable) return;
    const storage = getFirebaseStorage();
    const uid = useAuthStore.getState().user?.uid;
    if (!storage || !uid || !isReceiptPath(path)) return;
    const receiptId = receiptIdFromPath(path);
    try {
      const storageRef = ref(storage, receiptStoragePath(uid, receiptId));
      await deleteObject(storageRef);
    } catch (error) {
      noteFailure(error);
    }
  },
};
