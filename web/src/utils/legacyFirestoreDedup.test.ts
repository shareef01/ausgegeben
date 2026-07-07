import { describe, expect, it } from 'vitest';
import {
  dedupeLegacyCategoryDocs,
  dedupeLegacyExpenseDocs,
  isLegacyFirestoreDocId,
} from '@/utils/legacyFirestoreDedup';

describe('isLegacyFirestoreDocId', () => {
  it('detects numeric legacy ids', () => {
    expect(isLegacyFirestoreDocId('5')).toBe(true);
    expect(isLegacyFirestoreDocId('123')).toBe(true);
  });

  it('rejects uuid and empty ids', () => {
    expect(isLegacyFirestoreDocId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    expect(isLegacyFirestoreDocId('')).toBe(false);
  });
});

describe('dedupeLegacyCategoryDocs', () => {
  it('drops legacy doc when a modern uuid doc matches fingerprint', () => {
    const modern = {
      cloudId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Food',
      iconName: 'shopping_bag',
      colorInt: 1,
      transactionType: 'expense',
      sortOrder: 0,
    };
    const legacy = {
      cloudId: '5',
      name: 'Food',
      iconName: 'shopping_bag',
      colorInt: 1,
      transactionType: 'expense',
      sortOrder: 0,
    };

    const result = dedupeLegacyCategoryDocs([
      { docId: modern.cloudId, record: modern },
      { docId: '5', record: legacy },
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].cloudId).toBe(modern.cloudId);
    expect(result.legacyDocIdsToDelete).toEqual(['5']);
    expect(result.remapCloudIds).toEqual({ '5': modern.cloudId });
  });

  it('collapses content duplicates for categories and provides remap', () => {
    const first = {
      cloudId: 'a1b2c3d4-0001',
      name: 'Shopping',
      iconName: 'shopping_bag',
      colorInt: 100,
      transactionType: 'expense',
      sortOrder: 1,
    };
    const second = {
      cloudId: 'a1b2c3d4-0002',
      name: 'Shopping',
      iconName: 'shopping_bag',
      colorInt: 100,
      transactionType: 'expense',
      sortOrder: 1,
    };

    const result = dedupeLegacyCategoryDocs([
      { docId: first.cloudId, record: first },
      { docId: second.cloudId, record: second },
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.duplicateCloudIds).toEqual(['a1b2c3d4-0002']);
    expect(result.remapCloudIds).toEqual({ 'a1b2c3d4-0002': 'a1b2c3d4-0001' });
  });

  it('keeps legacy-only docs', () => {
    const legacy = {
      cloudId: '3',
      name: 'Travel',
      iconName: 'flight',
      colorInt: 2,
      transactionType: 'expense',
      sortOrder: 1,
    };

    const result = dedupeLegacyCategoryDocs([{ docId: '3', record: legacy }]);

    expect(result.records).toHaveLength(1);
    expect(result.legacyDocIdsToDelete).toEqual([]);
  });
});

describe('dedupeLegacyExpenseDocs', () => {
  it('drops legacy doc when modern duplicate exists', () => {
    const modern = {
      cloudId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      amount: 12.5,
      dateMillis: 1_700_000_000_000,
      note: 'lunch',
      transactionType: 'expense',
      receiptImagePath: null,
    };
    const legacy = {
      cloudId: '9',
      amount: 12.5,
      dateMillis: 1_700_000_000_000,
      note: 'lunch',
      transactionType: 'expense',
      receiptImagePath: null,
    };

    const result = dedupeLegacyExpenseDocs([
      { docId: modern.cloudId, record: modern },
      { docId: '9', record: legacy },
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.legacyDocIdsToDelete).toEqual(['9']);
    expect(result.duplicateCloudIds).toEqual([]);
  });

  it('collapses two modern docs with identical content, keeping one canonical copy', () => {
    const canonical = {
      cloudId: 'a0000000-0000-4000-8000-000000000000',
      amount: 25.83,
      dateMillis: 1_700_000_000_000,
      note: 'edeka',
      transactionType: 'expense',
      receiptImagePath: null,
    };
    const duplicate = {
      cloudId: 'f0000000-0000-4000-8000-000000000000',
      amount: 25.83,
      dateMillis: 1_700_000_000_000,
      note: 'edeka',
      transactionType: 'expense',
      receiptImagePath: null,
    };

    const result = dedupeLegacyExpenseDocs([
      { docId: duplicate.cloudId, record: duplicate },
      { docId: canonical.cloudId, record: canonical },
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].cloudId).toBe(canonical.cloudId);
    expect(result.duplicateCloudIds).toEqual([duplicate.cloudId]);
    expect(result.remapCloudIds).toEqual({ [duplicate.cloudId]: canonical.cloudId });
    expect(result.legacyDocIdsToDelete).toEqual([]);
  });

  it('keeps genuinely distinct expenses (different timestamps) separate', () => {
    const first = {
      cloudId: 'a0000000-0000-4000-8000-000000000000',
      amount: 3,
      dateMillis: 1_700_000_000_000,
      note: 'coffee',
      transactionType: 'expense',
      receiptImagePath: null,
    };
    const second = {
      cloudId: 'b0000000-0000-4000-8000-000000000000',
      amount: 3,
      dateMillis: 1_700_000_050_000,
      note: 'coffee',
      transactionType: 'expense',
      receiptImagePath: null,
    };

    const result = dedupeLegacyExpenseDocs([
      { docId: first.cloudId, record: first },
      { docId: second.cloudId, record: second },
    ]);

    expect(result.records).toHaveLength(2);
    expect(result.duplicateCloudIds).toEqual([]);
  });
});
