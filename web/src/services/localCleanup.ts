import { clearExpenseSubmissionJournal } from '@/services/expenseSubmissionJournal';
import {
  clearLocalFirestoreCache,
  clearResidualAuthStorage,
  resetPersistentStorageEnabled,
  setPersistentAuthEnabled,
} from '@/services/firebase';
import { clearStoredOnboarding } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';

/**
 * Account cleanup after sign-out or account deletion.
 *
 * The old flow chained independent local wipes with `await`: a failure clearing one
 * store (most often the Firestore IndexedDB cache) skipped every later step, even though
 * the cloud data and Auth identity were already gone. This module runs every step,
 * collects the outcomes, and leaves a durable marker when anything failed so the next
 * launch can retry the remaining local cleanup without an authentication token.
 *
 * Ordering is deliberate: the Firestore cache is the largest financial-data store and is
 * attempted first. No step depends on a previous one having succeeded.
 */

export type LocalCleanupMode = 'sign-out' | 'delete-account';

export type LocalCleanupStepId =
  | 'firestore-cache'
  | 'submission-journal'
  | 'onboarding-flag'
  | 'auth-storage'
  | 'auth-persistence'
  | 'storage-preference';

export interface LocalCleanupStepResult {
  id: LocalCleanupStepId;
  ok: boolean;
  error?: unknown;
}

export interface LocalCleanupResult {
  /** True only when every applicable step reported success. */
  complete: boolean;
  /** True when a durable pending marker was stored, so the next launch can retry. */
  retryable: boolean;
  /** True when the pending marker write itself succeeded. */
  pendingRecorded: boolean;
  steps: LocalCleanupStepResult[];
}

export interface LocalCleanupOptions {
  uid: string;
  mode: LocalCleanupMode;
  /** Bound on the submission-journal wipe (default 10 s). */
  journalTimeoutMs?: number;
  /** Bound on the Firestore-cache wipe (default 20 s). */
  cacheTimeoutMs?: number;
}

export interface PendingLocalCleanup {
  uid: string;
  mode: LocalCleanupMode;
  requestedAt: number;
}

/**
 * Everything the cleanup needs, injectable so each failure mode can be tested without a
 * browser or real IndexedDB. The defaults are the production implementations.
 */
export interface LocalCleanupDeps {
  clearSubmissionJournal: (uid: string) => Promise<boolean>;
  clearOnboardingFlag: (uid: string) => boolean;
  clearResidualAuthStorage: () => boolean;
  disableAuthPersistence: () => boolean;
  disableStoragePreference: () => boolean;
  /** `uid`: the account being cleaned up, so other accounts' memory-only tabs are left alone. */
  clearFirestoreCache: (uid: string) => Promise<void>;
  readPending: () => PendingLocalCleanup | null;
  writePending: (pending: PendingLocalCleanup) => boolean;
  removePending: () => boolean;
  now: () => number;
}

/** Thrown by the session-ending services when any local step failed. */
export class LocalCleanupError extends Error {
  constructor(readonly result: LocalCleanupResult) {
    super('local_cleanup_failed');
    this.name = 'LocalCleanupError';
  }
}

export const LOCAL_CLEANUP_PENDING_KEY = 'ausgegeben-local-cleanup-pending-v1';

const DEFAULT_JOURNAL_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TIMEOUT_MS = 20_000;

/**
 * A marker records only an opaque uid, a mode and a timestamp — never a transaction,
 * amount, note or credential. It exists so an interrupted cleanup can finish on a later
 * launch, when no authentication token exists or is needed.
 */
function readPendingFromStorage(): PendingLocalCleanup | null {
  try {
    const raw = localStorage.getItem(LOCAL_CLEANUP_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingLocalCleanup>;
    if (typeof parsed.uid !== 'string' || parsed.uid.length === 0) return null;
    if (parsed.mode !== 'sign-out' && parsed.mode !== 'delete-account') return null;
    return {
      uid: parsed.uid,
      mode: parsed.mode,
      requestedAt: typeof parsed.requestedAt === 'number' ? parsed.requestedAt : 0,
    };
  } catch {
    return null;
  }
}

function writePendingToStorage(pending: PendingLocalCleanup): boolean {
  try {
    localStorage.setItem(LOCAL_CLEANUP_PENDING_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

function removePendingFromStorage(): boolean {
  try {
    localStorage.removeItem(LOCAL_CLEANUP_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

const defaultDeps: LocalCleanupDeps = {
  // Arrow wrappers, not direct references: the exported bindings stay live, so tests and
  // future instrumentation can observe/replace a step without rebuilding this object.
  clearSubmissionJournal: (uid) => clearExpenseSubmissionJournal(uid),
  clearOnboardingFlag: (uid) => clearStoredOnboarding(uid),
  clearResidualAuthStorage: () => clearResidualAuthStorage(),
  // Returning false here means storage itself refused the write; that is not proof the
  // flag is gone, so cleanup reports it as a failed step instead of assuming success.
  disableAuthPersistence: () => setPersistentAuthEnabled(false),
  disableStoragePreference: () => resetPersistentStorageEnabled(),
  clearFirestoreCache: (uid) => clearLocalFirestoreCache(true, uid || null),
  readPending: () => readPendingFromStorage(),
  writePending: (pending) => writePendingToStorage(pending),
  removePending: () => removePendingFromStorage(),
  now: () => Date.now(),
};

const STEPS_BY_MODE: Record<LocalCleanupMode, readonly LocalCleanupStepId[]> = {
  'sign-out': [
    'firestore-cache',
    'submission-journal',
    'auth-storage',
    'auth-persistence',
    'storage-preference',
  ],
  'delete-account': [
    'firestore-cache',
    'submission-journal',
    'onboarding-flag',
    'auth-storage',
    'auth-persistence',
    'storage-preference',
  ],
};

/**
 * Reject after `ms` without leaving the original promise's eventual rejection unhandled.
 * Used so a blocked IndexedDB connection cannot hang sign-out or account deletion forever.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function runStep(
  id: LocalCleanupStepId,
  options: LocalCleanupOptions,
  deps: LocalCleanupDeps,
): Promise<void> {
  switch (id) {
    case 'firestore-cache':
      await withTimeout(
        deps.clearFirestoreCache(options.uid),
        options.cacheTimeoutMs ?? DEFAULT_CACHE_TIMEOUT_MS,
        id,
      );
      return;
    case 'submission-journal': {
      const cleared = await withTimeout(
        deps.clearSubmissionJournal(options.uid),
        options.journalTimeoutMs ?? DEFAULT_JOURNAL_TIMEOUT_MS,
        id,
      );
      if (!cleared) throw new Error('submission_journal_not_cleared');
      return;
    }
    case 'onboarding-flag':
      if (!deps.clearOnboardingFlag(options.uid)) throw new Error('onboarding_flag_not_cleared');
      return;
    case 'auth-storage':
      if (!deps.clearResidualAuthStorage()) throw new Error('auth_storage_not_cleared');
      return;
    case 'auth-persistence':
      if (!deps.disableAuthPersistence()) throw new Error('auth_persistence_not_reset');
      return;
    case 'storage-preference':
      if (!deps.disableStoragePreference()) throw new Error('storage_preference_not_reset');
      return;
  }
}

/**
 * Run every applicable local cleanup step, even if one fails.
 *
 * The pending marker is written first. It is removed only when every step succeeded, so
 * a partial wipe is retried on the next launch (see [retryPendingLocalCleanup]). The
 * returned `complete` flag is the only thing callers may present as a successful local
 * deletion; `retryable` says whether that retry was actually persisted.
 */
export async function runLocalCleanup(
  options: LocalCleanupOptions,
  deps: LocalCleanupDeps = defaultDeps,
): Promise<LocalCleanupResult> {
  const requestedAt = deps.now();
  const pending: PendingLocalCleanup = {
    uid: options.uid,
    mode: options.mode,
    requestedAt,
  };
  const pendingRecorded = deps.writePending(pending);

  const steps: LocalCleanupStepResult[] = [];
  for (const id of STEPS_BY_MODE[options.mode]) {
    try {
      await runStep(id, options, deps);
      steps.push({ id, ok: true });
    } catch (error) {
      steps.push({ id, ok: false, error });
    }
  }

  const complete = steps.every((step) => step.ok);
  if (complete) {
    // A stale marker only causes a harmless idempotent retry, so a removal failure is
    // not allowed to make an already-complete data wipe look incomplete.
    try {
      deps.removePending();
    } catch {
      // Ignore; the next launch re-runs the (successful) steps.
    }
  }

  let retryable = false;
  if (!complete && pendingRecorded) {
    try {
      const stored = deps.readPending();
      retryable = stored?.uid === options.uid && stored.mode === options.mode;
    } catch {
      retryable = false;
    }
  }

  return { complete, retryable, pendingRecorded, steps };
}

export function hasPendingLocalCleanup(): boolean {
  return readPendingFromStorage() !== null;
}

let retryInFlight: Promise<LocalCleanupResult | null> | null = null;

/**
 * Finish a cleanup that a previous launch could not complete.
 *
 * Runs only when no account is signed in: the Firestore cache is origin-wide, and
 * clearing it while another account is active could discard that account's queued
 * offline writes. The submission journal and onboarding marker are uid-scoped, but the
 * guard keeps the whole retry atomic with respect to the active session.
 */
export function retryPendingLocalCleanup(): Promise<LocalCleanupResult | null> {
  if (retryInFlight) return retryInFlight;
  retryInFlight = (async () => {
    const pending = readPendingFromStorage();
    if (!pending) {
      // Drop an unparseable marker so it cannot cause a retry loop.
      removePendingFromStorage();
      return null;
    }
    if (useAuthStore.getState().user) return null;
    const result = await runLocalCleanup({ uid: pending.uid, mode: pending.mode });
    if (!result.complete) {
      console.warn('[localCleanup] retry did not finish', {
        retryable: result.retryable,
        failed: result.steps.filter((step) => !step.ok).map((step) => step.id),
      });
    }
    return result;
  })().finally(() => {
    retryInFlight = null;
  });
  return retryInFlight;
}

/** Test-only: forget the in-flight retry so cases cannot share it. */
export function resetLocalCleanupForTests(): void {
  retryInFlight = null;
}
