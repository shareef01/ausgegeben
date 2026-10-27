import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const persistent = vi.hoisted(() => ({ value: false }));
vi.mock('@/services/firebase', () => ({ isFirestoreCachePersistent: () => persistent.value }));

const { hasQueuedWrites, resetQueuedWritesForTests, trackQueuedWrite } = await import('@/services/queuedWrites');
const { useToastStore } = await import('@/services/toastStore');

/** A write whose server acknowledgement the test settles by hand. */
function pendingAck() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('queued writes', () => {
  const listeners = new Map<string, EventListener>();

  beforeEach(() => {
    persistent.value = false;
    listeners.clear();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: EventListener) => listeners.set(type, fn),
      removeEventListener: (type: string, fn: EventListener) => {
        if (listeners.get(type) === fn) listeners.delete(type);
      },
    });
    resetQueuedWritesForTests();
  });
  afterEach(() => {
    resetQueuedWritesForTests();
    useToastStore.getState().dismiss();
    vi.unstubAllGlobals();
  });

  it('asks before the tab closes only while a memory-only write is pending', async () => {
    const ack = pendingAck();
    trackQueuedWrite(ack.promise);
    expect(hasQueuedWrites()).toBe(true);
    const guard = listeners.get('beforeunload');
    expect(guard).toBeDefined();
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    guard!(event as unknown as Event);
    expect(event.preventDefault).toHaveBeenCalled();

    ack.resolve();
    await ack.promise;
    await Promise.resolve();
    expect(hasQueuedWrites()).toBe(false);
    expect(listeners.has('beforeunload')).toBe(false);
  });

  it('does not ask when the write queue is kept on disk (trusted device)', () => {
    persistent.value = true;
    trackQueuedWrite(pendingAck().promise);
    expect(hasQueuedWrites()).toBe(true);
    expect(listeners.has('beforeunload')).toBe(false);
  });

  it('tells the user when the server later rejects a queued write', async () => {
    const ack = pendingAck();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    trackQueuedWrite(ack.promise);
    ack.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await ack.promise.catch(() => {});
    await Promise.resolve();
    expect(hasQueuedWrites()).toBe(false);
    expect(useToastStore.getState().message).not.toBe('');
    consoleError.mockRestore();
  });
});
