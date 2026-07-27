import { create } from 'zustand';

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the toast times out or is dismissed without tapping the action. */
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

export const useToastStore = create<ToastState>((set, get) => ({
  message: '',
  actionLabel: undefined,
  onAction: undefined,
  onDismiss: undefined,
  show: (message, actionLabel, onAction, onDismiss) => {
    if (hideTimer) clearTimeout(hideTimer);
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
}));
