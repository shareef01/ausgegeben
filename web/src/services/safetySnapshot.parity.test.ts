import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as safety from './safetySnapshot';

/**
 * Web half of the safety-snapshot parity contract (AUD-006).
 *
 * Reads `testdata/safety-snapshot-parity.json` — the *same file* the Android suite reads in
 * `SafetySnapshotParityTest.kt` — so the two strict readers cannot drift on which snapshot
 * payloads are recoverable. Only the error *path* is compared, never the human-readable reason.
 *
 * Writing this fixture surfaced two real divergences, both now fixed in `safetySnapshot.ts`:
 * the web reader accepted a `colorInt` outside 32 bits, and it accepted a recurring template whose
 * `nextDate` disagreed with its `nextIndex`. The rules reject both at write time, so accepting them
 * here would hand a rollback a row it cannot write back.
 */

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../testdata/safety-snapshot-parity.json'), 'utf8'),
) as {
  format: string;
  version: number;
  cases: Array<{
    name: string;
    section: string;
    expect: 'accept' | 'reject';
    path?: string;
    count?: number;
    payload: Record<string, unknown>;
  }>;
};

/** Mirrors the dispatch in the Android suite one-for-one. */
function apply(section: string, payload: Record<string, unknown>): unknown {
  switch (section) {
    case 'categories':
      return safety.categories(payload);
    case 'expenses':
      return safety.expenses(payload, 'chunk_0');
    case 'budgets':
      return safety.budgets(payload);
    case 'templates':
      return safety.templates(payload);
    case 'preferences':
      return safety.preferences(payload);
    case 'receipts':
      return safety.receipts(payload.recurringReceipts, 'meta.recurringReceipts');
    case 'counts':
      safety.requireCount(
        safety.declaredCount(payload, 'declared'),
        Number(payload.actual),
        'meta.totalExpenses',
      );
      // A non-null marker, matching the Android dispatcher's `Unit`, so "accept" means the same
      // thing in both suites: the call returned without throwing.
      return true;
    case 'chunkCount':
      return safety.chunkCount(payload, 'chunkCount');
    default:
      throw new Error(`unknown section "${section}"`);
  }
}

function sizeOf(result: unknown): number {
  if (result === null || result === undefined) return 0;
  if (Array.isArray(result)) return result.length;
  if (typeof result === 'number') return result;
  throw new Error(`cannot take a size of ${typeof result}`);
}

describe('safety snapshot parity (shared fixture with Android)', () => {
  it('declares the fixture format this suite understands', () => {
    expect(fixture.format).toBe('ausgegeben-safety-snapshot-parity');
    expect(fixture.version).toBe(1);
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      if (testCase.expect === 'accept') {
        const result = apply(testCase.section, testCase.payload);
        if (testCase.count !== undefined) {
          expect(sizeOf(result)).toBe(testCase.count);
        } else {
          expect(result).not.toBeNull();
          expect(result).not.toBeUndefined();
        }
        return;
      }
      let caught: unknown;
      try {
        apply(testCase.section, testCase.payload);
      } catch (error) {
        caught = error;
      }
      expect(caught, `expected the reader to refuse this payload`).toBeInstanceOf(safety.InvalidSnapshotError);
      expect((caught as Error).message).toContain(`SNAPSHOT_INVALID: ${testCase.path}:`);
    });
  }
});
