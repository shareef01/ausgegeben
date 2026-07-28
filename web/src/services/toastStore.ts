import { create } from 'zustand';

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the toast times out, is dismissed, or is replaced by another toast. */
  onDismiss?: () => void;
  show: (
    message: string,
    actionLabel?: string,
    onAction?: () => void,
    onDismiss?: () => void,
  ) => void;
  dismiss: (opts?: { skipDismissCallback?: boolean }) => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideBound = false;

function bindPagehideFlush(getDismiss: () => ToastState['dismiss']) {
  if (pagehideBound || typeof window === 'undefined') return;
  pagehideBound = true;
  window.addEventListener('pagehide', () => {
    getDismiss()();
  });
}

export const useToastStore = create<ToastState>((set, get) => {
  bindPagehideFlush(() => get().dismiss);

  return {
    message: '',
    actionLabel: undefined,
    onAction: undefined,
    onDismiss: undefined,
    show: (message, actionLabel, onAction, onDismiss) => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      // Replacing a toast must still run the prior onDismiss — soft-delete commits
      // live there; skipping it leaves rows hidden until refresh then "undeletes".
      const prevDismiss = get().onDismiss;
      set({ message: '', actionLabel: undefined, onAction: undefined, onDismiss: undefined });
      try {
        prevDismiss?.();
      } catch (err) {
        console.error('[toastStore] previous onDismiss failed', err);
      }
      set({ message, actionLabel, onAction, onDismiss });
      hideTimer = setTimeout(() => {
        hideTimer = null;
        const cb = get().onDismiss;
        set({ message: '', actionLabel: undefined, onAction: undefined, onDismiss: undefined });
        cb?.();
      }, 5000);
    },
    dismiss: (opts) => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      const cb = opts?.skipDismissCallback ? undefined : get().onDismiss;
      set({ message: '', actionLabel: undefined, onAction: undefined, onDismiss: undefined });
      cb?.();
    },
  };
});
