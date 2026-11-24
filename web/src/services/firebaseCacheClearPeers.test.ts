import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_CLEAR_HOLD,
  CACHE_CLEAR_KEPT,
  CACHE_CLEAR_RELEASED,
  closeAfterFlushForPeer,
  waitForPeerRelease,
} from '@/services/firebase';

/**
 * The cache-clear handshake between a tab clearing the shared on-disk Firestore cache for a
 * sign-out and a tab of ANOTHER account that holds it open. Before, that tab closed at
 * once and the clearing tab deleted the cache with its unsent writes inside. Real
 * BroadcastChannels (Node has them), one per "tab".
 */
const channels: BroadcastChannel[] = [];
function channel(): BroadcastChannel {
  const c = new BroadcastChannel('cache-clear-peers-test');
  channels.push(c);
  return c;
}

afterEach(() => {
  channels.splice(0).forEach((c) => c.close());
  vi.restoreAllMocks();
});

describe('cache-clear handshake with another account’s tab', () => {
  it('the peer closes only after its unsent writes reached the server, and the clearer waits for that', async () => {
    const clearer = channel();
    const peer = channel();
    let finishFlush!: () => void;
    const flush = new Promise<void>((resolve) => { finishFlush = resolve; });
    const close = vi.fn(async () => {});

    const released = waitForPeerRelease(clearer, 'r1', 20, 5_000);
    const peerDone = closeAfterFlushForPeer(peer, 'r1', () => flush, close, 5_000);
    // Well past the grace period, the clearer is still waiting and the peer still open.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(close).not.toHaveBeenCalled();
    let settled = false;
    void released.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishFlush();
    await expect(peerDone).resolves.toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await expect(released).resolves.toBe(true);
  });

  it('a peer whose writes cannot be sent keeps the cache open and the clearer defers the wipe', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clearer = channel();
    const peer = channel();
    const close = vi.fn(async () => {});

    const released = waitForPeerRelease(clearer, 'r2', 20, 5_000);
    const peerDone = closeAfterFlushForPeer(peer, 'r2', () => new Promise(() => {}), close, 60);
    await expect(peerDone).resolves.toBe(false);
    expect(close).not.toHaveBeenCalled();
    await expect(released).resolves.toBe(false);
  });

  it('times out to "not released" when a holding peer never answers again', async () => {
    const clearer = channel();
    const peer = channel();
    const released = waitForPeerRelease(clearer, 'r3', 10, 80);
    peer.postMessage({ type: CACHE_CLEAR_HOLD, requestId: 'r3' });
    await expect(released).resolves.toBe(false);
  });

  it('with no holding peer (none open, or an older build closing silently) it proceeds after the grace period', async () => {
    const clearer = channel();
    const peer = channel();
    const started = Date.now();
    const released = waitForPeerRelease(clearer, 'r4', 30, 5_000);
    // Replies to other requests are ignored.
    peer.postMessage({ type: CACHE_CLEAR_HOLD, requestId: 'other' });
    peer.postMessage({ type: CACHE_CLEAR_KEPT, requestId: 'other' });
    await expect(released).resolves.toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('waits for every holding peer, not just the first to release', async () => {
    const clearer = channel();
    const peerA = channel();
    const released = waitForPeerRelease(clearer, 'r5', 10, 5_000);
    peerA.postMessage({ type: CACHE_CLEAR_HOLD, requestId: 'r5' });
    peerA.postMessage({ type: CACHE_CLEAR_HOLD, requestId: 'r5' });
    peerA.postMessage({ type: CACHE_CLEAR_RELEASED, requestId: 'r5' });
    let settled = false;
    void released.then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(settled).toBe(false);
    peerA.postMessage({ type: CACHE_CLEAR_RELEASED, requestId: 'r5' });
    await expect(released).resolves.toBe(true);
  });

  it('a flush rejected because the peer’s user changed still releases the cache', async () => {
    const clearer = channel();
    const peer = channel();
    const close = vi.fn(async () => {});
    const released = waitForPeerRelease(clearer, 'r6', 10, 5_000);
    await expect(closeAfterFlushForPeer(peer, 'r6', () => Promise.reject(new Error('user changed')), close)).resolves.toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await expect(released).resolves.toBe(true);
  });
});
