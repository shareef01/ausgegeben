import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { getFirebaseStorage } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { isReceiptPath, receiptIdFromPath } from '@/services/receiptService';

function receiptStoragePath(uid: string, receiptId: string): string {
  return `users/${uid}/receipts/${receiptId}`;
}

export const receiptStorageService = {
  async upload(path: string, blob: Blob, mimeType: string): Promise<void> {
    const storage = getFirebaseStorage();
    const uid = useAuthStore.getState().user?.uid;
    if (!storage || !uid || !isReceiptPath(path)) return;
    const receiptId = receiptIdFromPath(path);
    const storageRef = ref(storage, receiptStoragePath(uid, receiptId));
    await uploadBytes(storageRef, blob, { contentType: mimeType });
  },

  async downloadToBlob(path: string): Promise<Blob | null> {
    const storage = getFirebaseStorage();
    const uid = useAuthStore.getState().user?.uid;
    if (!storage || !uid || !isReceiptPath(path)) return null;
    const receiptId = receiptIdFromPath(path);
    try {
      const storageRef = ref(storage, receiptStoragePath(uid, receiptId));
      const bytes = await getBytes(storageRef);
      return new Blob([bytes], { type: 'image/jpeg' });
    } catch {
      return null;
    }
  },

  async delete(path: string): Promise<void> {
    const storage = getFirebaseStorage();
    const uid = useAuthStore.getState().user?.uid;
    if (!storage || !uid || !isReceiptPath(path)) return;
    const receiptId = receiptIdFromPath(path);
    try {
      const storageRef = ref(storage, receiptStoragePath(uid, receiptId));
      await deleteObject(storageRef);
    } catch {
      // File may already be gone.
    }
  },
};
