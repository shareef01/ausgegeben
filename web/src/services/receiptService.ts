import { db } from '@/services/database';
import { receiptStorageService } from '@/services/receiptStorageService';
import { isCloudSyncActive } from '@/services/cloudSync';

export interface StoredReceipt {
  id: string;
  mimeType: string;
  data: Blob;
  createdAt: number;
}

const RECEIPT_PREFIX = 'receipt://';

export function isReceiptPath(path: string | null | undefined): path is string {
  return Boolean(path?.startsWith(RECEIPT_PREFIX));
}

export function receiptIdFromPath(path: string): string {
  return path.slice(RECEIPT_PREFIX.length);
}

export function receiptPathFromId(id: string): string {
  return `${RECEIPT_PREFIX}${id}`;
}

function newId(): string {
  return crypto.randomUUID();
}

export const receiptService = {
  async save(file: File): Promise<string> {
    const id = newId();
    await db.receipts.put({
      id,
      mimeType: file.type || 'image/jpeg',
      data: file,
      createdAt: Date.now(),
    });
    return receiptPathFromId(id);
  },

  async ensureLocal(path: string | null | undefined): Promise<void> {
    if (!isReceiptPath(path)) return;
    const id = receiptIdFromPath(path);
    const existing = await db.receipts.get(id);
    if (existing) return;
    if (!isCloudSyncActive()) return;
    const blob = await receiptStorageService.downloadToBlob(path);
    if (!blob) return;
    await db.receipts.put({
      id,
      mimeType: blob.type || 'image/jpeg',
      data: blob,
      createdAt: Date.now(),
    });
  },

  async getBlob(path: string | null | undefined): Promise<Blob | null> {
    if (!isReceiptPath(path)) return null;
    await this.ensureLocal(path);
    const row = await db.receipts.get(receiptIdFromPath(path));
    return row?.data ?? null;
  },

  async getObjectUrl(path: string | null | undefined): Promise<string | null> {
    const blob = await this.getBlob(path);
    return blob ? URL.createObjectURL(blob) : null;
  },

  async copy(path: string | null | undefined): Promise<string | null> {
    if (!isReceiptPath(path)) return null;
    await this.ensureLocal(path);
    const row = await db.receipts.get(receiptIdFromPath(path));
    if (!row) return null;
    const id = newId();
    await db.receipts.put({
      id,
      mimeType: row.mimeType,
      data: row.data,
      createdAt: Date.now(),
    });
    return receiptPathFromId(id);
  },

  async uploadToCloud(path: string | null | undefined): Promise<void> {
    if (!isReceiptPath(path) || !isCloudSyncActive()) return;
    const id = receiptIdFromPath(path);
    const row = await db.receipts.get(id);
    if (!row) return;
    await receiptStorageService.upload(path, row.data, row.mimeType);
  },

  async deletePath(path: string | null | undefined, excludeExpenseId?: number): Promise<void> {
    if (!isReceiptPath(path)) return;
    const id = receiptIdFromPath(path);
    const refs = await db.expenses
      .filter((e) => e.receiptImagePath === path && e.id !== excludeExpenseId)
      .count();
    if (refs === 0) {
      await db.receipts.delete(id);
      if (isCloudSyncActive()) {
        await receiptStorageService.delete(path);
      }
    }
  },
};
