import { create } from 'zustand';
import type { User } from 'firebase/auth';

interface AuthStore {
  user: User | null;
  ready: boolean;
  syncing: boolean;
  setUser: (user: User | null) => void;
  setReady: (ready: boolean) => void;
  setSyncing: (syncing: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  ready: false,
  syncing: false,
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  setSyncing: (syncing) => set({ syncing }),
}));
