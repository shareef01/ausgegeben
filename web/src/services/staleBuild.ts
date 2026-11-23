import { create } from 'zustand';
import { hasQueuedWrites, useQueuedWritesStore } from '@/services/queuedWrites';

/**
 * Keeps a running tab working across a PWA update without dropping unsynced writes.
 *
 * The service worker is generated with `skipWaiting` + `clientsClaim` and
 * `cleanupOutdatedCaches`: when a deploy is picked up (any new tab or launch triggers the
 * check), the new worker takes over tabs that are already open and deletes the previous
 * build's precache. Those tabs are not reloaded, so they keep running the old code — and
 * the old build's lazily loaded screens (Add, Settings, Insights, Categories) no longer
 * exist in the cache or on Hosting, where an unknown path is rewritten to index.html.
 * Opening one of those screens then rejects with "Failed to fetch dynamically imported
 * module" (reproduced in web/qa/pwa-update-repro.mjs).
 *
 * Before this guard that rejection reached the root error boundary, and its only exits
 * were reload buttons. With the default memory-only Firestore cache, writes made offline
 * live only in this tab until the server acknowledges them, so a reload lost them unless
 * the browser happened to honour the `beforeunload` prompt (installed PWAs and mobile
 * browsers often do not).
 *
 * Now: lazy screens are fetched once the shell is idle, so a later cache swap cannot
 * strand them; and if a chunk is gone anyway, the tab reloads into the new build only
 * once no write is waiting for the server.
 */

interface StaleBuildState {
  /** A chunk of the running build could not be loaded; a reload is scheduled. */
  stale: boolean;
  /** The reload is being held back until queued writes reach the server. */
  waitingForWrites: boolean;
}

export const useStaleBuildStore = create<StaleBuildState>(() => ({ stale: false, waitingForWrites: false }));

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite's CSS preload helper
  /'text\/html' is not a valid javascript mime type/i,
];

/** True for the errors a browser raises when a lazily imported chunk cannot be fetched. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (error instanceof Error && error.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

let reloadImpl: () => void = () => window.location.reload();
let unsubscribeWrites: (() => void) | null = null;

/**
 * Reload into the deployed build as soon as doing so cannot lose data: immediately when
 * nothing is queued, otherwise the moment the last queued write is acknowledged (or the
 * queue is discarded because the account changed). Idempotent.
 */
export function requestReloadWhenSafe(): void {
  if (useStaleBuildStore.getState().stale) return;
  if (!hasQueuedWrites()) {
    useStaleBuildStore.setState({ stale: true, waitingForWrites: false });
    reloadImpl();
    return;
  }
  useStaleBuildStore.setState({ stale: true, waitingForWrites: true });
  unsubscribeWrites = useQueuedWritesStore.subscribe((state) => {
    if (state.pending > 0) return;
    unsubscribeWrites?.();
    unsubscribeWrites = null;
    useStaleBuildStore.setState({ waitingForWrites: false });
    reloadImpl();
  });
}

/**
 * Wrap a lazy-import factory so a missing chunk schedules a safe reload instead of
 * crashing the whole app into the error boundary. `fallback` renders in the screen's
 * place meanwhile, leaving the rest of the shell (and the Firestore instance holding the
 * write queue) alive.
 */
export function guardChunkImport<T>(load: () => Promise<T>, fallback: () => T): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      if (!isChunkLoadError(error)) throw error;
      requestReloadWhenSafe();
      return fallback();
    });
}

/**
 * Fetch and evaluate the given lazy chunks while this build's precache is still intact.
 * Once evaluated, a dynamic import resolves from the module map with no network or cache
 * access, so a later service-worker swap cannot strand the screen. A chunk that is
 * already missing means this tab started on an outdated build: reload when safe.
 */
export async function preloadChunks(loaders: ReadonlyArray<() => Promise<unknown>>): Promise<void> {
  const results = await Promise.allSettled(loaders.map((load) => load()));
  if (results.some((result) => result.status === 'rejected' && isChunkLoadError(result.reason))) {
    requestReloadWhenSafe();
  }
}

/** Vite fires this on window when its own preload helper fails to fetch a dependency. */
export function installPreloadErrorHandler(target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('vite:preloadError', () => requestReloadWhenSafe());
}

export function setReloadForTests(fn: () => void): void {
  reloadImpl = fn;
}

export function resetStaleBuildForTests(): void {
  unsubscribeWrites?.();
  unsubscribeWrites = null;
  useStaleBuildStore.setState({ stale: false, waitingForWrites: false });
  reloadImpl = () => window.location.reload();
}
