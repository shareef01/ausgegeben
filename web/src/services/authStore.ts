import { create } from 'zustand';
import type { User } from 'firebase/auth';

interface AuthStore {
  user: User | null;
  ready: boolean;
  syncing: boolean;
  syncError: string | null;
  setUser: (user: User | null) => void;
  setReady: (ready: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  ready: false,
  syncing: false,
  syncError: null,
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),
}));
