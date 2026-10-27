import { create } from 'zustand';
import { t } from '@/i18n';
import { isFirestoreCachePersistent } from '@/services/firebase';
import { useToastStore } from '@/services/toastStore';

/**
 * Writes Firestore has accepted locally but the server has not yet acknowledged.
 *
 * A modular-SDK write promise settles only on the server's acknowledgement, so awaiting
 * one with no connection never returns — Save spun forever while the entry already sat in
 * the local queue. Repository writes now hand such promises here instead (see
 * `settleOrQueue` in expenseRepository) and report the save as done.
 *
 * With the default memory cache that queue lives only in this tab, so closing it before
 * the connection returns loses the entry. While anything is pending in that mode the tab
 * asks before unloading. With trusted-device storage the SDK keeps the queue in IndexedDB
 * and replays it on the next visit, so no prompt is needed.
 */
interface QueuedWritesState {
  pending: number;
}

export const useQueuedWritesStore = create<QueuedWritesState>(() => ({ pending: 0 }));

function blockUnloadWhileQueued(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Older browsers only show the prompt when returnValue is set.
  event.returnValue = '';
}

let unloadGuardBound = false;

function syncUnloadGuard(pending: number): void {
  if (typeof window === 'undefined') return;
  const wanted = pending > 0 && !isFirestoreCachePersistent();
  if (wanted && !unloadGuardBound) {
    window.addEventListener('beforeunload', blockUnloadWhileQueued);
    unloadGuardBound = true;
  } else if (!wanted && unloadGuardBound) {
    window.removeEventListener('beforeunload', blockUnloadWhileQueued);
    unloadGuardBound = false;
  }
}

function adjustPending(delta: number): void {
  const pending = Math.max(0, useQueuedWritesStore.getState().pending + delta);
  useQueuedWritesStore.setState({ pending });
  syncUnloadGuard(pending);
}

/**
 * Track a write that is queued locally until `ack` settles. A later rejection (rules
 * refusing it once the connection returns, for example) is shown to the user: the SDK
 * has already rolled the entry back out of the local view, so without a message it would
 * just vanish.
 */
export function trackQueuedWrite(ack: Promise<unknown>): void {
  adjustPending(1);
  ack.then(
    () => adjustPending(-1),
    (error: unknown) => {
      adjustPending(-1);
      console.error('[queuedWrites] a queued write was rejected by the server', error);
      useToastStore.getState().show(t('queuedWriteRejected'));
    },
  );
}

/** True while at least one write is waiting for the server. */
export function hasQueuedWrites(): boolean {
  return useQueuedWritesStore.getState().pending > 0;
}

export function resetQueuedWritesForTests(): void {
  useQueuedWritesStore.setState({ pending: 0 });
  syncUnloadGuard(0);
}
