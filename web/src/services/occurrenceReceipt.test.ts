import { describe, expect, it } from 'vitest';
import { occurrenceKey, validOccurrenceReceipt } from '@/services/recurrence';

const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000';
const DATE = '2024-01-31';
const KEY = occurrenceKey(TEMPLATE_ID, DATE);

describe('validOccurrenceReceipt', () => {
  const good = { templateId: TEMPLATE_ID, scheduledDate: DATE, expenseId: 'a'.repeat(64) };
  const expected = { templateId: TEMPLATE_ID, scheduledDate: DATE, expenseId: 'a'.repeat(64) };

  it('accepts a receipt that names this template, this date and the deterministic expense id', () => {
    expect(validOccurrenceReceipt(good, expected)).toBe(true);
  });

  it('rejects a receipt for another template', () => {
    expect(validOccurrenceReceipt({ ...good, templateId: 'other' }, expected)).toBe(false);
  });

  it('rejects a receipt for another date', () => {
    expect(validOccurrenceReceipt({ ...good, scheduledDate: '2024-02-29' }, expected)).toBe(false);
  });

  it('rejects a receipt whose expense id is not sha256(occurrenceKey(templateId, date))', () => {
    // A 64-hex value that is not the deterministic id is still untrusted metadata.
    expect(validOccurrenceReceipt({ ...good, expenseId: 'b'.repeat(64) }, expected)).toBe(false);
  });

  it('rejects missing fields rather than coercing them', () => {
    expect(validOccurrenceReceipt({}, expected)).toBe(false);
    expect(validOccurrenceReceipt({ templateId: TEMPLATE_ID }, expected)).toBe(false);
  });

  it('is not satisfied by an occurrence key that merely looks similar', () => {
    // The key itself must never be used as the document id: the contract is sha256(key).
    expect(validOccurrenceReceipt({ ...good, expenseId: KEY.slice(0, 64) }, expected)).toBe(false);
  });
});
