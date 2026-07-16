import { receiptStore } from '@/services/receiptStorageService';

export interface StoredReceipt { id: string; mimeType: string; data: Blob; createdAt: number; }

const RECEIPT_PREFIX = 'receipt://';
export function isReceiptPath(path: string | null | undefined): path is string { return Boolean(path?.startsWith(RECEIPT_PREFIX)); }
export function receiptIdFromPath(path: string): string { return path.slice(RECEIPT_PREFIX.length); }
export function receiptPathFromId(id: string): string { return RECEIPT_PREFIX + id; }
function newId(): string { return crypto.randomUUID(); }

export const receiptService = {
  async save(file: File): Promise<string> {
    const id = newId();
    await receiptStore.save(id, file.type || 'image/jpeg', file);
    return receiptPathFromId(id);
  },
  async getBlob(path: string | null | undefined): Promise<Blob | null> {
    if (!isReceiptPath(path)) return null;
    const row = await receiptStore.get(receiptIdFromPath(path));
    return row?.data ?? null;
  },
  async getObjectUrl(path: string | null | undefined): Promise<string | null> {
    const blob = await this.getBlob(path);
    return blob ? URL.createObjectURL(blob) : null;
  },
  async copy(path: string | null | undefined): Promise<string | null> {
    if (!isReceiptPath(path)) return null;
    const sourceId = receiptIdFromPath(path);
    const copyId = crypto.randomUUID();
    const ok = await receiptStore.copy(sourceId, copyId);
    return ok ? receiptPathFromId(copyId) : null;
  },
  async deletePath(path: string | null | undefined, _excludeExpenseId?: string): Promise<void> {
    if (!isReceiptPath(path)) return;
    await receiptStore.delete(receiptIdFromPath(path));
  },
};
