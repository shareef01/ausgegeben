const receiptCache = new Map<string, StoredReceipt>();

export interface StoredReceipt { id: string; mimeType: string; data: Blob; createdAt: number; }

const RECEIPT_PREFIX = 'receipt://';
export function isReceiptPath(path: string | null | undefined): path is string { return Boolean(path?.startsWith(RECEIPT_PREFIX)); }
export function receiptIdFromPath(path: string): string { return path.slice(RECEIPT_PREFIX.length); }
export function receiptPathFromId(id: string): string { return RECEIPT_PREFIX + id; }
function newId(): string { return crypto.randomUUID(); }

export const receiptService = {
  async save(file: File): Promise<string> {
    const id = newId();
    receiptCache.set(id, { id, mimeType: file.type || 'image/jpeg', data: file, createdAt: Date.now() });
    return receiptPathFromId(id);
  },
  async getBlob(path: string | null | undefined): Promise<Blob | null> {
    if (!isReceiptPath(path)) return null;
    return receiptCache.get(receiptIdFromPath(path))?.data ?? null;
  },
  async getObjectUrl(path: string | null | undefined): Promise<string | null> {
    const blob = await this.getBlob(path);
    return blob ? URL.createObjectURL(blob) : null;
  },
  async copy(path: string | null | undefined): Promise<string | null> {
    if (!isReceiptPath(path)) return null;
    const row = receiptCache.get(receiptIdFromPath(path));
    if (!row) return null;
    const id = newId();
    receiptCache.set(id, { id, mimeType: row.mimeType, data: row.data, createdAt: Date.now() });
    return receiptPathFromId(id);
  },
  async deletePath(path: string | null | undefined, _excludeExpenseId?: number): Promise<void> {
    if (!isReceiptPath(path)) return;
    receiptCache.delete(receiptIdFromPath(path));
  },
};
