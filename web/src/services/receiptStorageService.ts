import Dexie, { type EntityTable } from 'dexie';

interface ReceiptRow {
  id: string;
  mimeType: string;
  data: Blob;
  createdAt: number;
}

const db = new Dexie('ausgegeben-receipts') as Dexie & {
  receipts: EntityTable<ReceiptRow, 'id'>;
};

db.version(1).stores({ receipts: 'id' });

export const receiptStore = {
  async save(id: string, mimeType: string, data: Blob): Promise<void> {
    await db.receipts.put({ id, mimeType, data, createdAt: Date.now() });
  },
  async get(id: string): Promise<ReceiptRow | undefined> {
    return db.receipts.get(id);
  },
  async copy(sourceId: string, newId: string): Promise<boolean> {
    const row = await db.receipts.get(sourceId);
    if (!row) return false;
    await db.receipts.put({ id: newId, mimeType: row.mimeType, data: row.data, createdAt: Date.now() });
    return true;
  },
  async delete(id: string): Promise<void> {
    await db.receipts.delete(id);
  },
};
