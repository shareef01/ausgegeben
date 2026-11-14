import { describe, expect, it } from 'vitest';
import { MAX_CATCH_UP_CONTINUATIONS, runCatchUp } from './catchUpLoop';

const noWait = () => Promise.resolve();

describe('runCatchUp (AUS-202)', () => {
  it('runs one pass when the backlog fits in it', async () => {
    let calls = 0;
    const passes = await runCatchUp(async () => { calls++; return false; }, () => true, noWait);
    expect(passes).toBe(1);
    expect(calls).toBe(1);
  });

  it('keeps going until a pass reports nothing left (45 due dates at 20 per pass)', async () => {
    let remaining = 45;
    const passes = await runCatchUp(async () => {
      remaining -= Math.min(20, remaining);
      return remaining > 0;
    }, () => true, noWait);
    expect(remaining).toBe(0);
    expect(passes).toBe(3);
  });

  it('pauses between passes', async () => {
    const waits: number[] = [];
    let left = 2;
    await runCatchUp(async () => --left > 0, () => true, async (ms) => { waits.push(ms); });
    expect(waits).toEqual([1_000]);
  });

  it('stops when the session changes', async () => {
    let calls = 0;
    let signedIn = true;
    const passes = await runCatchUp(async () => {
      calls++;
      signedIn = false; // another account signs in while the first pass runs
      return true;
    }, () => signedIn, noWait);
    expect(passes).toBe(1);
    expect(calls).toBe(1);
  });

  it('is bounded even if every pass reports more work', async () => {
    const passes = await runCatchUp(async () => true, () => true, noWait);
    expect(passes).toBe(1 + MAX_CATCH_UP_CONTINUATIONS);
  });

  it('lets a failing pass reject to the caller', async () => {
    let calls = 0;
    await expect(runCatchUp(async () => {
      calls++;
      if (calls === 2) throw new Error('offline');
      return true;
    }, () => true, noWait)).rejects.toThrow('offline');
    expect(calls).toBe(2);
  });
});
