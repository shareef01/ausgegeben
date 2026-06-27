import { create } from 'zustand';

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  show: (message: string, actionLabel?: string, onAction?: () => void) => void;
  dismiss: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: '',
  actionLabel: undefined,
  onAction: undefined,
  show: (message, actionLabel, onAction) => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message, actionLabel, onAction });
    hideTimer = setTimeout(() => set({ message: '', actionLabel: undefined, onAction: undefined }), 5000);
  },
  dismiss: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: '', actionLabel: undefined, onAction: undefined });
  },
}));
