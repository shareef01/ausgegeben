import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/firebase', () => ({ isFirestoreCachePersistent: () => false }));

const { resetQueuedWritesForTests, trackQueuedWrite } = await import('@/services/queuedWrites');
const {
  guardChunkImport,
  installPreloadErrorHandler,
  isChunkLoadError,
  preloadChunks,
  requestReloadWhenSafe,
  resetStaleBuildForTests,
  setReloadForTests,
  useStaleBuildStore,
} = await import('@/services/staleBuild');
const { useAuthStore } = await import('@/services/authStore');

/** A write whose server acknowledgement the test settles by hand. */
function pendingAck() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}

const chunkError = () =>
  new TypeError('Failed to fetch dynamically imported module: https://x/assets/SettingsView-CcDjIwp8.js');

describe('stale build guard (PWA update vs unsynced writes)', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    resetQueuedWritesForTests();
    resetStaleBuildForTests();
    reload = vi.fn<() => void>();
    setReloadForTests(reload);
  });
  afterEach(() => {
    useAuthStore.getState().setUser(null);
    resetQueuedWritesForTests();
    resetStaleBuildForTests();
    vi.unstubAllGlobals();
  });

  it('recognises the chunk-load errors each engine raises, and nothing else', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isChunkLoadError(new Error('permission-denied'))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'amount')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('reloads at once when nothing is waiting to sync', () => {
    requestReloadWhenSafe();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(useStaleBuildStore.getState()).toMatchObject({ stale: true, waitingForWrites: false });
  });

  it('holds the reload while a memory-only write is unacknowledged, then reloads once it lands', async () => {
    const first = pendingAck();
    const second = pendingAck();
    trackQueuedWrite(first.promise);
    trackQueuedWrite(second.promise);

    requestReloadWhenSafe();
    expect(reload).not.toHaveBeenCalled();
    expect(useStaleBuildStore.getState().waitingForWrites).toBe(true);

    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled(); // one write still only in this tab

    second.resolve();
    await second.promise;
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(useStaleBuildStore.getState().waitingForWrites).toBe(false);
  });

  it('is idempotent: repeated chunk failures schedule one reload', async () => {
    const ack = pendingAck();
    trackQueuedWrite(ack.promise);
    requestReloadWhenSafe();
    requestReloadWhenSafe();
    ack.resolve();
    await ack.promise;
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('turns a missing chunk into the fallback screen instead of a crash, and schedules the reload', async () => {
    const ack = pendingAck();
    trackQueuedWrite(ack.promise);
    const fallback = { default: 'notice' };
    const load = guardChunkImport(() => Promise.reject(chunkError()), () => fallback);

    await expect(load()).resolves.toBe(fallback);
    expect(reload).not.toHaveBeenCalled();
    expect(useStaleBuildStore.getState().stale).toBe(true);
  });

  it('still surfaces errors that are not chunk failures', async () => {
    const boom = new Error('module threw while evaluating');
    const load = guardChunkImport(() => Promise.reject(boom), () => ({ default: 'notice' }));
    await expect(load()).rejects.toBe(boom);
    expect(reload).not.toHaveBeenCalled();
  });

  it('preloading reloads only when a chunk is already gone', async () => {
    await preloadChunks([() => Promise.resolve({}), () => Promise.resolve({})]);
    expect(reload).not.toHaveBeenCalled();
    await preloadChunks([() => Promise.resolve({}), () => Promise.reject(chunkError())]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("listens for Vite's preload failures", () => {
    const target = { addEventListener: vi.fn() };
    installPreloadErrorHandler(target as unknown as Window);
    expect(target.addEventListener).toHaveBeenCalledWith('vite:preloadError', expect.any(Function));
    (target.addEventListener.mock.calls[0][1] as () => void)();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
