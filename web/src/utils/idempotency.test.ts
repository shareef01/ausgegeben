import { describe, expect, it } from 'vitest';
import { expenseDocumentId } from '@/utils/idempotency';

describe('expenseDocumentId', () => {
  const vectors = [
    ['example-key', 'c018c41c1afaf2c0b66c64f97d0ee135657b699ad260f299234cd40a5d625e0e'],
    ['550e8400-e29b-41d4-a716-446655440000', 'a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34'],
    ['Grüße-東京-💶', '2570773557c0c2fcd7c802ff46f36501f2e5545d2462e2e9f6bc008a7fd87432'],
    ['x'.repeat(512), '64164443bb63e338ef1cfdb12a57117cd1212270cc935a798f6e8a665cdf4659'],
  ] as const;

  it.each(vectors)('hashes UTF-8 key %# identically across clients', async (input, expected) => {
    await expect(expenseDocumentId(input)).resolves.toBe(expected);
  });
});
