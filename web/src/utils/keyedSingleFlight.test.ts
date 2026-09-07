import { describe, expect, it } from 'vitest';
import { KeyedSingleFlight } from '@/utils/keyedSingleFlight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('KeyedSingleFlight', () => {
  it('does not let account A completion clear account B flight', async () => {
    const flights = new KeyedSingleFlight<string>();
    const a = deferred<string>();
    const b = deferred<string>();
    const firstA = flights.run('A', () => a.promise);
    const firstB = flights.run('B', () => b.promise);
    a.resolve('a');
    await firstA;
    const joinedB = flights.run('B', () => Promise.resolve('wrong replacement'));
    expect(joinedB).toBe(firstB);
    b.resolve('b');
    await expect(joinedB).resolves.toBe('b');
  });

  it('shares 20 same-key callers and permits retry after failure', async () => {
    const flights = new KeyedSingleFlight<string>();
    const gate = deferred<number>();
    let calls = 0;
    const work = () => { calls += 1; return gate.promise; };
    const callers = Array.from({ length: 20 }, () => flights.run('A', work));
    await Promise.resolve();
    expect(calls).toBe(1);
    gate.resolve(7);
    await expect(Promise.all(callers)).resolves.toEqual(Array(20).fill(7));

    await expect(flights.run('A', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    await expect(flights.run('A', async () => 9)).resolves.toBe(9);
  });
});
