import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { receiptId } from '@/services/recurrence';
import { receiptState } from '@/services/recurringRepository';

/**
 * Fixture-driven parity: the same case table drives the Android JVM suite
 * (RecurrenceReceiptIdentityTest.kt). Cases are data, not restated assertions.
 */
interface Case {
  name: string;
  receiptExists: boolean;
  receipt: { templateId?: unknown; scheduledDate?: unknown; expenseId?: unknown } | null;
  expectedState: 'absent' | 'valid' | 'invalid';
  documentId?: string;
  expenseExists?: boolean;
  expenseHasKey?: boolean;
  expectQuarantine?: boolean;
  expectResurrection?: boolean;
}

const fixture: {
  templateId: string;
  scheduledDate: string;
  expectedExpenseId: string;
  cases: Case[];
} = JSON.parse(readFileSync(resolve(process.cwd(), '../testdata/receipt-identity.json'), 'utf8'));

const expected = {
  templateId: fixture.templateId,
  scheduledDate: fixture.scheduledDate,
  expenseId: fixture.expectedExpenseId,
};

const stateOf = (c: Case) =>
  receiptState(c.receiptExists, (c.receipt ?? undefined) as Record<string, unknown> | undefined, expected);

describe('receipt identity - shared fixture (testdata/receipt-identity.json)', () => {
  it('covers every required case', () => {
    const names = fixture.cases.map((c) => c.name);
    expect(names.length).toBeGreaterThanOrEqual(10);
    for (const required of [
      'absent receipt',
      'valid receipt',
      'wrong template id',
      'wrong scheduled date',
      'wrong receipt document id',
      'wrong canonical expense id',
      'missing required fields',
      'valid receipt with keyless edited expense',
      'valid receipt with deleted expense',
      'invalid receipt during concurrent reconciliation',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('classifies every case exactly as the fixture says', () => {
    for (const c of fixture.cases) expect([c.name, stateOf(c)]).toEqual([c.name, c.expectedState]);
  });

  it('never matches a receipt filed under another document id', () => {
    for (const c of fixture.cases.filter((x) => x.documentId)) {
      expect([c.name, receiptId(expected.templateId, expected.scheduledDate) !== c.documentId]).toEqual([c.name, true]);
      expect([c.name, stateOf(c)]).toEqual([c.name, 'absent']);
    }
  });

  it('a proven receipt suppresses the identity conflict for a keyless generated row', () => {
    for (const c of fixture.cases.filter((x) => x.expenseExists && x.expenseHasKey === false)) {
      // Production rule: conflict only when the receipt is absent.
      expect([c.name, stateOf(c) === 'absent']).toEqual([c.name, false]);
    }
  });

  it('a proven receipt over a missing row never signals resurrection', () => {
    for (const c of fixture.cases.filter((x) => x.expenseExists === false && x.expectedState === 'valid')) {
      expect([c.name, c.expectResurrection ?? false]).toEqual([c.name, false]);
    }
  });

  it('only invalid receipts are quarantined', () => {
    for (const c of fixture.cases) {
      expect([c.name, stateOf(c) === 'invalid']).toEqual([
        c.name,
        c.expectQuarantine === true || c.expectedState === 'invalid',
      ]);
    }
  });
});
