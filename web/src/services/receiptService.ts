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

  async ensureLocal(path: string | null | undefined): Promise<boolean> {
    if (!isReceiptPath(path)) return false;
    const id = receiptIdFromPath(path);
    const existing = await db.receipts.get(id);
    if (existing) return true;
    if (!isCloudSyncActive()) return false;
    const blob = await receiptStorageService.downloadToBlob(path);
    if (!blob) return false;
    await db.receipts.put({
      id,
      mimeType: blob.type || 'image/jpeg',
      data: blob,
      createdAt: Date.now(),
    });
    return true;
  },

  /** Clears local + session blocks, then retries a cloud download. */
  async forceCloudRetry(path: string | null | undefined): Promise<boolean> {
    if (!isReceiptPath(path) || !isCloudSyncActive()) return false;
    receiptStorageService.resetCloudAvailability();
    const id = receiptIdFromPath(path);
    await db.receipts.delete(id);
    return this.ensureLocal(path);
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

  async uploadToCloud(path: string | null | undefined): Promise<boolean> {
    if (!isReceiptPath(path) || !isCloudSyncActive()) return true;
    const id = receiptIdFromPath(path);
    const row = await db.receipts.get(id);
    if (!row) return true;
    return receiptStorageService.upload(path, row.data, row.mimeType);
  },

  /** Background-download cloud receipts for visible list rows. */
  async prefetch(paths: (string | null | undefined)[]): Promise<void> {
    const unique = [...new Set(paths.filter(isReceiptPath))];
    await Promise.all(unique.map((path) => this.ensureLocal(path).catch(() => undefined)));
  },

  async share(path: string | null | undefined): Promise<boolean> {
    if (!isReceiptPath(path)) return false;
    const blob = await this.getBlob(path);
    if (!blob) return false;
    const file = new File([blob], `receipt-${receiptIdFromPath(path).slice(0, 8)}.jpg`, { type: blob.type || 'image/jpeg' });
    if (typeof navigator.share === 'function') {
      try {
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'receipt' });
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  },

  async download(path: string | null | undefined): Promise<boolean> {
    const blob = await this.getBlob(path);
    if (!blob || !isReceiptPath(path)) return false;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `receipt-${receiptIdFromPath(path).slice(0, 8)}.jpg`;
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
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
