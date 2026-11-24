import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_CLEANUP_PENDING_KEY,
  hasPendingLocalCleanup,
  resetLocalCleanupForTests,
  retryPendingLocalCleanup,
  runLocalCleanup,
  type LocalCleanupDeps,
  type LocalCleanupResult,
  type LocalCleanupStepId,
} from './localCleanup';
import { useAuthStore } from './authStore';

const DELETE_STEPS: LocalCleanupStepId[] = [
  'firestore-cache',
  'submission-journal',
  'onboarding-flag',
  'auth-storage',
  'auth-persistence',
  'storage-preference',
];
const SIGN_OUT_STEPS: LocalCleanupStepId[] = [
  'firestore-cache',
  'submission-journal',
  'auth-storage',
  'auth-persistence',
  'storage-preference',
];

interface Harness {
  deps: LocalCleanupDeps;
  calls: string[];
  marker: { current: { uid: string; mode: 'sign-out' | 'delete-account'; requestedAt: number } | null };
}

function makeDeps(overrides: Partial<LocalCleanupDeps> = {}): Harness {
  const calls: string[] = [];
  const marker: Harness['marker'] = { current: null };
  const deps: LocalCleanupDeps = {
    clearSubmissionJournal: vi.fn(async (uid: string) => {
      calls.push(`journal:${uid}`);
      return true;
    }),
    clearOnboardingFlag: vi.fn((uid: string) => {
      calls.push(`onboarding:${uid}`);
      return true;
    }),
    clearResidualAuthStorage: vi.fn(() => {
      calls.push('auth-storage');
      return true;
    }),
    disableAuthPersistence: vi.fn(() => {
      calls.push('auth-persistence');
      return true;
    }),
    disableStoragePreference: vi.fn(() => {
      calls.push('storage-preference');
      return true;
    }),
    clearFirestoreCache: vi.fn(async () => {
      calls.push('cache');
    }),
    readPending: vi.fn(() => marker.current),
    writePending: vi.fn((pending) => {
      marker.current = pending;
      return true;
    }),
    removePending: vi.fn(() => {
      marker.current = null;
      return true;
    }),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
  return { deps, calls, marker };
}

function failedIds(result: LocalCleanupResult): LocalCleanupStepId[] {
  return result.steps.filter((step) => !step.ok).map((step) => step.id);
}

describe('account local cleanup', () => {
  afterEach(() => {
    resetLocalCleanupForTests();
    useAuthStore.setState({ user: null });
    vi.unstubAllGlobals();
  });

  // The cache-clear message names the account, so a different account's memory-only tab
  // keeps its Firestore instance and the writes still queued in it.
  it('clears the Firestore cache on behalf of the account being cleaned up', async () => {
    const { deps } = makeDeps();
    await runLocalCleanup({ uid: 'alice', mode: 'sign-out' }, deps);
    expect(deps.clearFirestoreCache).toHaveBeenCalledWith('alice');
  });

  it('runs every delete-account step and reports a clean wipe', async () => {
    const { deps, calls, marker } = makeDeps();
    const result = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, deps);

    expect(result).toMatchObject({ complete: true, retryable: false, pendingRecorded: true });
    expect(result.steps.map((step) => step.id)).toEqual(DELETE_STEPS);
    expect(calls).toEqual([
      'cache',
      'journal:alice',
      'onboarding:alice',
      'auth-storage',
      'auth-persistence',
      'storage-preference',
    ]);
    expect(marker.current).toBeNull();
  });

  it('does not touch the account onboarding marker on sign-out', async () => {
    const { deps, calls } = makeDeps();
    const result = await runLocalCleanup({ uid: 'alice', mode: 'sign-out' }, deps);

    expect(result.complete).toBe(true);
    expect(result.steps.map((step) => step.id)).toEqual(SIGN_OUT_STEPS);
    expect(calls.some((call) => call.startsWith('onboarding:'))).toBe(false);
  });

  it('keeps going after a journal failure and leaves a retryable marker', async () => {
    const { deps, calls, marker } = makeDeps({
      clearSubmissionJournal: vi.fn(async () => false),
    });
    const result = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, deps);

    expect(result.complete).toBe(false);
    expect(result.retryable).toBe(true);
    expect(failedIds(result)).toEqual(['submission-journal']);
    // Every later step still ran.
    expect(calls).toEqual([
      'cache',
      'onboarding:alice',
      'auth-storage',
      'auth-persistence',
      'storage-preference',
    ]);
    expect(marker.current?.uid).toBe('alice');
    expect(marker.current?.mode).toBe('delete-account');
  });

  it('keeps going after a Firestore cache failure and reports it as the only failure', async () => {
    const { deps } = makeDeps({
      clearFirestoreCache: vi.fn(async () => {
        throw new Error('clear_firestore_cache_failed');
      }),
    });
    const result = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, deps);

    expect(result.complete).toBe(false);
    expect(failedIds(result)).toEqual(['firestore-cache']);
    expect(result.steps.find((step) => step.id === 'submission-journal')?.ok).toBe(true);
  });

  it('reports each independent storage failure instead of stopping at the first', async () => {
    const { deps } = makeDeps({
      clearResidualAuthStorage: vi.fn(() => false),
      disableAuthPersistence: vi.fn(() => false),
      disableStoragePreference: vi.fn(() => false),
    });
    const result = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, deps);

    expect(result.complete).toBe(false);
    expect(failedIds(result)).toEqual(['auth-storage', 'auth-persistence', 'storage-preference']);
  });

  it('fails a delete-account cleanup when the onboarding marker cannot be removed', async () => {
    const { deps } = makeDeps({ clearOnboardingFlag: vi.fn(() => false) });
    const result = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, deps);

    expect(result.complete).toBe(false);
    expect(failedIds(result)).toEqual(['onboarding-flag']);
  });

  it('reports non-retryable when the pending marker itself cannot be stored', async () => {
    const { deps } = makeDeps({
      writePending: vi.fn(() => false),
      readPending: vi.fn(() => null),
      clearFirestoreCache: vi.fn(async () => {
        throw new Error('blocked');
      }),
    });
    const result = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, deps);

    expect(result).toMatchObject({ complete: false, retryable: false, pendingRecorded: false });
    // The wipe was still attempted in full.
    expect(result.steps).toHaveLength(DELETE_STEPS.length);
  });

  it('succeeds on a retry after a partial failure and removes the marker', async () => {
    const first = makeDeps({
      clearFirestoreCache: vi.fn(async () => {
        throw new Error('blocked');
      }),
    });
    const partial = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, first.deps);
    expect(partial.complete).toBe(false);
    expect(first.marker.current).not.toBeNull();

    const second = makeDeps({ readPending: vi.fn(() => first.marker.current) });
    second.marker.current = first.marker.current;
    const retried = await runLocalCleanup({ uid: 'alice', mode: 'delete-account' }, second.deps);

    expect(retried.complete).toBe(true);
    expect(second.marker.current).toBeNull();
  });

  it('bounds a blocked cache wipe so the remaining steps still run', async () => {
    const never = new Promise<void>(() => {});
    const { deps } = makeDeps({ clearFirestoreCache: vi.fn(() => never) });
    const result = await runLocalCleanup(
      { uid: 'alice', mode: 'sign-out', cacheTimeoutMs: 5 },
      deps,
    );

    expect(result.complete).toBe(false);
    expect(failedIds(result)).toEqual(['firestore-cache']);
    expect(result.steps.find((step) => step.id === 'auth-storage')?.ok).toBe(true);
  });
});

describe('pending cleanup retry on launch', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    resetLocalCleanupForTests();
  });

  afterEach(() => {
    useAuthStore.setState({ user: null });
    resetLocalCleanupForTests();
    vi.unstubAllGlobals();
  });

  it('finishes a persisted sign-out cleanup when no account is signed in', async () => {
    values.set(
      LOCAL_CLEANUP_PENDING_KEY,
      JSON.stringify({ uid: 'alice', mode: 'sign-out', requestedAt: 1 }),
    );
    expect(hasPendingLocalCleanup()).toBe(true);

    const result = await retryPendingLocalCleanup();

    expect(result?.complete).toBe(true);
    expect(hasPendingLocalCleanup()).toBe(false);
  });

  it('does not clear the shared cache while another account is active', async () => {
    values.set(
      LOCAL_CLEANUP_PENDING_KEY,
      JSON.stringify({ uid: 'alice', mode: 'sign-out', requestedAt: 1 }),
    );
    useAuthStore.setState({
      user: { uid: 'bob', email: null, displayName: null, emailVerified: true },
    });

    expect(await retryPendingLocalCleanup()).toBeNull();
    expect(hasPendingLocalCleanup()).toBe(true);
  });

  it('drops an unreadable marker instead of retrying it forever', async () => {
    values.set(LOCAL_CLEANUP_PENDING_KEY, '{not json');

    expect(await retryPendingLocalCleanup()).toBeNull();
    expect(values.has(LOCAL_CLEANUP_PENDING_KEY)).toBe(false);
  });

  it('ignores markers for overlay routes or unknown modes', async () => {
    values.set(
      LOCAL_CLEANUP_PENDING_KEY,
      JSON.stringify({ uid: 'alice', mode: 'something-else', requestedAt: 1 }),
    );

    expect(await retryPendingLocalCleanup()).toBeNull();
    // The invalid marker is removed, not left to trip every launch.
    expect(values.has(LOCAL_CLEANUP_PENDING_KEY)).toBe(false);
  });
});
